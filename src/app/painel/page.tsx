import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { DashboardWrapper } from "@/components/painel/dashboard-wrapper"

export default async function PainelDashboardPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login")
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { name: true },
  })

  const firstName = user?.name?.split(" ")[0] ?? "Revendedor"

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bem-vindo, ${firstName}`}
        description="Acompanhe receita, alunos e conversão no período escolhido."
      />

      <DashboardWrapper />
    </div>
  )
}
