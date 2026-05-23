import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { extractPaymentIdFromNotification } from "@/lib/mercadopago/webhook"
import { processMpWebhook } from "@/lib/mercadopago/process"
import type { MPWebhookNotification } from "@/lib/mercadopago/types"
import { getAuthorizedPayment } from "@/lib/mercadopago/client"
import { pmbMpAccessToken } from "@/lib/pmb-config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
  // Defesa basica anti-flood: webhooks legitimos do MP sempre carregam
  // x-signature + x-request-id. Sem isso nao criamos WebhookLog nem fazemos
  // queries — bots apontados ao endpoint sao descartados cedo.
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")
  if (process.env.NODE_ENV === "production" && (!xSignature || !xRequestId)) {
    return NextResponse.json({ error: "missing signature" }, { status: 401 })
  }

  let body: MPWebhookNotification | null = null
  try {
    const raw = await request.text()
    body = raw ? (JSON.parse(raw) as MPWebhookNotification) : null
  } catch {
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
      console.warn("[mp webhook] authorized_payment lookup falhou:", err)
    }
  }

  const log = await prisma.webhookLog.create({
    data: {
      source: "MERCADO_PAGO",
      eventType: topic,
      payload: (body ?? {}) as never,
      headers: pickHeaders(request) as never,
      processed: false,
    },
    select: { id: true },
  })

  if (!paymentId) {
    await prisma.webhookLog
      .update({
        where: { id: log.id },
        data: {
          processed: true,
          processedAt: new Date(),
          error: "sem payment id",
        },
      })
      .catch(() => undefined)
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const tenantSlug = searchParams.get("tenant") ?? null

  void processMpWebhook({
    logId: log.id,
    paymentId,
    xSignature,
    xRequestId,
    tenantSlug,
    dataId: queryDataId ?? String(paymentId),
  })

  return NextResponse.json({ received: true }, { status: 200 })
}
