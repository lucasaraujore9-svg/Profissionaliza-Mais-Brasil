import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { PainelNovaVendaClient } from "@/components/painel/painel-nova-venda-client"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"

export const dynamic = "force-dynamic"

export default async function PainelNovaVendaPage() {
  const session = await auth()
  const user = session?.user as
    | { id?: string; tenantId?: string | null; role?: string }
    | undefined
  if (!user?.id) redirect("/login?callbackUrl=/painel/vendas/nova")
  if (!user.tenantId) redirect("/painel")

  await ensureTenantCourses(user.tenantId)

  const tenantCourses = await prisma.tenantCourse.findMany({
    where: { tenantId: user.tenantId, isVisible: true },
    orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }],
    include: {
      course: { select: { nome: true, status: true } },
    },
  })

  const courses = tenantCourses
    .filter((tc) => tc.course.status === "ATIVO")
    .map((tc) => ({
      id: tc.id,
      nome: tc.course.nome,
      price: Number(tc.price),
      paymentType: tc.paymentType,
    }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova venda direta"
        description="Cadastre o aluno, escolha o curso e gere o link de pagamento."
      />
      <PainelNovaVendaClient courses={courses} />
    </div>
  )
}
