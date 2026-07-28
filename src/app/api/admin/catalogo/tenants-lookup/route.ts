import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

/**
 * Lookup minimo de tenants para popular o multi-select de visibilidade
 * granular em /admin/catalogo. Retorna apenas id/name/slug/status — sem
 * dados sensiveis. Inclui tenants PENDING/SUSPENDED tambem (admin pode
 * pre-configurar allowlist antes do tenant ficar ACTIVE).
 */
export const GET = withRequestContext(
  { action: "admin.catalogo.tenants_lookup", route: "/api/admin/catalogo/tenants-lookup" },
  async () => {
  const guard = await requireAdmin("catalogo.view")
  if (!guard.ok) return guard.response

  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, status: true },
  })

  return NextResponse.json({ data: tenants })
  },
)
