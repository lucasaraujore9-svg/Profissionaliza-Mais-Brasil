/**
 * Cartão recusado no parcelado (spec 2026-11-06-venda-direta-parcelada-design,
 * "Cartão negado"). Na 1ª recusa a assinatura do gateway é cancelada e, SÓ com
 * o cancelamento CONFIRMADO, a linha da vez vira negada (`cardDeclinedAt`): a
 * página passa a oferecer PIX, boleto ou outro cartão (`flexOffer`).
 *
 * Invariante: nunca cobrar a mesma parcela duas vezes. Enquanto o gateway ainda
 * pode retentar o cartão (cancelamento sem prova, ou a cobrança recusada ainda
 * de pé no Asaas), a linha fica intocada e a página segue em "automático".
 */
import { prisma } from "@/lib/prisma"
import { advisoryLockKeyFrom, withAdvisoryLock } from "@/lib/enrollment/fulfill"
import { getPayment as getAsaasPayment } from "@/lib/asaas/client"
import { CONFIRMED_STATUSES } from "@/lib/asaas/transparent-process"
import { getPayment as getMpPayment } from "@/lib/mercadopago/client"
import { sendEmail } from "@/lib/email/mailer"
import { PMB_EMAIL_BRAND, emailFromForBrand } from "@/lib/email/brand"
import { loadTenantEmailBrand } from "@/lib/email/tenant-brand"
import { afterResponse } from "@/lib/after-response"
import { logAudit } from "@/lib/audit"
import { contextLogger } from "@/lib/logger"
import { loadContext } from "./plan"
import { flexPaymentUrl } from "./flex"
import { asaasEvent, asaasKeyFor, mpTokenFor, readAsaasPayment, releaseAsaasCharge } from "./flex-charge"
import {
  alertPmbAdmin,
  cancelFlexSubscription,
  settleFlexSubscriptionPayment,
  START_RACE_WAIT_MS,
  type GatewaySubscription,
} from "./flex-card"

const OPEN = ["SCHEDULED", "GENERATED", "OVERDUE"] as const

export type FlexDeclineOutcome = "declined" | "cancel_unconfirmed" | "ignored"

export async function handleFlexCardDeclined(input: {
  enrollmentId: string
  gatewayPaymentId: string
}): Promise<FlexDeclineOutcome> {
  let result: FlexDeclineOutcome = "ignored"
  // O mesmo lock do startFlexCardSubscription: a recusa não se intercala com a
  // criação de uma assinatura nova.
  const attempt = () =>
    withAdvisoryLock(advisoryLockKeyFrom(`FLEX_CARD:${input.enrollmentId}`), async () => {
      result = await declineUnderLock(input.enrollmentId, input.gatewayPaymentId)
    })
  if (await attempt()) return result
  // Ocupado: espera a criação terminar e tenta UMA vez. Sem retry infinito pelo
  // gateway — um lock vazado no pooler travaria a fila de webhooks da conta.
  await new Promise((r) => setTimeout(r, START_RACE_WAIT_MS))
  if (await attempt()) return result
  return unconfirmed(input.enrollmentId, "assinatura (matrícula ocupada por outro processamento)")
}

async function declineUnderLock(enrollmentId: string, gatewayPaymentId: string): Promise<FlexDeclineOutcome> {
  const ctx = await loadContext(enrollmentId)
  if (!ctx.enrollment.flexInstallments) return "ignored"
  const subs = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { asaasSubscriptionId: true, mpSubscriptionId: true },
  })
  const row = await prisma.boletoInstallment.findFirst({
    where: { enrollmentId, status: { in: [...OPEN] } },
    orderBy: { number: "asc" },
  })
  // Linha já negada = reentrega ou 2ª recusa: nada a fazer, nenhum 2º e-mail.
  if (!row || row.method !== "CREDIT_CARD" || row.cardDeclinedAt) return "ignored"

  let sub: GatewaySubscription
  if (row.gateway === "ASAAS") {
    if (!subs?.asaasSubscriptionId) return "ignored"
    sub = { asaasSubscriptionId: subs.asaasSubscriptionId }
    const apiKey = asaasKeyFor(ctx)
    if (!apiKey) return unconfirmed(enrollmentId, `assinatura ${sub.asaasSubscriptionId}`)
    // Fonte da verdade é o gateway: a recusa tem que ser de uma cobrança da
    // assinatura VIGENTE (a de uma antiga não pode derrubar a nova) e não paga.
    const refused = await getAsaasPayment(gatewayPaymentId, apiKey)
    if (refused.subscription !== sub.asaasSubscriptionId || CONFIRMED_STATUSES.has(refused.status)) return "ignored"
    if (!(await cancelFlexSubscription(ctx, sub))) return unconfirmed(enrollmentId, `assinatura ${sub.asaasSubscriptionId}`)

    // A remoção da assinatura costuma levar junto a cobrança pendente; só a
    // releitura (`deleted: true` / 404) prova que ela não pode mais ser paga.
    const now = await readAsaasPayment(refused.id, apiKey)
    const released = now === null ? ({ kind: "stuck" } as const) : await releaseAsaasCharge(now, apiKey)
    if (released.kind === "paid") {
      // O cartão passou numa retentativa entre a recusa e o cancelamento: baixa
      // a linha com ela. As seguintes ficam sem assinatura (a página reabre os meios).
      await prisma.enrollment.update({ where: { id: enrollmentId }, data: { asaasSubscriptionId: null } })
      await settleFlexSubscriptionPayment({ enrollmentId, event: asaasEvent(released.payment) })
      return "ignored"
    }
    if (released.kind !== "released") return unconfirmed(enrollmentId, `cobrança ${refused.id}`)
  } else {
    if (!subs?.mpSubscriptionId) return "ignored"
    sub = { mpSubscriptionId: subs.mpSubscriptionId }
    const token = await mpTokenFor(ctx)
    if (!token) return unconfirmed(enrollmentId, `assinatura ${sub.mpSubscriptionId}`)
    // Recusado no MP é terminal: não há cobrança a tirar do ar, só a recorrência.
    const refused = await getMpPayment(token, gatewayPaymentId)
    if (refused.status !== "rejected") return "ignored"
    if (!(await cancelFlexSubscription(ctx, sub))) return unconfirmed(enrollmentId, `assinatura ${sub.mpSubscriptionId}`)
  }

  const declinedAt = new Date()
  try {
    // Solta a matrícula PRIMEIRO: sozinho já tira a página do "automático"
    // (flexOffer) e libera um cartão novo (sem SUBSCRIPTION_ACTIVE).
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: "asaasSubscriptionId" in sub ? { asaasSubscriptionId: null } : { mpSubscriptionId: null },
    })
    await prisma.boletoInstallment.update({ where: { id: row.id }, data: { cardDeclinedAt: declinedAt } })
  } catch (err) {
    // Cancelado no gateway e não gravado: a reentrega acharia a cobrança já
    // removida e não refaria nada. Alguém precisa conferir à mão.
    await alertPmbAdmin(
      "Cartão recusado no parcelado não gravado",
      `A assinatura da matrícula ${enrollmentId} foi cancelada no gateway após a recusa do cartão, mas a gravação falhou. Confira se a parcela ${row.number} aparece para pagamento por PIX/boleto.`,
    )
    throw err
  }
  await logAudit({
    action: "enrollment.flex.card_declined",
    resource: "Enrollment",
    resourceId: enrollmentId,
    actorRole: "SYSTEM",
    tenantId: ctx.enrollment.tenantId,
    payloadBefore: { ...sub, rowNumber: row.number },
    payloadAfter: { cancelled: true, gatewayPaymentId, cardDeclinedAt: declinedAt.toISOString() },
  })
  notifyStudentCardDeclined(enrollmentId, Number(row.amount))
  return "declined"
}

/** Gateway sem prova de parada: a linha fica como está e um humano resolve. */
async function unconfirmed(enrollmentId: string, what: string): Promise<"cancel_unconfirmed"> {
  contextLogger().error(
    { event: "installments.flex_card.decline_cancel_unconfirmed", enrollmentId, what },
    "cartão recusado no parcelado, mas o cancelamento não foi confirmado",
  )
  await alertPmbAdmin(
    "Cancelamento não confirmado no parcelado",
    `O cartão da matrícula ${enrollmentId} foi recusado, mas a ${what} não pôde ser cancelada/removida com confirmação. Cancele à mão no gateway: até lá o aluno não vê PIX/boleto, para a parcela não ser cobrada duas vezes.`,
  )
  return "cancel_unconfirmed"
}

/**
 * E-mail ao aluno com o link da página de pagamento da loja certa. Sai uma vez
 * por linha negada: a transição para `cardDeclinedAt` (sob o lock) é o dedupe.
 */
function notifyStudentCardDeclined(enrollmentId: string, amount: number): void {
  afterResponse(async () => {
    try {
      const enr = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          tenantId: true,
          student: { select: { nome: true, email: true } },
          course: { select: { nome: true } },
          tenant: { select: { slug: true, customDomain: true, domainVerified: true } },
        },
      })
      if (!enr?.student.email) return
      const brand = enr.tenantId ? await loadTenantEmailBrand(enr.tenantId) : PMB_EMAIL_BRAND
      await sendEmail({
        to: enr.student.email,
        from: emailFromForBrand(brand),
        replyTo: brand.replyTo ?? undefined,
        tenantId: enr.tenantId,
        subject: "Seu cartão foi recusado",
        template: {
          type: "installment-card-declined",
          props: {
            studentName: enr.student.nome,
            courseName: enr.course.nome,
            amount: `R$ ${amount.toFixed(2).replace(".", ",")}`,
            paymentUrl: flexPaymentUrl(enrollmentId, enr.tenant),
            brand,
          },
        },
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "installments.flex_card.decline_email_failed", enrollmentId },
        "e-mail de cartão recusado do parcelado falhou",
      )
    }
  })
}
