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
import {
  cancelSubscriptionAccess,
  revokeEndedSubscriptionAccess,
} from "@/lib/subscriptions/cancel"
import { LIVE_ENROLLMENT_STATUSES } from "@/lib/subscriptions/access"

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
 *   2. Carencia esgotada -> cancelamento definitivo, com revogacao.
 *   3. Assinatura JA ENCERRADA (o aluno cancelou) cujo periodo pago acabou ->
 *      corta os cursos que ela abriu. Sem esta fase ninguem cortava: o
 *      cancelamento pedido pelo aluno mantem o acesso ate o fim do ciclo, e as
 *      fases acima so olham ACTIVE/PAST_DUE — os cursos ficavam abertos para
 *      sempre. Tambem refaz revogacoes que falharam antes.
 */
async function processSubscriptions() {
  const now = new Date()
  const result = {
    inspected: 0,
    markedPastDue: 0,
    cancelled: 0,
    endedAccessRevoked: 0,
    endedAccessAdopted: 0,
    errors: [] as string[],
  }

  // Universo: assinaturas vivas cujo ciclo pago JA venceu. Quem esta em dia nao
  // entra na varredura.
  //
  // VITALICIA fica de fora por DUAS travas: o filtro abaixo (`interval` nao e
  // LIFETIME) e o predicado puro `subscriptionShouldCancel`, que recusa o
  // vitalicio mesmo que a linha chegue aqui. Duas porque o preco do erro e
  // altissimo — cancelar revoga o curso na fornecedora legada, e la desvincular
  // APAGA o progresso do aluno. Uma `currentPeriodEnd` gravada por engano num
  // acesso permanente nao pode virar corte silencioso.
  const candidates = await prisma.studentSubscription.findMany({
    where: {
      status: { in: ["ACTIVE", "PAST_DUE"] },
      interval: { not: "LIFETIME" },
      currentPeriodEnd: { not: null, lt: now },
    },
    select: { id: true, status: true, currentPeriodEnd: true, interval: true },
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

  // ── Fase 3: encerrada com periodo pago vencido → corta o que sobrou aberto ──
  // O `where` so pre-seleciona (tem matricula viva e ciclo vencido); a decisao
  // final e do predicado puro, dentro de `revokeEndedSubscriptionAccess`.
  const ended = await prisma.studentSubscription.findMany({
    where: {
      status: { in: ["CANCELLED", "EXPIRED"] },
      interval: { not: "LIFETIME" },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lte: now } }],
      enrollments: { some: { status: { in: [...LIVE_ENROLLMENT_STATUSES] } } },
    },
    select: { id: true },
    orderBy: { cancelledAt: "asc" },
    take: 200,
  })
  const endedSettled = await runInChunks(ended, 3, async (s) =>
    revokeEndedSubscriptionAccess(s.id, now),
  )
  endedSettled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.status === "done") {
        result.endedAccessRevoked += r.value.enrollmentsCancelled
        result.endedAccessAdopted += r.value.adopted
        result.errors.push(...r.value.errors.map((e) => `subscription ${ended[i].id}: ${e}`))
      }
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      result.errors.push(`ended subscription ${ended[i].id}: ${msg}`)
    }
  })

  contextLogger().info(
    { event: "cron.sweep_subscriptions", ...result, graceDays: SUBSCRIPTION_GRACE_DAYS },
    "varredura de assinaturas concluida",
  )

  return result
}

// POST, como os demais crons: `app_internal.run_cron` (pg_cron -> pg_net) faz
// POST, e um GET aqui responderia 405 — o job rodaria todo dia sem fazer nada.
export const POST = withRequestContext(
  { action: "cron.sweep_subscriptions", route: "/api/cron/sweep-subscriptions" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const result = await processSubscriptions()
    return NextResponse.json({ data: result })
  },
)
