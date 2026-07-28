import { NextResponse } from "next/server"
import { z } from "zod"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { parseTrackingPixelsInput } from "@/lib/tracking/schema"
import { readPmbPixels, writePmbPixels } from "@/lib/tracking/store"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.system_settings.tracking.get", route: "/api/admin/system-settings/tracking" },
  async () => {
    const guard = await requireAdmin("configuracoes.manage")
    if (!guard.ok) return guard.response
    const pixels = await readPmbPixels()
    return NextResponse.json({ data: pixels })
  },
)

const scopeSchema = z.enum(["self", "global"])

export const PUT = withRequestContext(
  { action: "admin.system_settings.tracking.update", route: "/api/admin/system-settings/tracking" },
  async (request: Request) => {
    const guard = await requireAdmin("configuracoes.manage")
    if (!guard.ok) return guard.response

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const body = payload as { scope?: unknown; pixels?: unknown }
    const scope = scopeSchema.safeParse(body?.scope)
    if (!scope.success) {
      return NextResponse.json(
        { error: "Escopo inválido (use 'self' ou 'global')" },
        { status: 400 },
      )
    }

    const parsed = parseTrackingPixelsInput(body?.pixels)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const data = await writePmbPixels(scope.data, parsed.data)
    return NextResponse.json({ data })
  },
)
