import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { vitrineUrl as buildVitrineUrl } from "@/lib/tenant/urls"
import {
  SubRevendaDetail,
  type SubRevendaDetailData,
} from "@/components/painel/sub-revenda-detail"

export const metadata = {
  title: "Detalhe da revenda | Painel",
}

export default async function SubRevendaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/revendas")
  }
  const sellerTenantId = session.user.tenantId as string
  const userId = session.user.id as string

  // Mesmo gate de requireResellerSeller: owner direto + módulo ligado + ACTIVE.
  const [owner, seller] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, tenantId: sellerTenantId }, select: { id: true } }),
    prisma.tenant.findUnique({
      where: { id: sellerTenantId },
      select: { canSellResellers: true, status: true },
    }),
  ])
  if (!owner || !seller?.canSellResellers || seller.status !== "ACTIVE") redirect("/painel")

  const { id } = await params

  // Escopo: a sub-revenda SÓ é visível se foi trazida por esta unidade
  // (referrerTenantId == vendedor). Caso contrário, 404 — sem vazamento.
  const sub = await prisma.tenant.findFirst({
    where: { id, referrerTenantId: sellerTenantId },
    select: {
      name: true,
      slug: true,
      status: true,
      planValue: true,
      promoValue: true,
      promoMonths: true,
      createdAt: true,
      asaasSubscriptionId: true,
      owner: { select: { name: true, email: true, phone: true } },
      _count: { select: { students: true } },
      tenantPayments: {
        select: {
          id: true,
          asaasPaymentId: true,
          amount: true,
          status: true,
          billingType: true,
          dueDate: true,
          paidAt: true,
          invoiceUrl: true,
          bankSlipUrl: true,
        },
        orderBy: { dueDate: "desc" },
        take: 60,
      },
    },
  })
  if (!sub) notFound()

  const data: SubRevendaDetailData = {
    name: sub.name,
    slug: sub.slug,
    status: sub.status,
    planValue: Number(sub.planValue),
    promoValue: sub.promoValue != null ? Number(sub.promoValue) : null,
    promoMonths: sub.promoMonths ?? null,
    createdAt: sub.createdAt.toISOString(),
    ownerName: sub.owner?.name ?? null,
    ownerEmail: sub.owner?.email ?? null,
    ownerPhone: sub.owner?.phone ?? null,
    studentCount: sub._count.students,
    vitrineUrl: buildVitrineUrl(sub.slug),
    hasAsaasSubscription: Boolean(sub.asaasSubscriptionId),
    payments: sub.tenantPayments.map((p) => ({
      id: p.id,
      asaasPaymentId: p.asaasPaymentId,
      amount: Number(p.amount),
      status: p.status,
      billingType: p.billingType,
      dueDate: p.dueDate.toISOString(),
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      invoiceUrl: p.invoiceUrl,
      bankSlipUrl: p.bankSlipUrl,
    })),
  }

  return (
    <div className="space-y-6">
      <Link
        href="/painel/revendas"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-[var(--color-pmb-green)]"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para revendas
      </Link>
      <PageHeader
        title={data.name}
        description="Acompanhe a unidade que você trouxe. As demais configurações ficam com a PMB (sistema mãe)."
      />
      <SubRevendaDetail data={data} />
    </div>
  )
}
