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
  listPayments,
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

const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "painel",
  "loja",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "staging",
  "dev",
  "test",
])

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
    })
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

  try {
    await prisma.$transaction(async (tx) => {
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
        },
      })
    })
  } catch (error) {
    contextLogger().error(
      { err: error, event: "revendedores.cadastro.db_tx_failed" },
      "cadastro de revendedor: transação no DB falhou",
    )
    return NextResponse.json(
      {
        error: "Falha ao salvar cadastro. Entre em contato com o suporte.",
        code: "PERSIST_FAILED",
        asaasCustomerId: asaasCustomer.id,
        asaasSubscriptionId: asaasSubscription.id,
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
    paymentUrl = payments.data[0]?.invoiceUrl ?? null
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
