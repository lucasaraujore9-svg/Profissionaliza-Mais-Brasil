import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { extractPaymentIdFromNotification } from "@/lib/mercadopago/webhook"
import { processMpWebhook } from "@/lib/mercadopago/process"
import type { MPWebhookNotification } from "@/lib/mercadopago/types"
import { redactWebhookPayload } from "@/lib/webhooks/redact-payload"
import { swallow } from "@/lib/errors"
import {
  runWithRequestContext,
  extendRequestContext,
} from "@/lib/observability/request-context"
import { contextLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// Webhook processa síncrono (fulfillment + plataforma + email). Se falhar,
// MP retenta — idempotência via mpPaymentId no fulfill garante segurança.
export const maxDuration = 60

function pickHeaders(request: Request): Record<string, string> {
  // Redact `x-signature` ao persistir no WebhookLog: contém HMAC ts+v1 que,
  // junto com o payload + MP_WEBHOOK_SECRET, permitiria a um atacante validar
  // se conseguiu forjar webhook. Mantemos apenas o `ts=` para troubleshooting
  // de relógio dessincronizado (problema comum em deploys de containers).
  const keys = ["x-request-id", "user-agent", "content-type"]
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = request.headers.get(key)
    if (value) out[key] = value
  }
  const sigRaw = request.headers.get("x-signature")
  if (sigRaw) {
    const ts = sigRaw.match(/ts=(\d+)/)?.[1]
    out["x-signature"] = ts ? `ts=${ts},v1=[redacted]` : "[redacted]"
  }
  return out
}

export async function POST(request: Request) {
  return runWithRequestContext(
    { action: "mp.webhook", route: "/api/webhooks/mercadopago" },
    () => handle(request),
  )
}

async function handle(request: Request) {
  const log = contextLogger()
  // Defesa basica anti-flood: webhooks legitimos do MP sempre carregam
  // x-signature + x-request-id. Sem isso nao criamos WebhookLog nem fazemos
  // queries — bots apontados ao endpoint sao descartados cedo.
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")
  if (process.env.NODE_ENV === "production" && (!xSignature || !xRequestId)) {
    log.warn({ event: "mp.webhook.missing_signature" }, "request sem x-signature/x-request-id rejeitado")
    return NextResponse.json({ error: "missing signature" }, { status: 401 })
  }

  // Propaga x-request-id do MP como nosso requestId quando disponível —
  // permite correlacionar com logs do próprio MP em investigações.
  if (xRequestId) extendRequestContext({ mpRequestId: xRequestId })

  let body: MPWebhookNotification | null = null
  try {
    const raw = await request.text()
    body = raw ? (JSON.parse(raw) as MPWebhookNotification) : null
  } catch (err) {
    log.warn({ err, event: "mp.webhook.invalid_json" }, "body não é JSON válido")
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const queryDataId = searchParams.get("data.id") ?? searchParams.get("id")
  const topic =
    body?.type ??
    body?.action ??
    searchParams.get("topic") ??
    searchParams.get("type") ??
    "unknown"

  extendRequestContext({ topic })

  // MP envia cada evento em DOIS formatos quando a conta tem o IPN legado
  // habilitado: o webhook novo (body.type/action + data.id, assinado via
  // x-signature com manifest id/request-id/ts) e o IPN antigo
  // ({topic, resource}), cuja assinatura NÃO segue esse manifest e por isso
  // sempre falhava a validação, deixando um rastro permanente de
  // processed=false + "hmac invalid" no WebhookLog a cada pagamento.
  // O evento real é processado pela notificação nova; o IPN é registrado
  // abaixo e encerrado como duplicata ignorada.
  const legacyTopic = (body as { topic?: unknown } | null)?.topic
  const isLegacyIpn =
    typeof legacyTopic === "string" && !body?.type && !body?.action

  // Para subscription_authorized_payment, data.id é o id do AUTHORIZED PAYMENT
  // (não do payment direto). A resolução do payment_id real é feita DENTRO de
  // processMpWebhook, com o TOKEN DO TENANT correto (resolvido por ?tenant) —
  // antes era tentada aqui SEMPRE com o token PMB e, pior, num branch inalcançável
  // (extractPaymentIdFromNotification já devolve data.id como fallback). `topic`
  // é repassado para o processador decidir.
  const paymentId = extractPaymentIdFromNotification(body, queryDataId)

  const dbLog = await prisma.webhookLog.create({
    data: {
      source: "MERCADO_PAGO",
      eventType: topic,
      // OBS-008/LGPD-014: redige eventuais campos de PII antes de persistir.
      payload: redactWebhookPayload(body ?? {}) as never,
      headers: pickHeaders(request) as never,
      processed: false,
    },
    select: { id: true },
  })

  extendRequestContext({ webhookLogId: dbLog.id, paymentId })
  log.info({ event: "mp.webhook.received", webhookLogId: dbLog.id, topic, paymentId }, "webhook MP recebido")

  if (isLegacyIpn) {
    await prisma.webhookLog
      .update({
        where: { id: dbLog.id },
        data: {
          processed: true,
          processedAt: new Date(),
          error: "ipn legado ignorado (duplicata do webhook assinado)",
        },
      })
      .catch(swallow("mp.webhook.markLog"))
    log.info(
      { event: "mp.webhook.legacy_ipn_skipped", webhookLogId: dbLog.id, paymentId },
      "notificação IPN legada ignorada — evento chega pelo webhook assinado",
    )
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (!paymentId) {
    await prisma.webhookLog
      .update({
        where: { id: dbLog.id },
        data: {
          processed: true,
          processedAt: new Date(),
          error: "sem payment id",
        },
      })
      .catch(swallow("mp.webhook.markLog"))
    log.info({ event: "mp.webhook.no_payment_id", webhookLogId: dbLog.id }, "notificação sem payment id — ignorada")
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // tenantSlug vem da query `?tenant=<slug>` que NÓS preenchemos na
  // notification_url ao criar a preference. Aceita só [a-z0-9_-] pra não
  // virar vetor de log-injection / SSRF se alguém forjar um webhook.
  // Defesa em profundidade real:
  //  1) HMAC SHA256 com MP_WEBHOOK_SECRET (validado em processMpWebhook)
  //  2) getPayment(tenant.mpAccessToken, paymentId) — paymentId precisa
  //     pertencer à conta MP daquele tenant, senão a API MP retorna 404.
  //  3) Idempotência por mpPaymentId — replays são no-op.
  const rawTenant = searchParams.get("tenant")
  const tenantSlug =
    rawTenant && /^[a-z0-9_-]{1,64}$/i.test(rawTenant) ? rawTenant : null
  if (tenantSlug) extendRequestContext({ tenantSlug })

  try {
    await processMpWebhook({
      logId: dbLog.id,
      paymentId,
      xSignature,
      xRequestId,
      tenantSlug,
      topic,
      dataId: queryDataId ?? String(paymentId),
    })
    log.info({ event: "mp.webhook.processed", webhookLogId: dbLog.id, paymentId }, "webhook MP processado")
  } catch (error) {
    // 500 sinaliza ao MP que retente. WebhookLog já foi gravado com processed=false
    // e o processador é idempotente (mpPaymentId check).
    log.error(
      { err: error, event: "mp.webhook.processing_failed", webhookLogId: dbLog.id, paymentId },
      "processMpWebhook lançou — MP vai retentar",
    )
    return NextResponse.json({ error: "processing failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
