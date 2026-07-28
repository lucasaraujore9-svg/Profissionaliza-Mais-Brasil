import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const POST = withRequestContext(
  { action: "admin.config.test_mp", route: "/api/admin/config/test-mp" },
  async () => {
  const guard = await requireAdmin("integracoes.manage")
  if (!guard.ok) return guard.response

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
