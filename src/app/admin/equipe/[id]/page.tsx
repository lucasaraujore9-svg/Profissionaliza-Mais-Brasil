import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { EquipeDetailClient } from "@/components/admin/equipe-detail-client"

const PMB_ROLES = ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] as const

export const dynamic = "force-dynamic"

export default async function EquipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/equipe")
  if (session.role !== "SUPER_ADMIN") redirect("/admin")

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
      lastActiveAt: true,
      passwordHash: true,
      createdAt: true,
    },
  })

  if (!user || !(PMB_ROLES as readonly string[]).includes(user.role)) notFound()

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
        lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
        pendingInvite: !user.passwordHash,
        createdAt: user.createdAt.toISOString(),
      }}
      isSelf={user.id === session.userId}
    />
  )
}
