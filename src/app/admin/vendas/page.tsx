import { redirect } from "next/navigation"
import Link from "next/link"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { Plus, Tag, Users } from "lucide-react"

export const dynamic = "force-dynamic"

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function VendasDashboardPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/vendas")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  const baseWhere =
    session.role === "SUPER_ADMIN"
      ? { tenantId: null as null }
      : { tenantId: null as null, soldByUserId: session.userId }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [monthEnrollments, recentEnrollments] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        ...baseWhere,
        status: "ACTIVE",
        createdAt: { gte: startOfMonth },
      },
      select: {
        finalAmount: true,
        couponId: true,
      },
    }),
    prisma.enrollment.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        student: { select: { nome: true, email: true } },
        course: { select: { nome: true } },
        soldByUser: { select: { name: true } },
      },
    }),
  ])

  const monthTotal = monthEnrollments.reduce(
    (acc, e) => acc + Number(e.finalAmount),
    0,
  )
  const monthCount = monthEnrollments.length
  const ticket = monthCount > 0 ? monthTotal / monthCount : 0
  const couponUsed = monthEnrollments.filter((e) => e.couponId).length

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
            Vendas Diretas PMB
          </h1>
          <p className="text-sm text-muted-foreground">
            {session.role === "SUPER_ADMIN"
              ? "Todas as vendas da vitrine principal"
              : "Suas vendas na vitrine principal"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/vendas/cupons"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Tag className="h-4 w-4 mr-2" /> Cupons
          </Link>
          <Link
            href="/admin/vendas/alunos"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Users className="h-4 w-4 mr-2" /> Alunos
          </Link>
          <Link
            href="/admin/vendas/nova"
            className="inline-flex items-center rounded-md bg-[var(--color-pmb-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-900)]"
          >
            <Plus className="h-4 w-4 mr-2" /> Nova venda
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Vendas do mês (valor)" value={formatBRL(monthTotal)} />
        <MetricCard label="Vendas do mês (qtd)" value={String(monthCount)} />
        <MetricCard label="Ticket médio" value={formatBRL(ticket)} />
        <MetricCard label="Cupons usados" value={String(couponUsed)} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="font-display text-lg">Últimas vendas</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-pmb-mist)] text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Aluno</th>
              <th className="px-4 py-3 font-semibold">Curso</th>
              <th className="px-4 py-3 font-semibold">Valor</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {session.role === "SUPER_ADMIN" && (
                <th className="px-4 py-3 font-semibold">Vendedor</th>
              )}
              <th className="px-4 py-3 font-semibold">Data</th>
            </tr>
          </thead>
          <tbody>
            {recentEnrollments.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-medium">{e.student.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.student.email}
                  </div>
                </td>
                <td className="px-4 py-3">{e.course.nome}</td>
                <td className="px-4 py-3">{formatBRL(Number(e.finalAmount))}</td>
                <td className="px-4 py-3">{e.status}</td>
                {session.role === "SUPER_ADMIN" && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {e.soldByUser?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground">
                  {e.createdAt.toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
            {recentEnrollments.length === 0 && (
              <tr>
                <td
                  colSpan={session.role === "SUPER_ADMIN" ? 6 : 5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Nenhuma venda registrada ainda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-display text-[var(--color-pmb-green-900)]">
        {value}
      </div>
    </div>
  )
}
