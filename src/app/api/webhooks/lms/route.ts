import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import {
  validateLmsWebhookSignature,
  lmsDedupKey,
} from "@/lib/webhooks/lms-webhook"
import {
  processLmsWebhookEvent,
  isLmsWebhookEvent,
} from "@/lib/webhooks/lms-process"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Webhook receiver de ENTRADA do LMS (LMS -> PMB). Eventos suportados:
 *   course.completed | course.published | course.unpublished | lesson.completed
 *   | student.question.created
 *
 * Segurança: HMAC-SHA256 sobre `"<timestamp>.<rawBody>"` com PMB_WEBHOOK_SECRET.
 * Idempotência: X-PMB-Event-Id (unique em webhook_logs) ou, na ausência do
 * header, um hash determinístico do conteúdo (lmsDedupKey/API-006). Re-entrega
 * cujo evento já foi PROCESSADO com sucesso → 200 duplicate; ainda não → reprocessa.
 * Processa síncrono: 200 = feito, 500 = falha transitória (o LMS re-tenta).
 */

// Header allowlist para o log (NUNCA inclui X-PMB-Signature).
function pickHeaders(request: Request): Record<string, string> {
  const h = request.headers
  return {
    "x-pmb-event-id": h.get("x-pmb-event-id") ?? "",
    "x-pmb-event-type": h.get("x-pmb-event-type") ?? "",
    "x-pmb-timestamp": h.get("x-pmb-timestamp") ?? "",
    "user-agent": h.get("user-agent") ?? "",
    "content-type": h.get("content-type") ?? "",
  }
}

export const POST = withRequestContext(
  { action: "webhooks.lms.receive", route: "/api/webhooks/lms" },
  async (request: Request) => {
    const secret = env.PMB_WEBHOOK_SECRET
    if (!secret) {
      contextLogger().warn(
        { event: "webhooks.lms.not_configured" },
        "PMB_WEBHOOK_SECRET ausente — receiver de webhook do LMS desligado",
      )
      return NextResponse.json(
        { error: "Webhook receiver não configurado." },
        { status: 503 },
      )
    }

    const eventId = request.headers.get("x-pmb-event-id")
    const eventType = request.headers.get("x-pmb-event-type")
    const timestamp = request.headers.get("x-pmb-timestamp")
    const signature = request.headers.get("x-pmb-signature")

    // Corpo CRU (necessário para o HMAC — não usar request.json()).
    const rawBody = await request.text()

    // 1) Assinatura ANTES de qualquer efeito/log (evita spam de não-autenticados).
    if (!validateLmsWebhookSignature(timestamp, rawBody, signature, secret)) {
      return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 })
    }

    // 2) Tipo de evento suportado.
    if (!isLmsWebhookEvent(eventType)) {
      return NextResponse.json(
        { error: `Evento não suportado: ${eventType ?? "(ausente)"}` },
        { status: 400 },
      )
    }

    // 3) Corpo JSON.
    let payload: unknown
    try {
      payload = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
    }

    // 4) Idempotência + log. Chave estável do X-PMB-Event-Id quando presente;
    //    senão, hash determinístico do conteúdo (API-006) — re-entrega idêntica
    //    sem header também deduplica. Se já houver log JÁ processado com esta
    //    chave, devolve duplicate; senão (novo ou reprocessável) segue.
    const dedupKey = lmsDedupKey(eventId, eventType, rawBody)
    const existing = await prisma.webhookLog.findUnique({
      where: { externalEventId: dedupKey },
      select: { id: true, processed: true },
    })
    if (existing?.processed) {
      return NextResponse.json({ received: true, duplicate: true })
    }
    const logId =
      existing?.id ?? (await createLog(eventType, payload, request, dedupKey))

    // 5) Processa síncrono. ok → 200; falha de negócio (não encontrado) → 200
    //    marcando o motivo (retry não ajuda); exceção transitória → 500 (retry).
    try {
      const result = await processLmsWebhookEvent(eventType, payload)
      await prisma.webhookLog.update({
        where: { id: logId },
        data: {
          processed: true,
          processedAt: new Date(),
          error: result.ok ? null : result.message,
        },
      })
      return NextResponse.json({ received: true, ok: result.ok })
    } catch (err) {
      contextLogger().error(
        { err, event: "webhooks.lms.process_failed", eventType, logId },
        "processamento do webhook do LMS falhou — LMS deve re-tentar",
      )
      await prisma.webhookLog
        .update({
          where: { id: logId },
          data: {
            processed: false,
            error: err instanceof Error ? err.message : "erro desconhecido",
          },
        })
        .catch(() => undefined)
      return NextResponse.json(
        { error: "Falha ao processar — re-tente." },
        { status: 500 },
      )
    }
  },
)

async function createLog(
  eventType: string,
  payload: unknown,
  request: Request,
  externalEventId: string | null,
): Promise<string> {
  try {
    const log = await prisma.webhookLog.create({
      data: {
        source: "LMS",
        eventType,
        payload: payload as Prisma.InputJsonValue,
        headers: pickHeaders(request) as Prisma.InputJsonValue,
        externalEventId,
        processed: false,
      },
      select: { id: true },
    })
    return log.id
  } catch (err) {
    // Corrida: duas entregas do mesmo event-id ao mesmo tempo. Re-busca o vencedor.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      externalEventId
    ) {
      const winner = await prisma.webhookLog.findUnique({
        where: { externalEventId },
        select: { id: true },
      })
      if (winner) return winner.id
    }
    throw err
  }
}
