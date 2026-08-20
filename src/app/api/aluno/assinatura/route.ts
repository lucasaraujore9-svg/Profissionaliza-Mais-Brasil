import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { getPlanForCheckout } from "@/lib/subscriptions/plans"
import { createSubscriptionAtGateway } from "@/lib/subscriptions/checkout"
import { cancelSubscriptionAccess } from "@/lib/subscriptions/cancel"
import { contextLogger } from "@/lib/logger"
import { clientIp } from "@/lib/http/client-ip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const PENDING_CHECKOUT_TTL_MS = 30 * 60 * 1000

const creditCardSchema = z.object({
  holderName: z.string().trim().min(3).max(160),
  number: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 13 && v.length <= 19, "Número do cartão inválido"),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, "Mês inválido"),
  expiryYear: z
    .string()
    .regex(/^\d{2}(\d{2})?$/, "Ano inválido")
    .transform((v) => (v.length === 2 ? `20${v}` : v)),
  ccv: z.string().regex(/^\d{3,4}$/, "CCV inválido"),
})

const bodySchema = z.object({
  planId: z.string().min(1),
  paymentMethod: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
  creditCard: creditCardSchema.optional(),
  creditCardHolder: z
    .object({
      postalCode: z
        .string()
        .trim()
        .transform((v) => v.replace(/\D/g, ""))
        .refine((v) => v.length === 8, "CEP inválido"),
      addressNumber: z.string().trim().min(1).max(20),
      addressComplement: z.string().trim().max(60).optional(),
    })
    .optional(),
})

/**
 * Assinatura para aluno JA LOGADO.
 *
 * Existe porque o checkout anonimo recusa quem ja tem senha
 * (`cpfHasRegisteredLogin` -> 409 "faca login"). Sem esta rota, esse 409 era um
 * beco sem saida: o aluno logava e nao havia por onde assinar — a base inteira
 * de quem ja comprou um curso ficava fora do produto.
 *
 * Nao coleta cadastro: o aluno ja existe. A regra do responsavel financeiro
 * segue valendo pela FICHA (`resolvePayer` decide pelo que esta gravado), entao
 * um menor com responsavel cadastrado cobra no CPF dele sem novo formulario.
 */
export const POST = withRequestContext(
  { action: "aluno.assinatura.criar", route: "/api/aluno/assinatura" },
  async (request: Request) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const rl = await rateLimitByKey(
      `aluno:${session.studentId}`,
      RATE_LIMITS.publicCheckout,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
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

    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: { id: true, tenantId: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    // A vitrine da assinatura é a do aluno. Hoje só a PMB vende, então um aluno
    // de revenda ainda não tem plano a contratar — melhor dizer isso do que
    // vender um plano com preço e catálogo de outra loja.
    const scopeTenantId = session.tenantId ?? null
    const plan = await getPlanForCheckout(scopeTenantId, data.planId)
    if (!plan) {
      return NextResponse.json({ error: "Plano indisponível" }, { status: 404 })
    }

    const pendingCutoff = new Date(Date.now() - PENDING_CHECKOUT_TTL_MS)
    const alreadyLive = await prisma.studentSubscription.findFirst({
      where: {
        studentId: student.id,
        tenantId: scopeTenantId,
        OR: [
          { status: { in: ["ACTIVE", "PAST_DUE"] } },
          { status: "PENDING", createdAt: { gte: pendingCutoff } },
        ],
      },
      select: { id: true },
    })
    if (alreadyLive) {
      return NextResponse.json(
        { error: "Você já tem uma assinatura em andamento.", code: "SUBSCRIPTION_EXISTS" },
        { status: 409 },
      )
    }

    await prisma.studentSubscription.deleteMany({
      where: {
        studentId: student.id,
        tenantId: scopeTenantId,
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
        {
          error: "Complete seu cadastro (CPF e e-mail) antes de assinar.",
          code: "PAYER_INCOMPLETE",
        },
        { status: 400 },
      )
    }

    const subscription = await prisma.studentSubscription.create({
      data: {
        studentId: student.id,
        tenantId: scopeTenantId,
        planId: plan.id,
        status: "PENDING",
        priceAtPurchase: plan.price,
        gateway: "ASAAS",
        billingType: data.paymentMethod,
      },
      select: { id: true },
    })

    try {
      const result = await createSubscriptionAtGateway(
        {
          subscriptionId: subscription.id,
          plan,
          tenantId: scopeTenantId,
          billingType: data.paymentMethod,
          payer: {
            nome: payer.nome,
            cpf: payer.cpf,
            email: payer.email,
            phone: payer.fone,
          },
          creditCard: data.creditCard,
          creditCardHolderInfo: data.creditCard
            ? {
                name: payer.nome,
                email: payer.email,
                cpfCnpj: payer.cpf,
                postalCode: data.creditCardHolder!.postalCode,
                addressNumber: data.creditCardHolder!.addressNumber,
                addressComplement: data.creditCardHolder?.addressComplement,
                phone: payer.fone ?? "",
              }
            : undefined,
          remoteIp: clientIp(request),
        },
        "ASAAS",
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
        { err, event: "aluno.assinatura.gateway_failed", planId: plan.id },
        "falha ao criar assinatura do aluno logado",
      )
      return NextResponse.json(
        { error: "Não foi possível iniciar a assinatura. Tente novamente." },
        { status: 502 },
      )
    }
  },
)

/**
 * Cancelamento pedido PELO ALUNO. A pagina de planos promete "cancele quando
 * quiser" e ate aqui nao havia por onde — so o suporte, na mao, no Asaas.
 *
 * `revokeAccess: false` de proposito: o mes corrente ja foi pago. A recorrencia
 * para agora, o acesso cai quando o ciclo termina (o cron cuida disso). Cortar
 * na hora tiraria o que ele pagou — e, na EA, apagaria o progresso dele.
 */
export const DELETE = withRequestContext(
  { action: "aluno.assinatura.cancelar", route: "/api/aluno/assinatura" },
  async () => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const sub = await prisma.studentSubscription.findFirst({
      where: {
        studentId: session.studentId,
        status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] },
      },
      select: { id: true, currentPeriodEnd: true },
      orderBy: { createdAt: "desc" },
    })
    if (!sub) {
      return NextResponse.json(
        { error: "Você não tem assinatura ativa" },
        { status: 404 },
      )
    }

    await cancelSubscriptionAccess(sub.id, "REQUESTED", false)

    return NextResponse.json({
      data: {
        cancelled: true,
        accessUntil: sub.currentPeriodEnd?.toISOString() ?? null,
      },
    })
  },
)
