import { NextResponse } from "next/server"
import { z } from "zod"
import { rateLimit, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { resolveTenantFromRequest } from "@/lib/tenant/from-request"
import { isPmbAutomationEnabled } from "@/lib/automation/context"
import {
  generateVisitorId,
  readVisitorId,
  recordVisitorEvent,
  visitorCookie,
} from "@/lib/automation/tracking"

const bodySchema = z.object({
  path: z.string().trim().min(1).max(800),
  title: z.string().trim().max(300).optional().nullable(),
  courseSlug: z.string().trim().max(200).optional().nullable(),
  referrer: z.string().trim().max(500).optional().nullable(),
})

// Resposta neutra (sem corpo). Quando ja temos um visitorId no cookie, apenas
// 204; quando geramos um novo, anexamos o Set-Cookie.
function noContent(setCookieValue?: string): NextResponse {
  const res = new NextResponse(null, { status: 204 })
  if (setCookieValue) res.cookies.set(visitorCookie(setCookieValue))
  return res
}

export const POST = withRequestContext(
  { action: "loja.track", route: "/api/loja/track" },
  async (request: Request) => {
    // failOpen — nunca bloqueia navegacao.
    const rl = await rateLimit(request, RATE_LIMITS.lojaTrack)
    if (!rl.ok) return noContent()

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return noContent()
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) return noContent()

    // Tenant pelo header injetado pelo proxy; ausente = vitrine PMB (null).
    const tenant = await resolveTenantFromRequest(request)
    const tenantId: string | null = tenant?.id ?? null

    // Gate do modulo de automacao. Desabilitado = no-op silencioso (204).
    const enabled = tenant
      ? tenant.automationEnabled
      : await isPmbAutomationEnabled()
    if (!enabled) return noContent()

    // Cookie anonimo: reaproveita ou gera. Gerar nao impede gravar o 1o evento.
    const existingVid = readVisitorId(request)
    const visitorId = existingVid ?? generateVisitorId()

    try {
      await recordVisitorEvent({
        tenantId,
        visitorId,
        path: parsed.data.path,
        title: parsed.data.title,
        courseSlug: parsed.data.courseSlug,
        referrer: parsed.data.referrer,
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "loja.track.record_failed", tenantId },
        "Falha ao gravar VisitorEvent",
      )
    }

    return noContent(existingVid ? undefined : visitorId)
  },
)
