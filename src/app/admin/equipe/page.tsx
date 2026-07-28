import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { EquipeClient } from "@/components/admin/equipe-client"
import { PMB_TEAM_ROLES } from "@/lib/auth/roles"
import { filterAdminPermissions } from "@/lib/auth/admin-permissions"

export const dynamic = "force-dynamic"

export default async function EquipePage() {
  await requireAdminPage("equipe.manage")

  const users = await prisma.user.findMany({
    where: { role: { in: [...PMB_TEAM_ROLES] } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      phone: true,
      salesManagerId: true,
      salesManager: { select: { name: true } },
      lastActiveAt: true,
      passwordHash: true,
      createdAt: true,
      extraPermissions: true,
      revokedPermissions: true,
    },
    orderBy: { name: "asc" },
  })

  const salesManagers = await prisma.user.findMany({
    where: { role: "PMB_SALES_MGR", status: "ATIVO" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  const items = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    phone: u.phone,
    salesManagerId: u.salesManagerId,
    salesManagerName: u.salesManager?.name ?? null,
    lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
    pendingInvite: !u.passwordHash,
    createdAt: u.createdAt.toISOString(),
    // Só o total: a listagem mostra o selo "ajustado"; o detalhe mostra quais.
    customPermissionCount:
      filterAdminPermissions(u.extraPermissions).length +
      filterAdminPermissions(u.revokedPermissions).length,
  }))

  return <EquipeClient initialItems={items} salesManagers={salesManagers} />
}
