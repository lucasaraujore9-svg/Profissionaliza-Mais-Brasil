import type { SubscriptionInterval } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { cancelSubscriptionAccess } from "./cancel"
import { addInterval, isRecurringInterval } from "./interval"
import { CARNE_STATUS, carnePeriodEnd } from "./carne-schedule"
import { SUBSCRIPTION_REFUNDED_STATUS } from "./revenue"

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
    select: { id: true, paidAt: true, number: true },
  })
  // Já liquidado: re-entrega do webhook. Uma linha SEM `paidAt` não é
  // re-entrega — é o ciclo que `recordOpenSubscriptionCharge` registrou em
  // aberto (PAYMENT_CREATED / OVERDUE) e que agora foi pago. Tratá-la como
  // "já registrado" deixava todo PIX/boleto de assinatura sem liquidar: o aluno
  // pagava, a assinatura seguia PENDING/PAST_DUE e a varredura a cancelava.
  if (existing?.paidAt) return { settled: false }

  const paidData = {
    amount: event.amount,
    status: "CONFIRMED",
    billingType: event.billingType ?? null,
    dueDate: event.dueDate,
    paidAt: event.paidAt,
    invoiceUrl: event.invoiceUrl ?? null,
    bankSlipUrl: event.bankSlipUrl ?? null,
  }
  // Boleto do CARNE: o vencimento e da agenda (e dele que sai o periodo pago) e
  // o boleto e o que a plataforma emitiu — o pagamento so marca a linha.
  const carneRowPaidData = {
    status: "CONFIRMED",
    paidAt: event.paidAt,
    amount: event.amount,
  }
  /** Grava o pagamento; `false` quando outro evento já o liquidou. */
  const recordPaid = async (tenantId: string | null): Promise<boolean> => {
    if (existing) {
      // CAS em `paidAt: null`: PAYMENT_CONFIRMED e PAYMENT_RECEIVED chegam
      // juntos, e duas liquidações empurrariam o período duas vezes.
      const { count } = await prisma.subscriptionPayment.updateMany({
        where: { id: existing.id, paidAt: null },
        data: existing.number !== null ? carneRowPaidData : paidData,
      })
      return count === 1
    }
    await prisma.subscriptionPayment.create({
      data: {
        ...paidData,
        subscriptionId,
        tenantId,
        gateway: event.gateway,
        mpPaymentId: event.gateway === "MP" ? event.externalPaymentId : null,
        asaasPaymentId: event.gateway === "ASAAS" ? event.externalPaymentId : null,
      },
    })
    return true
  }

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
      boletoCarne: true,
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
    if (!(await recordPaid(sub.tenantId))) return { settled: false }
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

  if (!(await recordPaid(sub.tenantId))) return { settled: false }

  // O ciclo comprado depende da PERIODICIDADE CONGELADA: um pagamento de plano
  // anual compra 12 meses, nao 1. E na VITALICIA nao ha ciclo a empurrar —
  // `currentPeriodEnd` fica null para sempre, que e o sinal lido por
  // `subscriptionGrantsAccess` e o que mantem a linha fora da varredura de
  // carencia. Gravar uma data distante ali seria uma mentira que a varredura
  // acabaria cobrando, cancelando quem comprou acesso permanente.
  //
  // No CARNE o periodo sai da AGENDA dos boletos, nao de "agora + um ciclo":
  // ver `carnePeriodEnd`.
  const nextPeriodEnd = sub.boletoCarne
    ? await carneRowsPeriodEnd(subscriptionId, sub.interval, sub.currentPeriodEnd)
    : addInterval(base, sub.interval)

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

  // 1o pagamento: a assinatura nao cria matricula (ela nasce quando o aluno
  // escolhe um curso), entao nada mais avisava ninguem. O aluno caia numa area
  // sem curso nenhum e a unidade nao via venda — os dois liam "nao deu baixa".
  if (!sub.startedAt) {
    await notifySubscriptionActivated(sub, event.amount)
  }

  return { settled: true }
}

async function notifySubscriptionActivated(
  sub: { id: string; tenantId: string | null; studentId: string; plan: { name: string } },
  amount: number,
): Promise<void> {
  await createNotification({
    audience: "STUDENT",
    studentId: sub.studentId,
    level: "SUCCESS",
    title: "Assinatura ativa",
    body: `Pagamento confirmado! Escolha os cursos do plano ${sub.plan.name} para liberar as aulas.`,
    category: "enrollment",
    href: "/aluno/assinatura",
  }).catch(swallow("subscription.activated.student"))

  if (!sub.tenantId) return
  const student = await prisma.student.findUnique({
    where: { id: sub.studentId },
    select: { nome: true },
  })
  await createNotification({
    audience: "TENANT",
    tenantId: sub.tenantId,
    level: "SUCCESS",
    title: `Assinatura paga — ${sub.plan.name}`,
    body: `${student?.nome ?? "Aluno"} pagou ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} e já tem acesso aos cursos do plano.`,
    category: "sale",
    href: "/painel/vendas",
  }).catch(swallow("subscription.activated.tenant"))
}

/**
 * Fim do periodo de uma assinatura no boleto, recalculado das linhas pagas.
 * Nunca recua: o maximo entre o que ja estava gravado e o calculado.
 */
async function carneRowsPeriodEnd(
  subscriptionId: string,
  interval: SubscriptionInterval,
  current: Date | null,
): Promise<Date | null> {
  const rows = await prisma.subscriptionPayment.findMany({
    where: { subscriptionId },
    select: { number: true, dueDate: true, paidAt: true },
  })
  const first = rows.find((r) => r.number === 1)
  const paid = rows.filter((r) => r.paidAt !== null)
  if (!first || paid.length === 0) return current
  const firstPaidAt = paid.reduce<Date>(
    (min, r) => (r.paidAt! < min ? r.paidAt! : min),
    paid[0].paidAt!,
  )
  const end = carnePeriodEnd({
    firstDueDate: first.dueDate,
    firstPaidAt,
    paidCount: paid.length,
    interval,
  })
  if (!end) return current
  return current && current > end ? current : end
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
    select: { id: true, tenantId: true, boletoCarne: true },
  })
  if (!sub) return

  const where =
    event.gateway === "MP"
      ? { mpPaymentId: event.externalPaymentId }
      : { asaasPaymentId: event.externalPaymentId }

  const existing = await prisma.subscriptionPayment.findFirst({
    where,
    select: { id: true, paidAt: true, number: true, status: true },
  })

  // Nunca rebaixa uma cobranca ja liquidada: o Asaas reenvia PAYMENT_UPDATED
  // depois do pagamento, e sobrescrever devolveria a linha para "em aberto".
  if (existing?.paidAt) return

  // CARNE: quem cria as linhas e a plataforma, na emissao. O PAYMENT_CREATED do
  // Asaas chega enquanto o id ainda esta sendo gravado — criar uma linha aqui
  // poria o mesmo boleto duas vezes (e o id unico derrubaria a emissao). Da
  // linha do carne, o evento so muda o atraso; vencimento e boleto sao da agenda.
  if (sub.boletoCarne || existing?.number != null) {
    if (
      existing &&
      event.status === CARNE_STATUS.OVERDUE &&
      existing.status !== CARNE_STATUS.CANCELLED
    ) {
      await prisma.subscriptionPayment.update({
        where: { id: existing.id },
        data: { status: CARNE_STATUS.OVERDUE },
      })
    }
    return
  }

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
  // Nunca paga: nao ha assinatura a atrasar. Marcar PAST_DUE anunciaria
  // "regularize para nao perder o acesso" a quem nunca teve acesso — e tiraria a
  // linha do PENDING que a limpeza de carne abandonado procura.
  if (sub.status === "PENDING") return

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
  refunded?: { gateway: "ASAAS" | "MP"; externalPaymentId: string },
): Promise<void> {
  // Tira o ciclo estornado da receita do painel (`SUBSCRIPTION_REVENUE_WHERE`).
  // So linha PAGA: "cancelled" do MP tambem passa por aqui e, sem `paidAt`, nao
  // ha dinheiro a devolver — marcar REFUNDED ali seria mentira no extrato.
  if (refunded) {
    await prisma.subscriptionPayment.updateMany({
      where: {
        subscriptionId,
        paidAt: { not: null },
        ...(refunded.gateway === "MP"
          ? { mpPaymentId: refunded.externalPaymentId }
          : { asaasPaymentId: refunded.externalPaymentId }),
      },
      data: { status: SUBSCRIPTION_REFUNDED_STATUS },
    })
  }
  await cancelSubscriptionAccess(subscriptionId, "REFUNDED", true)
}
