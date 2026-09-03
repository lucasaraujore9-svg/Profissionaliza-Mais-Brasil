import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
import { cpfHasRegisteredLogin } from "@/lib/students/cpf-already-registered"
import { provisionStudentAccess } from "@/lib/students/access"
import { buildGuardianWrite } from "@/lib/students/guardian"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { getPlanForCheckout } from "@/lib/subscriptions/plans"
import { isRecurringInterval } from "@/lib/subscriptions/interval"
import { createSubscriptionAtGateway } from "@/lib/subscriptions/checkout"
import { resellerSubscriptionCheckoutSchema } from "@/lib/subscriptions/checkout-schema"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { tenantPolo } from "@/lib/tenant/slug"
import { decryptTenantAsaasKey } from "@/lib/asaas/client"
import { decryptTenantMpToken } from "@/lib/mercadopago/client"
import { contextLogger } from "@/lib/logger"
import { clientIp } from "@/lib/http/client-ip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Janela em que um checkout PENDING (fatura emitida, nao paga) segura o aluno. */
const PENDING_CHECKOUT_TTL_MS = 30 * 60 * 1000

/**
 * Contratacao de assinatura na vitrine da REVENDA.
 *
 * REGRA DE OURO: a cobranca vai SEMPRE para a conta da unidade (MP ou Asaas
 * dela), nunca para a conta-mae. A conta e resolvida aqui e passada explicita a
 * `createSubscriptionAtGateway`; sem chave da unidade, o assert de isolamento
 * daquele modulo LANCA em vez de cobrar no lugar errado.
 *
 * Limite conhecido do MP: a recorrencia (preapproval) exige cartao tokenizado no
 * browser e nao emite fatura de PIX/boleto por ciclo. Unidade no MP so oferece
 * assinatura no cartao; no Asaas, os tres meios.
 */
export const POST = withRequestContext(
  { action: "loja.checkout.assinatura", route: "/api/loja/checkout/assinatura" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)

    // O tenant vem do PROXY (host verificado), nunca do corpo — é o que impede
    // uma loja de cobrar em nome de outra.
    const tenantIdHeader = request.headers.get("x-tenant-id")
    const tenantSlugHeader = request.headers.get("x-tenant-slug")
    if (!tenantIdHeader && !tenantSlugHeader) {
      return NextResponse.json(
        { error: "Loja não identificada", code: "TENANT_MISSING" },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findFirst({
      where: tenantIdHeader ? { id: tenantIdHeader } : { slug: tenantSlugHeader! },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        // `tenantPolo` cai no slug sem isto — e o polo errado na plataforma de aulas.
        poloName: true,
        salesGateway: true,
        asaasApiKey: true,
        asaasWebhookToken: true,
        mpAccessToken: true,
        mpPublicKey: true,
        plataformaVendedorId: true,
      },
    })
    if (!tenant) {
      return NextResponse.json(
        { error: "Loja inválida", code: "TENANT_INVALID" },
        { status: 404 },
      )
    }
    if (tenant.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Esta loja não está disponível no momento", code: "TENANT_INACTIVE" },
        { status: 403 },
      )
    }

    const gateway = tenantCheckoutMode({
      salesGateway: tenant.salesGateway,
      asaasConnected: Boolean(tenant.asaasApiKey && tenant.asaasWebhookToken),
      mpAccessToken: tenant.mpAccessToken,
      mpPublicKey: tenant.mpPublicKey,
    })
    if (gateway === "NONE") {
      return NextResponse.json(
        {
          error: "Esta loja ainda não está pronta para receber pagamentos",
          code: "GATEWAY_NOT_READY",
        },
        { status: 400 },
      )
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = resellerSubscriptionCheckoutSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    if (data.paymentMethod === "CREDIT_CARD" && (!data.creditCard || !data.creditCardHolder)) {
      return NextResponse.json({ error: "Dados do cartão obrigatórios" }, { status: 400 })
    }

    // Preço, escopo e PERIODICIDADE do plano NESTA vitrine (override da unidade
    // aplicado). O corpo diz qual plano, nunca quanto custa nem como é cobrado.
    const plan = await getPlanForCheckout(tenant.id, data.planId)
    if (!plan) {
      return NextResponse.json({ error: "Plano indisponível" }, { status: 404 })
    }

    // MP não faz RECORRÊNCIA com PIX/boleto: o preapproval exige cartão. A
    // restrição é da recorrência, não da loja — um plano VITALÍCIO no MP é uma
    // cobrança comum e aceita os três meios. Por isso a checagem roda depois de
    // carregar o plano: aplicá-la antes recusaria PIX numa compra única que o
    // gateway aceita sem problema.
    if (
      gateway === "MP" &&
      isRecurringInterval(plan.interval) &&
      data.paymentMethod !== "CREDIT_CARD"
    ) {
      return NextResponse.json(
        {
          error: "Esta loja aceita assinatura recorrente apenas no cartão de crédito",
          code: "METHOD_NOT_SUPPORTED",
        },
        { status: 400 },
      )
    }

    if (await cpfHasRegisteredLogin(tenant.id, data.cpf)) {
      return NextResponse.json(
        {
          error: "Este CPF já possui cadastro. Faça login para assinar.",
          code: "CPF_ALREADY_REGISTERED",
          loginUrl: "/login",
        },
        { status: 409 },
      )
    }

    // Checkout ANÔNIMO adiciona responsável, nunca remove.
    const { nascimento, guardian } = buildGuardianWrite(data, { allowClear: false })

    let student
    try {
      student = await upsertStudent({
        tenantId: tenant.id,
        nome: data.nome.trim(),
        email: data.email,
        cpf: data.cpf,
        fone: data.fone,
        endereco: data.endereco,
        polo: tenantPolo(tenant),
        vendedorId: tenant.plataformaVendedorId,
        plataformaAlunoIdFallback: `pending_${Date.now()}`,
        nascimento,
        guardian,
      })
    } catch (err) {
      if (err instanceof StudentEmailConflictError) {
        return NextResponse.json({ error: err.message }, { status: 409 })
      }
      throw err
    }

    await provisionStudentAccess(student.id, {
      isPmbVitrine: false,
      slug: tenant.slug,
    }).catch((err) => {
      contextLogger().error(
        { err, event: "loja.assinatura.provision_access_failed", studentId: student.id },
        "provisionStudentAccess falhou",
      )
    })

    const pendingCutoff = new Date(Date.now() - PENDING_CHECKOUT_TTL_MS)
    const alreadyLive = await prisma.studentSubscription.findFirst({
      where: {
        studentId: student.id,
        tenantId: tenant.id,
        OR: [
          { status: { in: ["ACTIVE", "PAST_DUE"] } },
          { status: "PENDING", createdAt: { gte: pendingCutoff } },
        ],
      },
      select: { id: true, status: true },
    })
    if (alreadyLive) {
      return NextResponse.json(
        {
          error:
            alreadyLive.status === "PENDING"
              ? "Você já iniciou uma assinatura. Conclua o pagamento ou aguarde alguns minutos."
              : "Você já tem uma assinatura em andamento.",
          code: "SUBSCRIPTION_EXISTS",
        },
        { status: 409 },
      )
    }

    await prisma.studentSubscription.deleteMany({
      where: {
        studentId: student.id,
        tenantId: tenant.id,
        status: "PENDING",
        createdAt: { lt: pendingCutoff },
        payments: { none: {} },
      },
    })

    const payerSource = await prisma.student.findUniqueOrThrow({
      where: { id: student.id },
      select: PAYER_SELECT,
    })
    const payer = resolvePayer(payerSource)
    if (!payer.cpf || !payer.email) {
      return NextResponse.json(
        { error: "Dados do pagador incompletos" },
        { status: 400 },
      )
    }

    const subscription = await prisma.studentSubscription.create({
      data: {
        studentId: student.id,
        tenantId: tenant.id,
        planId: plan.id,
        status: "PENDING",
        priceAtPurchase: plan.price,
        gateway,
        billingType: data.paymentMethod,
      },
      select: { id: true },
    })

    try {
      const result = await createSubscriptionAtGateway(
        {
          subscriptionId: subscription.id,
          plan,
          tenantId: tenant.id,
          billingType: data.paymentMethod,
          payer: {
            nome: payer.nome,
            cpf: payer.cpf,
            email: payer.email,
            phone: payer.fone,
          },
          cardToken: data.cardToken,
          creditCard: data.creditCard,
          creditCardHolderInfo: data.creditCard
            ? {
                name: payer.nome,
                email: payer.email,
                cpfCnpj: payer.cpf,
                postalCode: data.creditCardHolder!.postalCode,
                addressNumber: data.creditCardHolder!.addressNumber,
                addressComplement: data.creditCardHolder?.addressComplement,
                phone: payer.fone ?? data.fone,
              }
            : undefined,
          remoteIp: clientIp(request),
        },
        gateway,
        // A CONTA da unidade — nunca a conta-mãe.
        {
          asaasApiKey: tenant.asaasApiKey
            ? decryptTenantAsaasKey(tenant.asaasApiKey)
            : undefined,
          mpAccessToken: tenant.mpAccessToken
            ? decryptTenantMpToken(tenant.mpAccessToken)
            : undefined,
          tenantSlug: tenant.slug,
        },
      )

      return NextResponse.json({
        data: {
          subscriptionId: subscription.id,
          invoiceUrl: result.invoiceUrl,
          authorized: result.authorized,
        },
      })
    } catch (err) {
      await prisma.studentSubscription
        .delete({ where: { id: subscription.id } })
        .catch(() => undefined)
      contextLogger().error(
        {
          err,
          event: "loja.assinatura.gateway_failed",
          tenantId: tenant.id,
          planId: plan.id,
        },
        "falha ao criar assinatura na conta da unidade",
      )
      return NextResponse.json(
        { error: "Não foi possível iniciar a assinatura. Tente novamente." },
        { status: 502 },
      )
    }
  },
)
