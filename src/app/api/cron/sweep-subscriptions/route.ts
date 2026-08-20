import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { runInChunks } from "@/lib/concurrency"
import {
  SUBSCRIPTION_GRACE_DAYS,
  subscriptionShouldCancel,
} from "@/lib/subscriptions/access"
import { cancelSubscriptionAccess } from "@/lib/subscriptions/cancel"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Varredura diaria das assinaturas de aluno.
 *
 * POR QUE PRECISA EXISTIR: a queda de uma assinatura NAO chega sozinha. Com
 * cartao, o gateway avisa quando a cobranca falha; com PIX e boleto ele so
 * EMITE a fatura — se o aluno simplesmente nao pagar, nenhum evento e disparado
 * e a assinatura ficaria valendo para sempre. Este cron e o unico ponto que
 * converte "parou de pagar" em "perdeu acesso".
 *
 * DUAS FASES, deliberadamente separadas:
 *
 *   1. Ciclo vencido e ainda dentro da carencia -> PAST_DUE. So marca. NAO toca
 *      na fornecedora, porque na EA revogar um curso APAGA o progresso do aluno
 *      (desvincular e revincular zera) — quem se atrasou e pagou nao pode perder
 *      o que assistiu.
 *   2. Carencia esgotada -> cancelamento definitivo, com revogacao. E aqui, e so
 *      aqui, que o acesso e cortado.
 */
async function processSubscriptions() {
  const now = new Date()
  const result = {
    inspected: 0,
    markedPastDue: 0,
    cancelled: 0,
    errors: [] as string[],
  }

  // Universo: assinaturas vivas cujo ciclo pago JA venceu. Quem esta em dia nao
  // entra na varredura.
  const candidates = await prisma.studentSubscription.findMany({
    where: {
      status: { in: ["ACTIVE", "PAST_DUE"] },
      currentPeriodEnd: { not: null, lt: now },
    },
    select: { id: true, status: true, currentPeriodEnd: true },
    orderBy: { currentPeriodEnd: "asc" },
    take: 500,
  })
  result.inspected = candidates.length

  // ── Fase 1: dentro da carência → só marca ──
  const toMark = candidates.filter(
    (s) => s.status === "ACTIVE" && !subscriptionShouldCancel(s, now),
  )
  if (toMark.length > 0) {
    const marked = await prisma.studentSubscription.updateMany({
      where: { id: { in: toMark.map((s) => s.id) } },
      data: { status: "PAST_DUE" },
    })
    result.markedPastDue = marked.count
  }

  // ── Fase 2: carência esgotada → cancela e revoga ──
  const toCancel = candidates.filter((s) => subscriptionShouldCancel(s, now))

  // Lotes pequenos: cada cancelamento fala com a fornecedora, curso a curso.
  const settled = await runInChunks(toCancel, 3, async (s) => {
    await cancelSubscriptionAccess(s.id, "PAST_DUE", true)
    return s.id
  })
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") result.cancelled += 1
    else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      result.errors.push(`subscription ${toCancel[i].id}: ${msg}`)
    }
  })

  contextLogger().info(
    { event: "cron.sweep_subscriptions", ...result, graceDays: SUBSCRIPTION_GRACE_DAYS },
    "varredura de assinaturas concluida",
  )

  return result
}

export const GET = withRequestContext(
  { action: "cron.sweep_subscriptions", route: "/api/cron/sweep-subscriptions" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const result = await processSubscriptions()
    return NextResponse.json({ data: result })
  },
)
