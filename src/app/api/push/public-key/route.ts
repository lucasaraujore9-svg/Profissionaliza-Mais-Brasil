import { NextResponse } from "next/server"
import { getVapidPublicKey, isPushConfigured } from "@/lib/notifications/push-server"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"

export const GET = withRequestContext(
  { action: "push.public_key", route: "/api/push/public-key" },
  async (_request: Request) => {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Push não configurado neste ambiente" },
      { status: 503 },
    )
  }
  return NextResponse.json({ publicKey: getVapidPublicKey() })
  },
)
