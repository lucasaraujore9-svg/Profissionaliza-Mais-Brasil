import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { ResellerBackLink } from "@/components/admin/reseller-back-link"
import {
  ResellerCommissionsTabs,
  type CommissionRow,
} from "@/components/admin/reseller-commissions-tabs"

export const dynamic = "force-dynamic"

export default async function ResellerCommissionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireAdminSession()
  if (!session) {
    redirect(`/login?callbackUrl=/admin/revendedores/${id}/comissoes`)
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      referrerTenantId: true,
    },
  })
  if (!tenant) notFound()

  const [receivedRaw, generatedRaw] = await Promise.all([
    prisma.referralCommission.findMany({
      where: { referrerTenantId: id },
      select: {
        id: true,
        status: true,
        baseAmount: true,
        percent: true,
        amount: true,
        availableAt: true,
        paidAt: true,
        cancelledAt: true,
        cancelReason: true,
        createdAt: true,
        payoutId: true,
        referrer: { select: { id: true, name: true, slug: true } },
        referred: { select: { id: true, name: true, slug: true } },
        tenantPayment: {
          select: { id: true, dueDate: true, paidAt: true, amount: true, status: true },
        },
        payout: { select: { id: true, status: true, paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.referralCommission.findMany({
      where: { referredTenantId: id },
      select: {
        id: true,
        status: true,
        baseAmount: true,
        percent: true,
        amount: true,
        availableAt: true,
        paidAt: true,
        cancelledAt: true,
        cancelReason: true,
        createdAt: true,
        payoutId: true,
        referrer: { select: { id: true, name: true, slug: true } },
        referred: { select: { id: true, name: true, slug: true } },
        tenantPayment: {
          select: { id: true, dueDate: true, paidAt: true, amount: true, status: true },
        },
        payout: { select: { id: true, status: true, paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ])

  function serialize(rows: typeof receivedRaw): CommissionRow[] {
    return rows.map((c) => ({
      id: c.id,
      status: c.status,
      baseAmount: Number(c.baseAmount),
      percent: Number(c.percent),
      amount: Number(c.amount),
      availableAt: c.availableAt.toISOString(),
      paidAt: c.paidAt ? c.paidAt.toISOString() : null,
      cancelledAt: c.cancelledAt ? c.cancelledAt.toISOString() : null,
      cancelReason: c.cancelReason ?? null,
      createdAt: c.createdAt.toISOString(),
      payoutId: c.payoutId ?? null,
      referrer: c.referrer,
      referred: c.referred,
      tenantPayment: {
        id: c.tenantPayment.id,
        dueDate: c.tenantPayment.dueDate.toISOString(),
        paidAt: c.tenantPayment.paidAt
          ? c.tenantPayment.paidAt.toISOString()
          : null,
        amount: Number(c.tenantPayment.amount),
        status: c.tenantPayment.status,
      },
      payout: c.payout
        ? {
            id: c.payout.id,
            status: c.payout.status,
            paidAt: c.payout.paidAt ? c.payout.paidAt.toISOString() : null,
          }
        : null,
    }))
  }

  const received = serialize(receivedRaw)
  const generated = serialize(generatedRaw)

  return (
    <div className="space-y-6">
      <ResellerBackLink
        href={`/admin/revendedores/${id}`}
        label="Voltar para revendedor"
      />
      <PageHeader
        title={`Comissões - ${tenant.name}`}
        description={`Detalhamento de comissões recebidas e geradas por ${tenant.slug}.`}
      />
      <ResellerCommissionsTabs
        tenantId={id}
        hasReferrer={tenant.referrerTenantId != null}
        received={received}
        generated={generated}
      />
    </div>
  )
}
