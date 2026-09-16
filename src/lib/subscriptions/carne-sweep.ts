import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import {
  INSTALLMENT_REVEAL_WINDOW_DAYS,
  isOverdue,
} from "@/lib/installments/schedule"
import { SUBSCRIPTION_GRACE_DAYS } from "./access"
import { cancelSubscriptionAccess } from "./cancel"
import { emitCarneRow } from "./carne"
import { CARNE_STATUS, carneRowsToAppend } from "./carne-schedule"

/**
 * Varredura diária da assinatura NO BOLETO — roda no mesmo cron do carnê de
 * curso (`sweep-boleto-installments`), que já está agendado no pg_cron.
 *
 *   A. Carnê ABANDONADO: o 1º boleto venceu há mais que a carência e nunca foi
 *      pago. A assinatura é encerrada e os boletos seguintes, cancelados — sem
 *      isto o Mercado Pago seguiria emitindo boleto de quem nunca assinou, e o
 *      PENDING travaria nova venda para o aluno.
 *   B. RENOVAÇÃO: quando o último boleto entra na janela de 7 dias, o seguinte é
 *      criado. É o que faz a assinatura "renovar sozinha".
 *   C. EMISSÃO: boletos na janela ainda sem boleto (Mercado Pago, renovações,
 *      boleto que venceu e precisa ser reemitido).
 *   D. ATRASO: boleto vencido vira OVERDUE (o Mercado Pago não avisa). Só a
 *      linha — o acesso cai pela varredura de assinaturas, no fim do período
 *      pago, igual nos dois gateways.
 *
 * Idempotente: cada fase só age na transição, e a emissão tem lock por linha.
 */

export interface CarneSweepResult {
  abandoned: number
  appended: number
  emitted: number
  emitErrors: number
  markedOverdue: number
}

const BATCH = 200
const DAY_MS = 24 * 60 * 60 * 1000

export async function runSubscriptionCarneSweep(
  now: Date = new Date(),
): Promise<CarneSweepResult> {
  const result: CarneSweepResult = {
    abandoned: 0,
    appended: 0,
    emitted: 0,
    emitErrors: 0,
    markedOverdue: 0,
  }
  const log = contextLogger()
  const horizon = new Date(now.getTime() + INSTALLMENT_REVEAL_WINDOW_DAYS * DAY_MS)

  // ── A. Carnê abandonado ────────────────────────────────────────────────────
  const abandoned = await prisma.studentSubscription.findMany({
    where: {
      boletoCarne: true,
      status: "PENDING",
      startedAt: null,
      payments: {
        some: {
          number: 1,
          paidAt: null,
          dueDate: { lt: new Date(now.getTime() - SUBSCRIPTION_GRACE_DAYS * DAY_MS) },
        },
      },
    },
    select: { id: true },
    take: BATCH,
  })
  for (const s of abandoned) {
    try {
      await cancelSubscriptionAccess(s.id, "PAST_DUE", false)
      result.abandoned++
    } catch (err) {
      log.error(
        { err, event: "subscription.carne.abandon_failed", subscriptionId: s.id },
        "carnê abandonado não pôde ser encerrado",
      )
    }
  }

  // ── B. Renovação ──────────────────────────────────────────────────────────
  // Só quem JÁ pagou algum boleto renova: o carnê que nunca começou é da fase A.
  const renewing = await prisma.studentSubscription.findMany({
    where: {
      boletoCarne: true,
      status: { in: ["ACTIVE", "PAST_DUE"] },
      startedAt: { not: null },
      interval: { not: "LIFETIME" },
      // Nenhum boleto além da janela: a agenda precisa de mais um.
      payments: { none: { number: { not: null }, dueDate: { gt: horizon } } },
    },
    select: {
      id: true,
      tenantId: true,
      interval: true,
      priceAtPurchase: true,
      gateway: true,
    },
    take: BATCH,
  })
  for (const s of renewing) {
    const [first, last] = await Promise.all([
      prisma.subscriptionPayment.findFirst({
        where: { subscriptionId: s.id, number: 1 },
        select: { dueDate: true },
      }),
      prisma.subscriptionPayment.findFirst({
        where: { subscriptionId: s.id, number: { not: null } },
        orderBy: { number: "desc" },
        select: { number: true },
      }),
    ])
    if (!first || !last?.number) continue
    const next = carneRowsToAppend({
      lastNumber: last.number,
      firstDueDate: first.dueDate,
      interval: s.interval,
      now,
    })
    for (const n of next) {
      try {
        await prisma.subscriptionPayment.create({
          data: {
            subscriptionId: s.id,
            tenantId: s.tenantId,
            number: n.number,
            // O valor CONGELADO na contratação, como na recorrência do gateway.
            amount: s.priceAtPurchase,
            gateway: s.gateway,
            status: CARNE_STATUS.SCHEDULED,
            billingType: "BOLETO",
            dueDate: n.dueDate,
          },
        })
        result.appended++
      } catch (err) {
        // Unique (assinatura, número): outra passada já criou — segue.
        log.warn(
          { err, event: "subscription.carne.append_skipped", subscriptionId: s.id, number: n.number },
          "boleto de renovação não criado",
        )
        break
      }
    }
  }

  // ── C. Emissão ────────────────────────────────────────────────────────────
  const toEmit = await prisma.subscriptionPayment.findMany({
    where: {
      number: { not: null },
      paidAt: null,
      status: { in: [CARNE_STATUS.SCHEDULED, CARNE_STATUS.OVERDUE] },
      asaasPaymentId: null,
      mpPaymentId: null,
      dueDate: { lte: horizon },
      subscription: {
        boletoCarne: true,
        status: { in: ["PENDING", "ACTIVE", "PAST_DUE"] },
      },
    },
    select: {
      id: true,
      number: true,
      subscription: {
        select: { id: true, studentId: true, tenantId: true, plan: { select: { name: true } } },
      },
    },
    orderBy: { dueDate: "asc" },
    take: BATCH,
  })
  for (const row of toEmit) {
    try {
      const emitted = await emitCarneRow(row.id)
      if (emitted.status !== "emitted") continue
      result.emitted++
      if ((row.number ?? 0) > 1) {
        await createNotification({
          audience: "STUDENT",
          studentId: row.subscription.studentId,
          level: "INFO",
          title: "Boleto da assinatura disponível",
          body: `O boleto ${row.number} da sua assinatura ${row.subscription.plan.name} já pode ser pago.`,
          category: "student-billing",
          href: "/aluno/assinatura",
        }).catch(swallow("subscription.carne.notify"))
      }
    } catch (err) {
      result.emitErrors++
      log.error(
        {
          err,
          event: "subscription.carne.emit_failed",
          rowId: row.id,
          subscriptionId: row.subscription.id,
          tenantId: row.subscription.tenantId,
        },
        "boleto da assinatura não foi emitido — nova tentativa amanhã",
      )
    }
  }

  // ── D. Atraso ─────────────────────────────────────────────────────────────
  const open = await prisma.subscriptionPayment.findMany({
    where: {
      number: { not: null },
      paidAt: null,
      status: CARNE_STATUS.PENDING,
      dueDate: { lte: now },
    },
    select: { id: true, dueDate: true, status: true },
    take: 500,
  })
  for (const row of open) {
    if (!isOverdue(row, now)) continue
    await prisma.subscriptionPayment
      .updateMany({
        where: { id: row.id, paidAt: null, status: CARNE_STATUS.PENDING },
        data: { status: CARNE_STATUS.OVERDUE },
      })
      .then((r) => {
        result.markedOverdue += r.count
      })
      .catch(swallow("subscription.carne.mark_overdue"))
  }

  return result
}
