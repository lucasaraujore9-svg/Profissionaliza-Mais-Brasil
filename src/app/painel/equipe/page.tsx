import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EquipePainelClient } from "@/components/painel/equipe-painel-client"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const dynamic = "force-dynamic"

export default async function EquipePainelPage() {
  await requirePainelPage("equipe.manage")
  const session = await auth()
  const user = session?.user as
    | { id?: string; role?: string; tenantId?: string | null }
    | undefined
  if (!user?.id || user.role !== "RESELLER" || !user.tenantId) {
    redirect("/login?callbackUrl=/painel/equipe")
  }

  // Apenas owner acessa
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { id: true, name: true },
  })
  if (!tenant) redirect("/painel")

  const members = await prisma.tenantMember.findMany({
    where: { tenantId: user.tenantId, role: "consultant" },
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

  const items = members.map((m) => ({
    membershipId: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    maxDiscount: m.maxDiscount,
    status: m.status,
    pendingInvite: !m.user.passwordHash,
    lastActiveAt: m.user.lastActiveAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  }))

  return <EquipePainelClient tenantName={tenant.name} initialItems={items} />
}
