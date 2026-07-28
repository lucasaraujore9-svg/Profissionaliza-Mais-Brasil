import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { EquipePainelClient } from "@/components/painel/equipe-painel-client"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import {
  filterPainelPermissions,
  normalizeMemberRole,
  resolvePermissions,
} from "@/lib/auth/painel-permissions"

export const dynamic = "force-dynamic"

export default async function EquipePainelPage() {
  // `equipe.manage` é OWNER_EXCLUSIVE — na prática, só o titular chega aqui.
  const ctx = await requirePainelPage("equipe.manage")

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { id: true, name: true },
  })
  if (!tenant) redirect("/painel")

  // Todos os papéis da unidade (antes a tela só listava "consultant").
  const members = await prisma.tenantMember.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
          lastActiveAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const items = members.map((m) => {
    const role = normalizeMemberRole(m.role)
    return {
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role,
      extraPermissions: filterPainelPermissions(m.extraPermissions),
      revokedPermissions: filterPainelPermissions(m.revokedPermissions),
      permissions: [
        ...resolvePermissions(role, m.extraPermissions, m.revokedPermissions),
      ],
      maxDiscount: m.maxDiscount,
      status: m.status,
      pendingInvite: !m.user.passwordHash,
      lastActiveAt: m.user.lastActiveAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    }
  })

  return <EquipePainelClient tenantName={tenant.name} initialItems={items} />
}
