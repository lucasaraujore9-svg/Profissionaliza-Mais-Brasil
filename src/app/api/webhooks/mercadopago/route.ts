import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { extractPaymentIdFromNotification } from "@/lib/mercadopago/webhook"
import { processMpWebhook } from "@/lib/mercadopago/process"
import type { MPWebhookNotification } from "@/lib/mercadopago/types"
import { getAuthorizedPayment } from "@/lib/mercadopago/client"
import { pmbMpAccessToken } from "@/lib/pmb-config"
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
  const keys = ["x-signature", "x-request-id", "user-agent", "content-type"]
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = request.headers.get(key)
    if (value) out[key] = value
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

  let paymentId = extractPaymentIdFromNotification(body, queryDataId)

  // Topic "subscription_authorized_payment": data.id e o id do authorized
  // payment, nao do payment direto. Buscamos o payment_id real via API MP
  // e seguimos o fluxo padrao.
  if (
    !paymentId &&
    (topic === "subscription_authorized_payment" ||
      topic.includes("subscription_authorized_payment")) &&
    queryDataId
  ) {
    try {
      const token = await pmbMpAccessToken()
      if (token) {
        const ap = await getAuthorizedPayment(token, queryDataId)
        if (ap.payment_id) paymentId = String(ap.payment_id)
      }
    } catch (err) {
      log.warn(
        { err, event: "mp.webhook.authorized_payment_lookup_failed", queryDataId },
        "authorized_payment lookup falhou",
      )
    }
  }

  const dbLog = await prisma.webhookLog.create({
    data: {
      source: "MERCADO_PAGO",
      eventType: topic,
      payload: (body ?? {}) as never,
      headers: pickHeaders(request) as never,
      processed: false,
    },
    select: { id: true },
  })

  extendRequestContext({ webhookLogId: dbLog.id, paymentId })
  log.info({ event: "mp.webhook.received", webhookLogId: dbLog.id, topic, paymentId }, "webhook MP recebido")

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
