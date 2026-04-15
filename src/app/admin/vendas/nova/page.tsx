import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { NovaVendaClient } from "@/components/admin/nova-venda-client"

export const dynamic = "force-dynamic"

export default async function NovaVendaPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/vendas/nova")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  const courses = await prisma.course.findMany({
    where: { status: "ATIVO" },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      precoVitrineMain: true,
      precoPromocional: true,
      precoOriginal: true,
    },
  })

  return (
    <div className="p-8">
      <NovaVendaClient
        role={session.role}
        courses={courses.map((c) => ({
          id: c.id,
          nome: c.nome,
          preco: Number(
            c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal ?? 0,
          ),
        }))}
      />
    </div>
  )
}
