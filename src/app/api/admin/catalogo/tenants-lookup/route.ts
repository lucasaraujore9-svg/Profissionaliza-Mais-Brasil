import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"

/**
 * Lookup minimo de tenants para popular o multi-select de visibilidade
 * granular em /admin/catalogo. Retorna apenas id/name/slug/status — sem
 * dados sensiveis. Inclui tenants PENDING/SUSPENDED tambem (admin pode
 * pre-configurar allowlist antes do tenant ficar ACTIVE).
 */
export async function GET() {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, status: true },
  })

  return NextResponse.json({ data: tenants })
}
