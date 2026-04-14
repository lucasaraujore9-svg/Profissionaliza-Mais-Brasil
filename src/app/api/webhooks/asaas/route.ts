import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  validateAsaasWebhook,
  parseAsaasWebhookPayload,
} from "@/lib/asaas/webhook"
import { processAsaasWebhook } from "@/lib/asaas/process"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function pickHeaders(request: Request): Record<string, string> {
  const keys = [
    "asaas-access-token",
    "user-agent",
    "content-type",
    "x-forwarded-for",
  ]
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = request.headers.get(key)
    if (value) out[key] = value
  }
  return out
}

export async function POST(request: Request) {
  const token = request.headers.get("asaas-access-token")

  try {
    if (!validateAsaasWebhook(token)) {
      return NextResponse.json({ error: "invalid token" }, { status: 401 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "config error"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  let payload
  try {
    payload = parseAsaasWebhookPayload(body)
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 })
  }

  const log = await prisma.webhookLog.create({
    data: {
      source: "ASAAS",
      eventType: payload.event,
      payload: body as never,
      headers: pickHeaders(request) as never,
      processed: false,
    },
    select: { id: true },
  })

  void processAsaasWebhook(log.id, payload)

  return NextResponse.json({ received: true }, { status: 200 })
}
