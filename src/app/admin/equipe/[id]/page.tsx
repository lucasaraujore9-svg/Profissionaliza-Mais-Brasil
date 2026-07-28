import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { EquipeDetailClient } from "@/components/admin/equipe-detail-client"
import { isPmbTeamRole } from "@/lib/auth/roles"
import { filterAdminPermissions } from "@/lib/auth/admin-permissions"

export const dynamic = "force-dynamic"

export default async function EquipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireAdminPage("equipe.manage")

  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      phone: true,
      image: true,
      salesManagerId: true,
      salesManager: { select: { name: true } },
      maxDiscount: true,
      lastActiveAt: true,
      passwordHash: true,
      createdAt: true,
      extraPermissions: true,
      revokedPermissions: true,
    },
  })

  if (!user || !isPmbTeamRole(user.role)) notFound()

  const salesManagers = await prisma.user.findMany({
    where: { role: "PMB_SALES_MGR", status: "ATIVO" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <EquipeDetailClient
      member={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        phone: user.phone,
        image: user.image,
        salesManagerId: user.salesManagerId,
        salesManagerName: user.salesManager?.name ?? null,
        maxDiscount: user.maxDiscount,
        lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
        pendingInvite: !user.passwordHash,
        createdAt: user.createdAt.toISOString(),
        extraPermissions: filterAdminPermissions(user.extraPermissions),
        revokedPermissions: filterAdminPermissions(user.revokedPermissions),
      }}
      isSelf={user.id === session.userId}
      salesManagers={salesManagers}
    />
  )
}
