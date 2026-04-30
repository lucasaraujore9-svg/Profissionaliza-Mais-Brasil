import Link from "next/link"
import { Plus, ShoppingCart } from "lucide-react"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  ACTIVE: "Pago — matrícula ativa",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SUSPENDED: "bg-rose-50 text-rose-700 border-rose-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
  COMPLETED: "bg-cyan-50 text-cyan-700 border-cyan-200",
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function PainelVendasPage() {
  const session = await auth()
  const user = session?.user as
    | { tenantId?: string | null }
    | undefined
  if (!user?.tenantId) redirect("/login?callbackUrl=/painel/vendas")

  const enrollments = await prisma.enrollment.findMany({
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
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Vendas diretas"
          description="Vendas em que você gerou o link de pagamento manualmente. Vendas pela vitrine pública aparecem em Financeiro."
        />
        <Link
          href="/painel/vendas/nova"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova venda
        </Link>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-gray-500">
            <ShoppingCart className="h-6 w-6 text-gray-400" />
            <p>Nenhuma venda direta ainda.</p>
            <Link
              href="/painel/vendas/nova"
              className="mt-1 text-xs font-bold text-[var(--color-pmb-green)] hover:underline"
            >
              Gerar primeira venda
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  <th className="px-4 py-2.5">Aluno</th>
                  <th className="px-4 py-2.5">Curso</th>
                  <th className="px-4 py-2.5">Valor</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Vendido por</th>
                  <th className="px-4 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enrollments.map((e) => {
                  const statusKey = e.status as keyof typeof STATUS_LABEL
                  return (
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
                          <div className="text-[10px] text-emerald-700">
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
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                            STATUS_COLOR[statusKey] ??
                            "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {STATUS_LABEL[statusKey] ?? statusKey}
                        </span>
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
