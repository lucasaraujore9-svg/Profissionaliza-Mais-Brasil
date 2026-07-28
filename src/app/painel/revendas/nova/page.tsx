import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import {
  NovaRevendaForm,
  type NovaRevendaInitial,
} from "@/components/painel/nova-revenda-form"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const metadata = {
  title: "Nova revenda | Painel",
}

export default async function NovaRevendaPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>
}) {
  await requirePainelPage("revendas.manage")

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

  // Conversão de lead: pré-preenche o form com os dados do interessado. SÓ um
  // lead atribuído ao código deste vendedor (referrerTenantId) e ainda não
  // convertido é carregado — sem isso o form abre em branco.
  const { leadId } = await searchParams
  let initial: NovaRevendaInitial | undefined
  if (leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, referrerTenantId: tenantId, tenantId: null },
      select: { id: true, companyName: true, email: true, phone: true, cpf: true, slug: true },
    })
    if (lead) {
      initial = {
        name: lead.companyName,
        ownerName: lead.companyName,
        ownerEmail: lead.email,
        ownerPhone: lead.phone || undefined,
        ownerCpfCnpj: lead.cpf || undefined,
        slug: lead.slug || undefined,
        leadId: lead.id,
      }
    }
  }

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
      <NovaRevendaForm initial={initial} />
    </div>
  )
}
