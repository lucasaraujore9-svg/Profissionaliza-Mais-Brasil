import { NextResponse } from "next/server"
import { z } from "zod"
import {
  payWithCreditCard,
  createInstallmentWithCreditCard,
  getInstallmentPayments,
  getPayment,
  getSubscription,
  updateSubscription,
  deletePayment,
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import { addMonths } from "@/lib/asaas/promo"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { createCommissionForTenantPayment } from "@/lib/referrals/commission"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { clientIp } from "@/lib/http/client-ip"

const bodySchema = z.object({
  creditCard: z.object({
    holderName: z.string().min(1),
    number: z.string().min(13).max(19),
    expiryMonth: z.string().regex(/^\d{2}$/),
    expiryYear: z.string().regex(/^\d{4}$/),
    ccv: z.string().min(3).max(4),
  }),
  creditCardHolderInfo: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    cpfCnpj: z.string().min(11).max(14),
    postalCode: z.string().min(8).max(9),
    addressNumber: z.string().min(1),
    addressComplement: z.string().optional(),
    phone: z.string().min(10).max(15),
    mobilePhone: z.string().optional(),
  }),
  // Parcelamento da 1ª mensalidade no cartão. 1 (ou ausente) = à vista.
  installmentCount: z.number().int().min(1).max(21).optional(),
})

export const POST = withRequestContextParams<{ paymentId: string }>(
  {
    action: "cobranca.pay_card",
    route: "/api/cobranca/[paymentId]/pay-card",
  },
  async (request: Request, ctx) => {
  const rl = await rateLimit(request, RATE_LIMITS.cobrancaPayCard)
  if (!rl.ok) return rateLimitResponse(rl)

  const { paymentId } = await ctx.params

  if (!(await isKnownAsaasPayment(paymentId))) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const installmentCount = parsed.data.installmentCount ?? 1
  const creditCard = {
    ...parsed.data.creditCard,
    number: parsed.data.creditCard.number.replace(/\s/g, ""),
  }
  const creditCardHolderInfo = {
    ...parsed.data.creditCardHolderInfo,
    cpfCnpj: parsed.data.creditCardHolderInfo.cpfCnpj.replace(/\D/g, ""),
    postalCode: parsed.data.creditCardHolderInfo.postalCode.replace(/\D/g, ""),
    phone: parsed.data.creditCardHolderInfo.phone.replace(/\D/g, ""),
    mobilePhone: parsed.data.creditCardHolderInfo.mobilePhone?.replace(/\D/g, ""),
  }

  try {
    const payment = await getPayment(paymentId)
    if (payment.status !== "PENDING" && payment.status !== "OVERDUE") {
      return NextResponse.json(
        { error: "Cobrança não está pendente de pagamento" },
        { status: 400 },
      )
    }

    // ── À vista (sem parcelamento): paga a própria cobrança ──
    if (installmentCount <= 1) {
      const result = await payWithCreditCard(paymentId, {
        creditCard,
        creditCardHolderInfo,
        // IP do comprador — o Asaas usa na análise de risco da captura do
        // cartão. Sem ele a transação à vista pode ser recusada.
        remoteIp: clientIp(request),
      }, motherAsaasKey())
      return NextResponse.json({
        data: { id: result.id, status: result.status, value: result.value },
      })
    }

    // ── Parcelado: só para a 1ª mensalidade do revendedor ──
    // O Asaas não parcela uma cobrança de assinatura já existente; criamos um
    // parcelamento no cartão (POST /installments/) pelo valor cheio e removemos
    // a cobrança original da assinatura para não cobrar em duplicidade.
    const subscriptionId = payment.subscription
    const tenant = subscriptionId
      ? await prisma.tenant.findFirst({
          where: {
            OR: [
              { asaasSubscriptionId: subscriptionId },
              { asaasPromoSubscriptionId: subscriptionId },
            ],
          },
          select: {
            id: true,
            name: true,
            slug: true,
            customDomain: true,
            status: true,
            firstPaymentMaxInstallments: true,
          },
        })
      : null

    if (!tenant) {
      return NextResponse.json(
        { error: "Parcelamento indisponível para esta cobrança" },
        { status: 400 },
      )
    }
    // Parcelamento só vale na 1ª mensalidade (revenda ainda não ativada).
    if (tenant.status !== "PENDING") {
      return NextResponse.json(
        { error: "O parcelamento só está disponível na primeira mensalidade" },
        { status: 400 },
      )
    }
    const maxN = Math.max(1, tenant.firstPaymentMaxInstallments)
    if (installmentCount > maxN) {
      return NextResponse.json(
        { error: `Parcelamento máximo permitido: ${maxN}x` },
        { status: 400 },
      )
    }

    const perInstallment =
      Math.round((payment.value / installmentCount) * 100) / 100

    const installment = await createInstallmentWithCreditCard({
      installmentCount,
      customer: payment.customer,
      value: perInstallment,
      totalValue: payment.value,
      billingType: "CREDIT_CARD",
      dueDate: payment.dueDate,
      description: payment.description,
      paymentExternalReference: `tenant:${tenant.slug}`,
      creditCard,
      creditCardHolderInfo,
      remoteIp: clientIp(request),
    }, motherAsaasKey())

    // POST /installments/ responde 200 ao CRIAR o parcelamento — isso não
    // garante que o cartão foi capturado. A 1ª parcela pode ficar em
    // AWAITING_RISK_ANALYSIS. Consultamos o status real antes de remover a
    // cobrança original e ativar a revenda (o webhook não casa parcelamentos,
    // que vêm sem subscription, então não há rede de segurança depois).
    const firstCharge = await getInstallmentPayments(installment.id)
      .then(
        (list) =>
          [...list.data].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ??
          null,
      )
      .catch((err) => {
        contextLogger().error(
          { err, event: "cobranca.installment.fetch_status_failed", installmentId: installment.id },
          "falha ao consultar status da 1ª parcela do parcelamento",
        )
        return null
      })

    const CAPTURED_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])
    const captured = firstCharge != null && CAPTURED_STATUSES.has(firstCharge.status)
    const underReview = firstCharge?.status === "AWAITING_RISK_ANALYSIS"

    // Nem capturado nem em análise de risco (status inesperado ou consulta
    // falhou): NÃO removemos a cobrança original nem ativamos — não ativamos a
    // revenda numa cobrança que ainda pode ser recusada. Alertamos o admin
    // para conciliar o parcelamento criado.
    if (!captured && !underReview) {
      contextLogger().error(
        { event: "cobranca.installment.not_captured", installmentId: installment.id, status: firstCharge?.status ?? "unknown", tenantId: tenant.id },
        "parcelamento criado mas 1ª parcela não confirmada — ativação adiada",
      )
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: "Parcelamento de mensalidade não confirmado",
        body: `Revenda ${tenant.name}: parcelamento ${installment.id} criado, mas a 1ª parcela está "${firstCharge?.status ?? "desconhecido"}". Verifique no Asaas — a cobrança original ${paymentId} NÃO foi removida e a revenda NÃO foi ativada.`,
        href: "/admin/revendedores",
      }).catch(swallow("cobranca.installment"))
      return NextResponse.json({
        data: {
          id: installment.id,
          status: firstCharge?.status ?? "PENDING",
          value: payment.value,
          pending: true,
        },
      })
    }

    // Capturado ou em análise de risco (valor já retido): em ambos os casos o
    // parcelamento substitui a cobrança original da assinatura — removemos para
    // não cobrar em duplicidade.
    const originalDeleted = await deletePayment(paymentId)
      .then(() => true)
      .catch((err) => {
        contextLogger().error(
          { err, event: "cobranca.installment.delete_original_failed", paymentId },
          "falha ao remover cobrança original após parcelamento",
        )
        return false
      })

    // Se a remoção falhou, a cobrança original segue e vai vencer → OVERDUE →
    // suspensão indevida (a revenda já pagou via parcelamento). Alertamos o
    // admin para remover manualmente no Asaas antes do vencimento.
    if (!originalDeleted) {
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: "Cobrança original não removida",
        body: `Revenda ${tenant.name}: a 1ª mensalidade foi parcelada (${installment.id}), mas a cobrança original ${paymentId} não pôde ser removida automaticamente. Remova no Asaas para evitar suspensão por vencimento.`,
        href: "/admin/revendedores",
      }).catch(swallow("cobranca.installment"))
    }

    // Garante que a assinatura só volte a cobrar no próximo mês.
    if (subscriptionId) {
      try {
        const sub = await getSubscription(subscriptionId)
        if (new Date(sub.nextDueDate) <= new Date(payment.dueDate)) {
          await updateSubscription(subscriptionId, {
            nextDueDate: addMonths(payment.dueDate, 1),
          })
        }
      } catch (err) {
        contextLogger().error(
          { err, event: "cobranca.installment.bump_subscription_failed", subscriptionId },
          "falha ao ajustar nextDueDate da assinatura após parcelamento",
        )
      }
    }

    // Registra a cobrança. CONFIRMED só quando capturado de fato; em análise de
    // risco fica PENDING até a confirmação.
    const tenantPaymentRow = await prisma.tenantPayment.upsert({
      where: { asaasPaymentId: installment.id },
      update: {
        status: captured ? "CONFIRMED" : "PENDING",
        paidAt: captured ? new Date() : null,
      },
      create: {
        tenantId: tenant.id,
        asaasPaymentId: installment.id,
        amount: payment.value,
        billingType: "CREDIT_CARD",
        status: captured ? "CONFIRMED" : "PENDING",
        dueDate: new Date(payment.dueDate),
        paidAt: captured ? new Date() : null,
      },
      select: { id: true },
    })

    // Ativa o tenant SOMENTE com captura confirmada. O webhook não casa
    // parcelamentos (vêm sem subscription), então a ativação é síncrona aqui.
    if (!captured) {
      // underReview: aguardamos a análise do Asaas. Como o webhook não reativa
      // parcelamentos, alertamos o admin para ativar quando confirmar.
      contextLogger().warn(
        { event: "cobranca.installment.under_review", installmentId: installment.id, tenantId: tenant.id },
        "parcelamento em análise de risco — revenda aguardando ativação",
      )
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "INFO",
        title: "Parcelamento em análise de risco",
        body: `Revenda ${tenant.name}: parcelamento ${installment.id} em análise pelo Asaas. Ative a revenda quando o pagamento for confirmado.`,
        href: "/admin/revendedores",
      }).catch(swallow("cobranca.installment"))

      return NextResponse.json({
        data: {
          id: installment.id,
          status: firstCharge?.status ?? "AWAITING_RISK_ANALYSIS",
          value: payment.value,
          pending: true,
        },
      })
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "ACTIVE" },
    })
    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    }).catch(swallow("cobranca.installment"))

    await createCommissionForTenantPayment(tenantPaymentRow.id).catch((err) =>
      contextLogger().error(
        { err, event: "cobranca.installment.commission_failed", tenantPaymentId: tenantPaymentRow.id },
        "createCommissionForTenantPayment falhou (parcelamento)",
      ),
    )

    await createNotification({
      audience: "TENANT",
      tenantId: tenant.id,
      level: "SUCCESS",
      title: "Mensalidade paga",
      body: `Primeira mensalidade parcelada em ${installmentCount}x confirmada.`,
      category: "tenant-billing",
      href: "/painel/financeiro",
    }).catch(swallow("cobranca.installment"))

    return NextResponse.json({
      data: { id: installment.id, status: "CONFIRMED", value: payment.value },
    })
  } catch (error) {
    if (error instanceof AsaasApiError) {
      if (error.statusCode === 404) {
        return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
      }
      const msg = error.errors?.[0]?.description ?? error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao processar pagamento" }, { status: 502 })
  }
  },
)
