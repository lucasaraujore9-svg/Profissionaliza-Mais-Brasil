import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  validateAsaasWebhook,
  parseAsaasWebhookPayload,
} from "@/lib/asaas/webhook"
import { processAsaasWebhook } from "@/lib/asaas/process"
import {
  runWithRequestContext,
  extendRequestContext,
} from "@/lib/observability/request-context"
import { contextLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// Asaas exige <22s de resposta — mas como fulfill é idempotente,
// preferimos await + retry do Asaas a fire-and-forget que perde eventos.
export const maxDuration = 60

function pickHeaders(request: Request): Record<string, string> {
  // Redact `asaas-access-token` ao persistir no WebhookLog: o valor cru
  // permitiria a alguém com acesso ao DB forjar webhooks. Guardamos apenas
  // os primeiros e últimos 4 chars + sufixo de hash para troubleshooting de
  // configs erradas sem expor o segredo inteiro.
  const keys = ["user-agent", "content-type", "x-forwarded-for"]
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = request.headers.get(key)
    if (value) out[key] = value
  }
  const tokenRaw = request.headers.get("asaas-access-token")
  if (tokenRaw) {
    const len = tokenRaw.length
    out["asaas-access-token"] =
      len > 8 ? `${tokenRaw.slice(0, 4)}…${tokenRaw.slice(-4)} (len=${len})` : "[redacted]"
  }
  return out
}

export async function POST(request: Request) {
  return runWithRequestContext(
    { action: "asaas.webhook", route: "/api/webhooks/asaas" },
    () => handle(request),
  )
}

async function handle(request: Request) {
  const log = contextLogger()
  const token = request.headers.get("asaas-access-token")

  try {
    if (!validateAsaasWebhook(token)) {
      log.warn({ event: "asaas.webhook.invalid_token" }, "token inválido")
      return NextResponse.json({ error: "invalid token" }, { status: 401 })
    }
  } catch (error) {
    // Detalhe fica no log (interno); ao chamador não-autenticado devolvemos
    // mensagem genérica para não vazar estado de configuração do servidor.
    log.error({ err: error, event: "asaas.webhook.config_error" }, "erro de config no validateAsaasWebhook")
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (err) {
    log.warn({ err, event: "asaas.webhook.invalid_json" }, "body não é JSON válido")
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  let payload
  try {
    payload = parseAsaasWebhookPayload(body)
  } catch (err) {
    log.warn({ err, event: "asaas.webhook.invalid_payload" }, "payload Asaas falhou validação Zod")
    return NextResponse.json({ error: "invalid payload" }, { status: 400 })
  }

  const dbLog = await prisma.webhookLog.create({
    data: {
      source: "ASAAS",
      eventType: payload.event,
      payload: body as never,
      headers: pickHeaders(request) as never,
      processed: false,
    },
    select: { id: true },
  })

  extendRequestContext({ webhookLogId: dbLog.id, eventType: payload.event })
  log.info({ event: "asaas.webhook.received", webhookLogId: dbLog.id, eventType: payload.event }, "webhook Asaas recebido")

  try {
    await processAsaasWebhook(dbLog.id, payload)
    log.info({ event: "asaas.webhook.processed", webhookLogId: dbLog.id }, "webhook Asaas processado")
  } catch (error) {
    // 500 → Asaas retenta. Processador é idempotente (asaasPaymentId check).
    log.error(
      { err: error, event: "asaas.webhook.processing_failed", webhookLogId: dbLog.id },
      "processAsaasWebhook lançou — Asaas vai retentar",
    )
    return NextResponse.json({ error: "processing failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
