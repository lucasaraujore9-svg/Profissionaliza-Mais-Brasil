import { NextResponse } from "next/server"
import { validateReferralCode } from "@/lib/referrals/capture"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "public.validate_ref", route: "/api/public/validate-ref" },
  async (request: Request) => {
  // Endpoint publico nao autenticado que faz lookup no banco e revela
  // tenantName — limita enumeracao/abuso por IP.
  const rl = await rateLimit(request, RATE_LIMITS.leads)
  if (!rl.ok) return rateLimitResponse(rl)

  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")?.trim() ?? ""
  if (!code) {
    return NextResponse.json(
      { valid: false, error: "Codigo ausente" },
      { status: 400 },
    )
  }
  const result = await validateReferralCode(code)
  if (!result) {
    return NextResponse.json({ valid: false }, { status: 404 })
  }
  return NextResponse.json({
    valid: true,
    tenantName: result.tenantName,
    referralCode: result.referralCode,
  })
  },
)
