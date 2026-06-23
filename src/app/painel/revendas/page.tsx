import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Store, CheckCircle2, Clock, TrendingUp, Share2 } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { ImpersonateButton } from "@/components/shared/impersonate-button"

export const metadata = {
  title: "Revendas | Painel",
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Ativa", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  PENDING: { label: "Aguardando pgto.", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  SUSPENDED: { label: "Suspensa", cls: "bg-red-50 text-red-700 ring-red-200" },
  CANCELLED: { label: "Cancelada", cls: "bg-gray-100 text-gray-600 ring-gray-200" },
}

export default async function PainelRevendasPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/revendas")
  }
  const tenantId = session.user.tenantId as string
  const userId = session.user.id as string

  // Owner direto + módulo habilitado + unidade ACTIVE (mesma regra de
  // requireResellerSeller — vender sub-revendas exige unidade adimplente).
  const [owner, tenant] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { canSellResellers: true, status: true },
    }),
  ])
  if (!owner || !tenant?.canSellResellers || tenant.status !== "ACTIVE") redirect("/painel")

  const subs = await prisma.tenant.findMany({
    where: { referrerTenantId: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      planValue: true,
      createdAt: true,
      _count: { select: { students: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const total = subs.length
  const ativas = subs.filter((s) => s.status === "ACTIVE").length
  const pendentes = subs.filter((s) => s.status === "PENDING").length
  const novasNoMes = subs.filter((s) => s.createdAt >= monthStart).length

  const kpis = [
    { label: "Revendas vendidas", value: total, icon: Store, tone: "text-[var(--color-pmb-green)]" },
    { label: "Ativas", value: ativas, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Aguardando pgto.", value: pendentes, icon: Clock, tone: "text-amber-600" },
    { label: "Novas este mês", value: novasNoMes, icon: TrendingUp, tone: "text-[var(--color-pmb-green)]" },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revendas"
        description="Venda revendas e acompanhe as unidades que você trouxe. A cobrança é feita pela PMB e você ganha comissão recorrente por indicação."
        actions={
          <Link
            href="/painel/revendas/nova"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
          >
            <Plus className="h-4 w-4" /> Nova revenda
          </Link>
        }
      />

      {/* Placar — vendas de revenda feitas por esta unidade */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)]">
                <k.icon className={`h-4 w-4 ${k.tone}`} />
              </span>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {k.label}
              </p>
            </div>
            <p className="mt-3 text-2xl font-bold text-[var(--color-pmb-green-900)]">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Suas revendas
        </h2>
        <Link
          href="/painel/indicacoes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
        >
          <Share2 className="h-3.5 w-3.5" /> Ver comissões e repasses
        </Link>
      </div>

      {subs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center">
          <Store className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 font-medium text-gray-700">Você ainda não vendeu nenhuma revenda</p>
          <p className="mt-1 text-sm text-gray-500">
            Clique em “Nova revenda” para cadastrar a primeira unidade.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Revenda</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Mensalidade</th>
                <th className="px-4 py-3 font-medium">Alunos</th>
                <th className="px-4 py-3 font-medium">Criada em</th>
                <th className="px-4 py-3 font-medium text-right">Suporte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subs.map((s) => {
                const st = STATUS_LABEL[s.status] ?? STATUS_LABEL.PENDING
                return (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--color-pmb-green-900)]">{s.name}</div>
                      <div className="text-xs text-gray-500">{s.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--color-pmb-green-900)]">
                      {brl(Number(s.planValue))}
                    </td>
                    <td className="px-4 py-3">{s._count.students}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {s.createdAt.toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ImpersonateButton
                        endpoint={`/api/painel/revendas/${s.id}/impersonate`}
                        label="Acessar painel"
                        fallbackRedirect="/painel"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
