import Link from "next/link"
import { Plus, ShoppingCart } from "lucide-react"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { SaleStatusBadge } from "@/components/painel/sale-status"
import { CheckoutLink } from "@/components/shared/checkout-link"
import { buildEnrollmentCheckoutUrl } from "@/lib/students/checkout-link"

export const dynamic = "force-dynamic"

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function PainelVendasPage() {
  const session = await auth()
  const user = session?.user as
    | { tenantId?: string | null }
    | undefined
  if (!user?.tenantId) redirect("/login?callbackUrl=/painel/vendas")

  const [tenant, enrollments] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { slug: true, customDomain: true },
    }),
    prisma.enrollment.findMany({
      where: {
        tenantId: user.tenantId,
        soldByUserId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        student: { select: { nome: true, email: true } },
        course: { select: { nome: true } },
        coupon: { select: { code: true } },
        soldByUser: { select: { name: true } },
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas diretas"
        description="Vendas em que você gerou o link de pagamento manualmente. Vendas pela vitrine pública aparecem em Financeiro."
        actions={
          <Link
            href="/painel/vendas/nova"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova venda
          </Link>
        }
      />

      {enrollments.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma venda direta ainda"
          description="Gere um link de pagamento manual para um aluno e ele aparecerá aqui."
          action={
            <Link
              href="/painel/vendas/nova"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Gerar primeira venda
            </Link>
          }
        />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  <th className="px-4 py-2.5">Aluno</th>
                  <th className="px-4 py-2.5">Curso</th>
                  <th className="px-4 py-2.5">Valor</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Link de pagamento</th>
                  <th className="px-4 py-2.5">Vendido por</th>
                  <th className="px-4 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enrollments.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--color-pmb-green-900)]">
                        {e.student.nome}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {e.student.email ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {e.course.nome}
                      {e.coupon && (
                        <div className="text-[10px] text-[var(--color-pmb-green-700)]">
                          cupom {e.coupon.code}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {fmtBRL(Number(e.finalAmount))}
                      {Number(e.discountAmount) > 0 && (
                        <div className="text-[10px] text-gray-500 line-through">
                          {fmtBRL(Number(e.originalAmount))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SaleStatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const link = buildEnrollmentCheckoutUrl({
                          status: e.status,
                          enrollmentId: e.id,
                          gateway: e.gateway,
                          asaasInvoiceUrl: e.asaasInvoiceUrl,
                          tenantSlug: tenant?.slug ?? "",
                          tenantCustomDomain: tenant?.customDomain ?? null,
                        })
                        return link ? (
                          <CheckoutLink url={link} />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {e.soldByUser?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {e.createdAt.toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
