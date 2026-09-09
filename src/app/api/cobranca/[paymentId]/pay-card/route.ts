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
import {
  ASAAS_MAX_INSTALLMENTS,
  isFirstMonthlyCharge,
  maxInstallmentsForCharge,
  postCaptureTransition,
} from "@/lib/tenant-billing/installments"
import { unblockTenantStudents } from "@/lib/auto-block"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { isChargePayable } from "@/lib/asaas/charge-status"
import { prisma } from "@/lib/prisma"
import { resolverCompetencia } from "@/lib/asaas/competencia"
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
  // Parcelamento no cartão desta cobrança. 1 (ou ausente) = à vista. O teto
  // REAL vem do tenant (ver maxInstallmentsForCharge); aqui só o limite duro do
  // Asaas, para não mandar ao gateway um número que ele recusa.
  installmentCount: z.number().int().min(1).max(ASAAS_MAX_INSTALLMENTS).optional(),
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
    // Inclui a cobrança REMOVIDA (soft delete mantém o status em aberto):
    // capturar cartão contra uma cobrança que não existe mais é o pior caso
    // desta rota — dinheiro sai sem dívida do outro lado.
    if (!isChargePayable(payment)) {
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

    // ── Parcelado: qualquer mensalidade em aberto do revendedor ──
    // O Asaas não parcela uma cobrança de assinatura já existente; criamos um
    // parcelamento no cartão (POST /installments/) pelo valor cheio e removemos
    // a cobrança original da assinatura para não cobrar em duplicidade.
    //
    // O parcelamento divide SÓ esta cobrança: a assinatura segue gerando as
    // mensalidades dos meses seguintes normalmente (a tela avisa isso antes de
    // confirmar).
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
            monthlyMaxInstallments: true,
          },
        })
      : null

    if (!tenant) {
      return NextResponse.json(
        { error: "Parcelamento indisponível para esta cobrança" },
        { status: 400 },
      )
    }

    // Teto pela MESMA regra que a tela usou para montar o select. Unidade já
    // ativa cai no padrão global (`tenantMonthlyMaxInstallments`); só a 1ª
    // mensalidade usa o teto negociado na venda da revenda.
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { tenantMonthlyMaxInstallments: true },
    })
    const maxN = maxInstallmentsForCharge({
      tenantStatus: tenant.status,
      firstPaymentMaxInstallments: tenant.firstPaymentMaxInstallments,
      monthlyMaxInstallments: tenant.monthlyMaxInstallments,
      globalMonthlyMaxInstallments: settings?.tenantMonthlyMaxInstallments ?? 12,
    })
    if (installmentCount > maxN) {
      return NextResponse.json(
        {
          error:
            maxN === 1
              ? "Esta cobrança não pode ser parcelada"
              : `Parcelamento máximo permitido: ${maxN}x`,
        },
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
        body: `Revenda ${tenant.name}: a mensalidade (venc. ${payment.dueDate}) foi parcelada (${installment.id}), mas a cobrança original ${paymentId} não pôde ser removida automaticamente. Remova no Asaas para evitar suspensão por vencimento.`,
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
        // COMPETENCIA junto com o caixa: sem ela a mensalidade paga por aqui
        // fica invisivel para o motor de comissao, que varre `competenceAt`.
        clientPaidAt: captured ? new Date() : null,
        competenceAt: captured
          ? resolverCompetencia(new Date(payment.dueDate), new Date())
          : null,
        installmentId: installment.id,
        installmentCount,
        // A 1a parcela e capturada AQUI, de forma sincrona — o webhook dela
        // chegaria depois e, sem este registro, seria contada de novo.
        installmentPaidIds:
          captured && firstCharge ? { set: [firstCharge.id] } : undefined,
      },
      create: {
        tenantId: tenant.id,
        asaasPaymentId: installment.id,
        amount: payment.value,
        billingType: "CREDIT_CARD",
        status: captured ? "CONFIRMED" : "PENDING",
        dueDate: new Date(payment.dueDate),
        paidAt: captured ? new Date() : null,
        // COMPETENCIA junto com o caixa: sem ela a mensalidade paga por aqui
        // fica invisivel para o motor de comissao, que varre `competenceAt`.
        clientPaidAt: captured ? new Date() : null,
        competenceAt: captured
          ? resolverCompetencia(new Date(payment.dueDate), new Date())
          : null,
        // Marca a linha como parcelamento: `asaasPaymentId` guarda um `ins_...`,
        // que não resolve em GET /payments/{id}. É por estes campos que a tela
        // de cobranças sabe não oferecer "Pagar agora" e exibir "1 de N".
        installmentId: installment.id,
        installmentCount,
        installmentPaidIds: captured && firstCharge ? [firstCharge.id] : [],
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

    // A promoção decide pelo status de ORIGEM da unidade (ver
    // postCaptureTransition): PENDING ativa; SUSPENDED ativa E desbloqueia os
    // alunos — sem isso a unidade paga a mensalidade atrasada parcelada e os
    // alunos dela seguem bloqueados na plataforma de aulas. Unidade já ACTIVE
    // não é "reativada": desbloquear ali mascararia um bloqueio manual legítimo.
    const transition = postCaptureTransition(tenant.status)

    if (transition.activate) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: "ACTIVE" },
      })
      await invalidateTenant({
        id: tenant.id,
        slug: tenant.slug,
        customDomain: tenant.customDomain,
      }).catch(swallow("cobranca.installment"))
    }

    if (transition.unblockStudents) {
      const unblock = await unblockTenantStudents(tenant.id).catch((err) => {
        contextLogger().error(
          { err, event: "cobranca.installment.unblock_failed", tenantId: tenant.id },
          "falha ao desbloquear alunos apos parcelamento da mensalidade",
        )
        return null
      })
      if (!unblock || unblock.errors.length > 0) {
        // Não derruba o pagamento (o dinheiro entrou), mas alguém precisa
        // destravar os alunos na mão — silenciar deixaria a unidade paga com a
        // vitrine funcionando e os alunos sem acesso.
        await createNotification({
          audience: "ROLE",
          roleTarget: "SUPER_ADMIN",
          level: "WARNING",
          title: "Alunos não desbloqueados após pagamento",
          body: `Revenda ${tenant.name}: a mensalidade foi paga (parcelamento ${installment.id}) e a unidade reativada, mas o desbloqueio dos alunos na plataforma de aulas falhou. Verifique em /admin/revendedores.`,
          href: "/admin/revendedores",
        }).catch(swallow("cobranca.installment"))
      }
    }

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
      body: isFirstMonthlyCharge(tenant.status)
        ? `Primeira mensalidade parcelada em ${installmentCount}x confirmada.`
        : `Mensalidade com vencimento em ${payment.dueDate} parcelada em ${installmentCount}x confirmada. As mensalidades dos próximos meses seguem normalmente.`,
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
