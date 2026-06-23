import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { NovaRevendaForm } from "@/components/painel/nova-revenda-form"

export const metadata = {
  title: "Nova revenda | Painel",
}

export default async function NovaRevendaPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/revendas/nova")
  }
  const tenantId = session.user.tenantId as string
  const userId = session.user.id as string

  const [owner, tenant] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { canSellResellers: true, status: true },
    }),
  ])
  if (!owner || !tenant?.canSellResellers || tenant.status !== "ACTIVE") redirect("/painel")

  return (
    <div className="space-y-6">
      <Link
        href="/painel/revendas"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[var(--color-pmb-green)]"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar para revendas
      </Link>
      <PageHeader
        title="Nova revenda"
        description="Cadastre uma nova revenda atrelada a você. A cobrança da mensalidade é feita pela PMB."
      />
      <NovaRevendaForm />
    </div>
  )
}
