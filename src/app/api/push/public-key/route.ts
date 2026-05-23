import { NextResponse } from "next/server"
import { getVapidPublicKey, isPushConfigured } from "@/lib/notifications/push-server"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Push não configurado neste ambiente" },
      { status: 503 },
    )
  }
  return NextResponse.json({ publicKey: getVapidPublicKey() })
}
