import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import {
  LeadsRevendaList,
  type RevendaLead,
  type LeadStatus,
} from "@/components/admin/leads-revenda-list"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const metadata = {
  title: "Leads de revenda | Painel",
}

export default async function PainelLeadsRevendaPage() {
  await requirePainelPage("revendas.manage")

  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/revendas/leads")
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

  // Leads de revenda atribuídos ao código de indicação desta unidade — quem usou
  // ?ref=CODIGO no /seja-revendedor ou digitou o código no formulário. A
  // atribuição (referrerTenantId) é resolvida server-side via cookie pmb_referral,
  // então sobrevive mesmo se o interessado apagar o campo do formulário.
  const leads = await prisma.lead.findMany({
    where: { referrerTenantId: tenantId },
    select: {
      id: true,
      email: true,
      companyName: true,
      phone: true,
      plan: true,
      city: true,
      state: true,
      source: true,
      cpf: true,
      slug: true,
      status: true,
      notes: true,
      createdAt: true,
      tenantId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  })

  const mapped: RevendaLead[] = leads.map((l) => ({
    id: l.id,
    email: l.email,
    companyName: l.companyName,
    phone: l.phone,
    plan: l.plan,
    city: l.city,
    state: l.state,
    source: l.source,
    cpf: l.cpf,
    slug: l.slug,
    status: l.status as LeadStatus,
    notes: l.notes,
    createdAt: l.createdAt.toISOString(),
    // O próprio vendedor é o indicador — não repete "indicado por".
    referrerName: null,
    convertedTenantId: l.tenantId,
    // Dono interno (vendedor PMB) não é exposto ao revendedor.
    ownerUserId: null,
    ownerName: null,
  }))

  return (
    <div className="space-y-6">
      <Link
        href="/painel/revendas"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[var(--color-pmb-green)]"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar para revendas
      </Link>
      <PageHeader
        title="Leads de revenda"
        description="Interessados que chegaram pelo seu código de indicação. Fale com eles e converta em revenda quando estiverem prontos."
      />
      <LeadsRevendaList
        leads={mapped}
        apiBase="/api/painel/revendas/leads"
        canConvert
        convertHrefBase="/painel/revendas/nova"
      />
    </div>
  )
}
