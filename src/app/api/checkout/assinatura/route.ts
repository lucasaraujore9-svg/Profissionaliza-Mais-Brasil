import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { isPmbAppHost } from "@/lib/tenant/urls"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbPlataformaPolo, pmbPlataformaVendedorId } from "@/lib/pmb-config"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
import { cpfHasRegisteredLogin } from "@/lib/students/cpf-already-registered"
import { provisionStudentAccess } from "@/lib/students/access"
import { buildGuardianWrite } from "@/lib/students/guardian"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { getPlanForCheckout } from "@/lib/subscriptions/plans"
import { subscriptionCheckoutSchema } from "@/lib/subscriptions/checkout-schema"
import { createSubscriptionAtGateway } from "@/lib/subscriptions/checkout"
import { contextLogger } from "@/lib/logger"
import { clientIp } from "@/lib/http/client-ip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Quanto tempo um checkout PENDING (PIX/boleto emitido, ainda não pago) segura
 * o aluno. Longo o bastante para ele pagar o PIX na outra aba, curto o bastante
 * para uma desistência não virar bloqueio permanente.
 */
const PENDING_CHECKOUT_TTL_MS = 30 * 60 * 1000

export const POST = withRequestContext(
  { action: "checkout.assinatura", route: "/api/checkout/assinatura" },
  async (request: Request) => {
    if (!isPmbAppHost(request.headers.get("host"))) {
      return NextResponse.json({ error: "Rota indisponível" }, { status: 404 })
    }

    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = subscriptionCheckoutSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    if (data.paymentMethod === "CREDIT_CARD" && (!data.creditCard || !data.creditCardHolder)) {
      return NextResponse.json(
        { error: "Dados do cartão obrigatórios" },
        { status: 400 },
      )
    }

    // Preço e escopo vêm do SERVIDOR. Um plano sem curso vendável não é
    // contratável — a cobrança entraria e o aluno abriria um catálogo vazio.
    const plan = await getPlanForCheckout(null, data.planId)
    if (!plan) {
      return NextResponse.json(
        { error: "Plano indisponível" },
        { status: 404 },
      )
    }

    const pmbTenant = await getOrCreatePmbTenant()

    if (await cpfHasRegisteredLogin(pmbTenant.id, data.cpf)) {
      return NextResponse.json(
        {
          error: "Este CPF já possui cadastro. Faça login para assinar.",
          code: "CPF_ALREADY_REGISTERED",
          loginUrl: "/login",
        },
        { status: 409 },
      )
    }

    // Checkout ANÔNIMO adiciona responsável, nunca remove: refazer o checkout
    // com uma data de adulto não pode apagar um responsável já verificado.
    const { nascimento, guardian } = buildGuardianWrite(data, { allowClear: false })

    let student
    try {
      student = await upsertStudent({
        tenantId: pmbTenant.id,
        nome: data.nome.trim(),
        email: data.email,
        cpf: data.cpf,
        fone: data.fone,
        endereco: data.endereco,
        polo: pmbPlataformaPolo(),
        vendedorId: pmbPlataformaVendedorId(),
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
      isPmbVitrine: true,
      slug: pmbTenant.slug,
    }).catch((err) => {
      contextLogger().error(
        { err, event: "subscription_checkout.provision_access_failed", studentId: student.id },
        "provisionStudentAccess falhou",
      )
    })

    // Uma assinatura viva por aluno nesta vitrine. Sem isto, um duplo clique ou
    // um retorno ao formulário criaria uma SEGUNDA recorrência no gateway,
    // cobrando a pessoa duas vezes por mês pelo mesmo acesso.
    //
    // `PENDING` conta apenas dentro de uma JANELA CURTA. Um checkout de PIX ou
    // boleto abandonado deixa a linha PENDING para sempre (o sweep só enxerga
    // quem já teve ciclo pago), e contá-la sem prazo trancava a pessoa fora do
    // produto de forma permanente — sem nenhuma tela para destravar.
    const pendingCutoff = new Date(Date.now() - PENDING_CHECKOUT_TTL_MS)
    const alreadyLive = await prisma.studentSubscription.findFirst({
      where: {
        studentId: student.id,
        tenantId: null,
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
              ? "Você já iniciou uma assinatura. Conclua o pagamento ou aguarde alguns minutos para tentar de novo."
              : "Você já tem uma assinatura em andamento.",
          code: "SUBSCRIPTION_EXISTS",
        },
        { status: 409 },
      )
    }

    // Limpa as tentativas abandonadas do próprio aluno: sem isto elas se
    // acumulam e a primeira delas continuaria aparecendo no menu como
    // "Minha assinatura" (o layout conta PENDING).
    await prisma.studentSubscription.deleteMany({
      where: {
        studentId: student.id,
        tenantId: null,
        status: "PENDING",
        createdAt: { lt: pendingCutoff },
        payments: { none: {} },
      },
    })

    // Pagador: o responsável vence quando está na ficha. `resolvePayer` só
    // aceita `PAYER_SELECT`, então um select mais estreito nem compila.
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
        tenantId: null,
        planId: plan.id,
        status: "PENDING",
        priceAtPurchase: plan.price,
        gateway: "ASAAS",
        billingType: data.paymentMethod,
      },
      select: { id: true },
    })

    // A vitrine PMB assina SEMPRE pelo Asaas, independente de
    // `pmbDirectSaleGateway`. Não é uma omissão: a recorrência do Mercado Pago
    // (preapproval) exige `card_token_id` gerado no browser e não emite fatura
    // de PIX nem de boleto por ciclo — os dois meios que o dono quis oferecer
    // simplesmente não existem lá. Forçar MP no cartão deixaria a assinatura
    // com regras diferentes por meio de pagamento, e o mesmo aluno mudaria de
    // gateway ao trocar de cartão para PIX.

    try {
      const result = await createSubscriptionAtGateway(
        {
          subscriptionId: subscription.id,
          plan,
          tenantId: null,
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
                phone: payer.fone ?? data.fone,
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
      // A assinatura local ficou PENDING sem recorrência no gateway: removemos
      // para o aluno poder tentar de novo (o gate de "já tem assinatura" acima
      // barraria a segunda tentativa).
      await prisma.studentSubscription
        .delete({ where: { id: subscription.id } })
        .catch(() => undefined)
      contextLogger().error(
        { err, event: "subscription_checkout.gateway_failed", planId: plan.id },
        "falha ao criar assinatura no gateway",
      )
      return NextResponse.json(
        { error: "Não foi possível iniciar a assinatura. Tente novamente." },
        { status: 502 },
      )
    }
  },
)
