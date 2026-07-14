import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/utils"
import {
  cadastroRevendedorSchema,
  stripDigits,
} from "@/lib/schemas/revendedor-cadastro"
import {
  createCustomer,
  createSubscription,
  cancelSubscription,
  listPayments,
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import { contextLogger } from "@/lib/logger"
import {
  PLANO_GROWTH_VALOR,
  PLANO_GROWTH_DESCRICAO,
} from "@/lib/revendedor/plano"
import { generateUniqueReferralCode } from "@/lib/referrals/code"
import { resolveReferrerFromCookie } from "@/lib/referrals/capture"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { forbiddenNameError } from "@/lib/tenant/forbidden-names"
// Fonte ÚNICA de slugs reservados (inclui "pmb" e "__pmb__"). Antes havia uma
// lista duplicada e DIVERGENTE aqui (sem "pmb"/"__pmb__"), permitindo o cadastro
// de um slug que sequestra o roteamento de webhook para o contexto PMB.
import { RESERVED_SLUGS } from "@/lib/tenant/slug"

function formatDueDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

async function buildUniqueSlug(base: string): Promise<string> {
  const normalized = slugify(base)
  const candidate = RESERVED_SLUGS.has(normalized) ? `${normalized}-loja` : normalized
  const root = candidate || "revendedor"

  let slug = root
  let i = 1
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    i += 1
    slug = `${root}-${i}`
  }
  return slug
}

export const POST = withRequestContext(
  { action: "revendedores.cadastro", route: "/api/revendedores/cadastro" },
  async (request: Request) => {
  const rl = await rateLimit(request, RATE_LIMITS.revendedorCadastro)
  if (!rl.ok) return rateLimitResponse(rl)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: "JSON inválido", code: "INVALID_JSON" },
      { status: 400 },
    )
  }

  const parsed = cadastroRevendedorSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        code: "VALIDATION_ERROR",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const { pessoal, empresa, pagamento, password } = parsed.data

  // Marca reservada (contrato): o nome da unidade (e o subdomínio derivado
  // dele) não podem conter Bolsa Mais Brasil / Profissionaliza / Escola de
  // Ensino a Distância / Livre Cursos.
  const forbidden =
    forbiddenNameError(empresa.fantasia) ?? forbiddenNameError(empresa.razaoSocial)
  if (forbidden) {
    return NextResponse.json(
      {
        error: forbidden,
        code: "FORBIDDEN_NAME",
        fields: { "empresa.fantasia": [forbidden] },
      },
      { status: 400 },
    )
  }

  const existing = await prisma.user.findUnique({
    where: { email: pessoal.email },
  })
  if (existing) {
    return NextResponse.json(
      {
        error: "Já existe uma conta com este email",
        code: "EMAIL_TAKEN",
      },
      { status: 409 },
    )
  }

  const slug = await buildUniqueSlug(empresa.fantasia)
  const passwordHash = await hash(password, 12)
  const cnpjDigits = stripDigits(empresa.cnpj)
  const phoneDigits = stripDigits(pessoal.telefone)

  // CPF do responsável vira identificador alternativo de login (User.cpf,
  // unique). Antes era coletado e DESCARTADO — o dono tentava logar com CPF e
  // falhava. Se o CPF já pertence a outra conta (ex.: mesma pessoa abrindo uma
  // segunda unidade com outro email), o cadastro segue SEM o cpf — bloquear a
  // criação por isso derrubaria um caso legítimo; o login dessa conta fica por
  // email.
  const cpfDigits = stripDigits(pessoal.cpf)
  const cpfTaken = await prisma.user.findUnique({
    where: { cpf: cpfDigits },
    select: { id: true },
  })
  if (cpfTaken) {
    contextLogger().warn(
      { event: "revendedores.cadastro.cpf_taken", slug },
      "CPF do responsável já pertence a outra conta — cadastro segue sem cpf",
    )
  }

  let asaasCustomer: Awaited<ReturnType<typeof createCustomer>>
  try {
    asaasCustomer = await createCustomer({
      name: empresa.razaoSocial,
      email: pessoal.email,
      mobilePhone: phoneDigits,
      cpfCnpj: cnpjDigits,
      externalReference: `tenant_pending_${slug}`,
    })
  } catch (error) {
    const message =
      error instanceof AsaasApiError
        ? error.message
        : "Falha ao criar cliente no Asaas"
    return NextResponse.json(
      { error: message, code: "ASAAS_CUSTOMER_FAILED" },
      { status: 502 },
    )
  }

  let asaasSubscription: Awaited<ReturnType<typeof createSubscription>>
  try {
    asaasSubscription = await createSubscription({
      customer: asaasCustomer.id,
      billingType: pagamento.billingType,
      value: PLANO_GROWTH_VALOR,
      nextDueDate: formatDueDate(3),
      cycle: "MONTHLY",
      description: PLANO_GROWTH_DESCRICAO,
      externalReference: `tenant_pending_${slug}`,
    }, motherAsaasKey())
  } catch (error) {
    const message =
      error instanceof AsaasApiError
        ? error.message
        : "Falha ao criar assinatura no Asaas"
    return NextResponse.json(
      { error: message, code: "ASAAS_SUBSCRIPTION_FAILED" },
      { status: 502 },
    )
  }

  const referralCode = await generateUniqueReferralCode(slug)
  const referrerTenantId = await resolveReferrerFromCookie()

  let createdTenantId: string
  try {
    createdTenantId = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: empresa.fantasia,
          slug,
          status: "PENDING",
          billingMode: "AUTO",
          planValue: new Prisma.Decimal(PLANO_GROWTH_VALOR),
          asaasCustomerId: asaasCustomer.id,
          asaasSubscriptionId: asaasSubscription.id,
          referralCode,
          referrerTenantId,
        },
      })

      await tx.user.create({
        data: {
          email: pessoal.email,
          name: pessoal.nome,
          passwordHash,
          role: "RESELLER",
          tenantId: tenant.id,
          cpf: cpfTaken ? null : cpfDigits,
        },
      })

      return tenant.id
    })
  } catch (error) {
    contextLogger().error(
      { err: error, event: "revendedores.cadastro.db_tx_failed" },
      "cadastro de revendedor: transação no DB falhou",
    )
    // COMPENSAÇÃO: a $transaction falhou DEPOIS de criar customer + subscription
    // na conta Asaas global da PMB (cobrança real, vence em 3 dias). Sem isto, a
    // assinatura ficava ÓRFÃ cobrando mensalmente sem nenhum Tenant correspondente
    // (o webhook não acha tenant e o pagamento fica solto). Cancela a assinatura
    // (best-effort) antes de responder; se a compensação falhar, loga os ids para
    // reconciliação manual.
    await cancelSubscription(asaasSubscription.id).catch((cancelErr) => {
      contextLogger().error(
        {
          err: cancelErr,
          event: "revendedores.cadastro.compensation_failed",
          asaasSubscriptionId: asaasSubscription.id,
          asaasCustomerId: asaasCustomer.id,
        },
        "FALHA ao cancelar assinatura Asaas órfã no rollback do cadastro — reconciliar manualmente",
      )
    })

    // Colisão de unicidade (email/slug) entre o pré-check NÃO-atômico (linha ~111)
    // e o commit da transação: devolve 409 claro em vez de 500 genérico.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Já existe uma conta com este email", code: "EMAIL_TAKEN" },
        { status: 409 },
      )
    }

    return NextResponse.json(
      {
        error: "Falha ao salvar cadastro. Entre em contato com o suporte.",
        code: "PERSIST_FAILED",
      },
      { status: 500 },
    )
  }

  let paymentUrl: string | null = null
  try {
    const payments = await listPayments({
      subscription: asaasSubscription.id,
      limit: 1,
    })
    const firstPayment = payments.data[0] ?? null
    paymentUrl = firstPayment?.invoiceUrl ?? null

    // H7-0: semeia o TenantPayment PENDING já no cadastro — fecha a janela em que
    // isKnownAsaasPayment retorna false e /cobranca dá 404 até o webhook
    // PAYMENT_CREATED chegar. O webhook faz upsert por asaasPaymentId (unique), sem
    // duplicar. Best-effort.
    if (firstPayment) {
      await prisma.tenantPayment
        .create({
          data: {
            tenantId: createdTenantId,
            asaasPaymentId: firstPayment.id,
            amount: PLANO_GROWTH_VALOR,
            billingType: pagamento.billingType,
            status: "PENDING",
            dueDate: new Date(firstPayment.dueDate),
            invoiceUrl: firstPayment.invoiceUrl ?? null,
          },
        })
        .catch(() => null)
    }
  } catch {
    paymentUrl = null
  }

  return NextResponse.json(
    {
      data: {
        slug,
        email: pessoal.email,
        asaasCustomerId: asaasCustomer.id,
        asaasSubscriptionId: asaasSubscription.id,
        paymentUrl,
      },
    },
    { status: 201 },
  )
  },
)
