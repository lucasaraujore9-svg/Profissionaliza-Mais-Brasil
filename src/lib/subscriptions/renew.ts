import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { cancelSubscriptionAccess } from "./cancel"
import { addInterval, isRecurringInterval } from "./interval"

/**
 * Renovacao e queda de ciclo de uma assinatura de aluno.
 *
 * O ciclo pago e representado por `currentPeriodEnd`. E ele que da acesso (ver
 * `access.ts`), nao o `status` sozinho — status e o ultimo recado do gateway e
 * pode estar atrasado.
 */

export interface CycleEvent {
  gateway: "MP" | "ASAAS"
  externalPaymentId: string
  amount: number
  paidAt: Date
  dueDate: Date
  billingType?: string | null
  invoiceUrl?: string | null
  bankSlipUrl?: string | null
}

/**
 * Registra a cobranca de um ciclo PAGO e empurra `currentPeriodEnd`.
 *
 * Idempotente pelo id do pagamento no gateway (unique em SubscriptionPayment):
 * webhook reentregue nao concede um mes extra de acesso — que e exatamente o que
 * um `currentPeriodEnd += 1 mes` cego faria a cada re-entrega.
 */
export async function settleSubscriptionCycle(
  subscriptionId: string,
  event: CycleEvent,
): Promise<{ settled: boolean }> {
  const existing = await prisma.subscriptionPayment.findFirst({
    where:
      event.gateway === "MP"
        ? { mpPaymentId: event.externalPaymentId }
        : { asaasPaymentId: event.externalPaymentId },
    select: { id: true },
  })
  if (existing) return { settled: false }

  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      studentId: true,
      // Congelado na contratacao: e ele que diz quanto o pagamento compra.
      interval: true,
      // A VITALICIA nunca tem `currentPeriodEnd`, entao ele nao serve para
      // saber se ja houve um 1o ciclo — quem responde isso e `startedAt`.
      startedAt: true,
      plan: { select: { name: true } },
    },
  })
  if (!sub) return { settled: false }

  // Assinatura ENCERRADA nao renasce por um pagamento tardio. Enquanto a
  // recorrencia do gateway seguia viva (defeito ja corrigido em cancel.ts), uma
  // cobranca do mes seguinte reabria a linha como ACTIVE — e o aluno via
  // "assinatura ativa" com TODAS as matriculas canceladas e o acesso revogado
  // na fornecedora. Registramos a cobranca para o dinheiro nao sumir do
  // historico, mas nao devolvemos acesso: reativar exige contratar de novo.
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") {
    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        tenantId: sub.tenantId,
        amount: event.amount,
        gateway: event.gateway,
        mpPaymentId: event.gateway === "MP" ? event.externalPaymentId : null,
        asaasPaymentId: event.gateway === "ASAAS" ? event.externalPaymentId : null,
        status: "CONFIRMED",
        billingType: event.billingType ?? null,
        dueDate: event.dueDate,
        paidAt: event.paidAt,
        invoiceUrl: event.invoiceUrl ?? null,
        bankSlipUrl: event.bankSlipUrl ?? null,
      },
    })
    contextLogger().error(
      {
        event: "subscription.payment_on_cancelled",
        subscriptionId,
        gateway: event.gateway,
        externalPaymentId: event.externalPaymentId,
      },
      "cobranca recebida em assinatura ja cancelada — recorrencia orfa no gateway",
    )
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: "Cobrança em assinatura cancelada",
      body: `A assinatura ${subscriptionId} está cancelada, mas recebeu uma cobrança de ${event.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. A recorrência ficou órfã no gateway — cancele lá e avalie estorno.`,
      href: "/admin/alunos",
    }).catch(swallow("subscription.cycle"))
    return { settled: false }
  }

  // A base do novo ciclo e o fim do ciclo atual quando ele ainda esta no futuro
  // (renovacao antecipada nao encurta o que ja foi pago) e "agora" quando ja
  // passou (nao ha credito retroativo a conceder).
  const now = event.paidAt
  const base =
    sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now

  await prisma.subscriptionPayment.create({
    data: {
      subscriptionId,
      tenantId: sub.tenantId,
      amount: event.amount,
      gateway: event.gateway,
      mpPaymentId: event.gateway === "MP" ? event.externalPaymentId : null,
      asaasPaymentId: event.gateway === "ASAAS" ? event.externalPaymentId : null,
      status: "CONFIRMED",
      billingType: event.billingType ?? null,
      dueDate: event.dueDate,
      paidAt: event.paidAt,
      invoiceUrl: event.invoiceUrl ?? null,
      bankSlipUrl: event.bankSlipUrl ?? null,
    },
  })

  // O ciclo comprado depende da PERIODICIDADE CONGELADA: um pagamento de plano
  // anual compra 12 meses, nao 1. E na VITALICIA nao ha ciclo a empurrar —
  // `currentPeriodEnd` fica null para sempre, que e o sinal lido por
  // `subscriptionGrantsAccess` e o que mantem a linha fora da varredura de
  // carencia. Gravar uma data distante ali seria uma mentira que a varredura
  // acabaria cobrando, cancelando quem comprou acesso permanente.
  const nextPeriodEnd = addInterval(base, sub.interval)

  await prisma.studentSubscription.update({
    where: { id: subscriptionId },
    data: {
      // Pagou: sai de PAST_DUE. Um pedido de cancelamento para o fim do ciclo
      // NAO e revogado por um pagamento que ja estava em transito.
      status: "ACTIVE",
      ...(nextPeriodEnd ? { currentPeriodEnd: nextPeriodEnd } : {}),
      startedAt: sub.startedAt ? undefined : now,
    },
  })

  contextLogger().info(
    { event: "subscription.cycle_settled", subscriptionId, gateway: event.gateway },
    "ciclo de assinatura liquidado",
  )

  return { settled: true }
}

/**
 * Registra/atualiza a cobranca de um ciclo AINDA EM ABERTO.
 *
 * Por que existe: com PIX e boleto nao ha debito automatico — o Asaas EMITE a
 * fatura e o aluno paga na mao. Se so gravassemos as cobrancas ja pagas, a
 * unica copia do link de pagamento viveria dentro do payload do webhook, e o
 * assinante em atraso nao teria por onde pagar: veria "mensalidade em aberto",
 * nenhum link, e seria cancelado 7 dias depois por uma conta que nunca lhe foi
 * mostrada — perdendo, na EA, o progresso dos cursos.
 *
 * Idempotente pelo id do pagamento no gateway.
 */
export async function recordOpenSubscriptionCharge(
  subscriptionId: string,
  event: Omit<CycleEvent, "paidAt"> & { status: string },
): Promise<void> {
  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, tenantId: true },
  })
  if (!sub) return

  const where =
    event.gateway === "MP"
      ? { mpPaymentId: event.externalPaymentId }
      : { asaasPaymentId: event.externalPaymentId }

  const existing = await prisma.subscriptionPayment.findFirst({
    where,
    select: { id: true, paidAt: true },
  })

  // Nunca rebaixa uma cobranca ja liquidada: o Asaas reenvia PAYMENT_UPDATED
  // depois do pagamento, e sobrescrever devolveria a linha para "em aberto".
  if (existing?.paidAt) return

  if (existing) {
    await prisma.subscriptionPayment.update({
      where: { id: existing.id },
      data: {
        status: event.status,
        dueDate: event.dueDate,
        invoiceUrl: event.invoiceUrl ?? null,
        bankSlipUrl: event.bankSlipUrl ?? null,
      },
    })
    return
  }

  await prisma.subscriptionPayment.create({
    data: {
      subscriptionId,
      tenantId: sub.tenantId,
      amount: event.amount,
      gateway: event.gateway,
      mpPaymentId: event.gateway === "MP" ? event.externalPaymentId : null,
      asaasPaymentId: event.gateway === "ASAAS" ? event.externalPaymentId : null,
      status: event.status,
      billingType: event.billingType ?? null,
      dueDate: event.dueDate,
      paidAt: null,
      invoiceUrl: event.invoiceUrl ?? null,
      bankSlipUrl: event.bankSlipUrl ?? null,
    },
  })
}

/**
 * Cobranca do ciclo VENCEU. Marca em atraso, mas NAO corta: a carencia existe
 * porque PIX/boleto nao tem debito automatico, e cortar no 1o dia derrubaria
 * quem paga com um dia de folga. Quem corta e o cron, depois da carencia.
 */
export async function markSubscriptionPastDue(
  subscriptionId: string,
): Promise<void> {
  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      status: true,
      interval: true,
      studentId: true,
      tenantId: true,
      plan: { select: { name: true } },
    },
  })
  if (!sub || sub.status === "CANCELLED" || sub.status === "EXPIRED") return

  // VITALICIA nao tem mensalidade a atrasar. Um boleto unico que venceu sem
  // pagamento deixa a assinatura em PENDING (que nao libera nada) — marca-la
  // PAST_DUE trocaria isso por um status que a area do aluno anuncia como
  // "regularize para nao perder o acesso" a quem nunca teve acesso, e mandaria
  // um aviso de cobranca recorrente que nao existe.
  if (!isRecurringInterval(sub.interval)) return

  await prisma.studentSubscription.update({
    where: { id: subscriptionId },
    data: { status: "PAST_DUE" },
  })

  await createNotification({
    audience: "STUDENT",
    studentId: sub.studentId,
    level: "WARNING",
    title: "Assinatura em atraso",
    body: `A mensalidade da sua assinatura ${sub.plan.name} está em aberto. Regularize para continuar com acesso aos cursos.`,
    category: "student-billing",
    href: "/aluno/assinatura",
  }).catch(swallow("subscription.past_due"))
}

/**
 * Estorno/chargeback de um ciclo: cancela e revoga na hora.
 *
 * Sem carencia de proposito — a carencia existe para quem esta tentando pagar,
 * nao para quem pediu o dinheiro de volta.
 */
export async function revokeSubscriptionForRefund(
  subscriptionId: string,
): Promise<void> {
  await cancelSubscriptionAccess(subscriptionId, "REFUNDED", true)
}
