import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { parseTrackingPixelsInput } from "@/lib/tracking/schema"
import { readTenantPixels, writeTenantPixels } from "@/lib/tracking/store"

export const GET = withRequestContext(
  { action: "painel.tracking.get", route: "/api/painel/tracking" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    const pixels = await readTenantPixels(ctx.tenantId)
    return NextResponse.json({ data: pixels })
  },
)

export const PUT = withRequestContext(
  { action: "painel.tracking.update", route: "/api/painel/tracking" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = parseTrackingPixelsInput(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, slug: true, customDomain: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }

    const pixels = await writeTenantPixels(tenant, parsed.data)
    return NextResponse.json({ data: pixels })
  },
)
