import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { extractPaymentIdFromNotification } from "@/lib/mercadopago/webhook"
import { processMpWebhook } from "@/lib/mercadopago/process"
import type { MPWebhookNotification } from "@/lib/mercadopago/types"

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

  const paymentId = extractPaymentIdFromNotification(body, queryDataId)

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

  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")

  void processMpWebhook({
    logId: log.id,
    paymentId,
    xSignature,
    xRequestId,
    dataId: queryDataId ?? String(paymentId),
  })

  return NextResponse.json({ received: true }, { status: 200 })
}
