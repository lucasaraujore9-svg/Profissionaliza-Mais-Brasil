import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  validateReferralCode,
} from "@/lib/referrals/capture"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  code: z.string().min(3).max(60),
})

export const POST = withRequestContext(
  { action: "public.capture_ref", route: "/api/public/capture-ref" },
  async (request: Request) => {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 })
  }

  const result = await validateReferralCode(parsed.data.code)
  if (!result) {
    return NextResponse.json({ valid: false }, { status: 404 })
  }

  const store = await cookies()
  store.set(REFERRAL_COOKIE, result.referralCode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
  })

  return NextResponse.json({
    valid: true,
    tenantName: result.tenantName,
    referralCode: result.referralCode,
  })
  },
)
