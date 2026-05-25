import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const POST = withRequestContext(
  { action: "admin.config.test_mp", route: "/api/admin/config/test-mp" },
  async () => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const startedAt = Date.now()

  const totalTenants = await prisma.tenant.count()
  const tenantsWithToken = await prisma.tenant.count({
    where: { mpAccessToken: { not: null } },
  })

  return NextResponse.json({
    data: {
      status: "success" as const,
      message: `${tenantsWithToken} de ${totalTenants} revendedores conectaram MP.`,
      durationMs: Date.now() - startedAt,
    },
  })
  },
)
