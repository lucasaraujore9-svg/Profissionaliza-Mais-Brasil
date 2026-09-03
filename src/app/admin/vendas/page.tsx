import Link from "next/link"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { prisma } from "@/lib/prisma"
import { Plus, Tag, Users } from "lucide-react"
import { SyncPaymentButton } from "@/components/admin/sync-payment-button"
import { CheckoutLink } from "@/components/shared/checkout-link"
import { buildEnrollmentCheckoutUrl } from "@/lib/students/checkout-link"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import {
  INTERVAL_LABEL,
  INTERVAL_PRICE_SUFFIX,
} from "@/lib/subscriptions/interval"

export const dynamic = "force-dynamic"

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function VendasDashboardPage() {
  const session = await requireAdminPage("vendas.view")

  const baseWhere =
    session.can("vendas.viewAll")
      ? { tenantId: null as null }
      : { tenantId: null as null, soldByUserId: session.userId }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Recorte de carteira das assinaturas: o gêmeo de `baseWhere`, para o mesmo
  // model. `{ not: null }` isola as vendas DIRETAS das contratações que o
  // próprio aluno fez na vitrine — aquelas não são venda de ninguém.
  const subsWhere = session.can("vendas.viewAll")
    ? { tenantId: null as null, soldByUserId: { not: null } }
    : { tenantId: null as null, soldByUserId: session.userId }

  const [monthEnrollments, recentEnrollments, monthSubs, recentSubs] =
    await Promise.all([
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
    // Assinaturas vendidas no mês. Entram nas métricas pelo valor do CICLO
    // (`priceAtPurchase`) — que é o que efetivamente entrou naquela venda.
    prisma.studentSubscription.findMany({
      where: {
        ...subsWhere,
        status: { in: ["ACTIVE", "PAST_DUE"] },
        createdAt: { gte: startOfMonth },
      },
      select: { priceAtPurchase: true },
    }),
    prisma.studentSubscription.findMany({
      where: subsWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        student: { select: { nome: true, email: true } },
        plan: { select: { name: true } },
      },
    }),
  ])

  const sellerIds = [
    ...new Set(recentSubs.map((s) => s.soldByUserId).filter(Boolean)),
  ] as string[]
  const sellers =
    sellerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, name: true },
        })
      : []
  const sellerName = new Map(sellers.map((u) => [u.id, u.name]))

  const monthTotal =
    monthEnrollments.reduce((acc, e) => acc + Number(e.finalAmount), 0) +
    monthSubs.reduce((acc, s) => acc + Number(s.priceAtPurchase), 0)
  const monthCount = monthEnrollments.length + monthSubs.length
  const ticket = monthCount > 0 ? monthTotal / monthCount : 0
  // Assinatura não aceita cupom (ver lib/subscriptions/direct-sale.ts), então a
  // contagem segue vindo só das matrículas.
  const couponUsed = monthEnrollments.filter((e) => e.couponId).length

  /**
   * Linha unificada da tabela. Matrícula e assinatura são models diferentes,
   * mas na tela do vendedor são a MESMA coisa: uma venda que ele fez.
   */
  const rows = [
    ...recentEnrollments.map((e) => ({
      key: `enr:${e.id}`,
      enrollmentId: e.id as string | null,
      studentName: e.student.nome,
      studentEmail: e.student.email,
      title: e.course.nome,
      subtitle:
        e.bundleCourseIds.length > 0
          ? `+ ${e.bundleCourseIds.length} ${e.bundleCourseIds.length === 1 ? "curso" : "cursos"} na mesma venda`
          : null,
      amount: Number(e.finalAmount),
      amountSuffix: "",
      status: e.status as string,
      // PMB usa Asaas (gateway ASAAS): o link útil é o asaasInvoiceUrl.
      // tenantSlug = PMB_TENANT_SLUG desliga o ramo /pagar (só MP de revenda).
      link: buildEnrollmentCheckoutUrl({
        status: e.status,
        enrollmentId: e.id,
        gateway: e.gateway,
        asaasInvoiceUrl: e.asaasInvoiceUrl,
        tenantSlug: PMB_TENANT_SLUG,
        tenantCustomDomain: null,
      }),
      soldByName: e.soldByUser?.name ?? null,
      createdAt: e.createdAt,
    })),
    ...recentSubs.map((sub) => ({
      key: `sub:${sub.id}`,
      // Assinatura não tem matrícula própria — o botão de sincronizar pagamento
      // (que consulta o gateway PELA matrícula) não se aplica.
      enrollmentId: null as string | null,
      studentName: sub.student.nome,
      studentEmail: sub.student.email,
      title: sub.plan.name,
      subtitle: `Assinatura ${INTERVAL_LABEL[sub.interval].toLowerCase()}`,
      amount: Number(sub.priceAtPurchase),
      amountSuffix: INTERVAL_PRICE_SUFFIX[sub.interval],
      status: sub.status as string,
      // Só enquanto há o que pagar: numa assinatura já ativa o link antigo
      // levaria a uma fatura quitada.
      link: sub.status === "PENDING" ? sub.checkoutUrl : null,
      soldByName: sub.soldByUserId
        ? (sellerName.get(sub.soldByUserId) ?? null)
        : null,
      createdAt: sub.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20)

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
            Vendas Diretas PMB
          </h1>
          <p className="text-sm text-muted-foreground">
            {session.can("vendas.viewAll")
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
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--color-pmb-mist)] text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Aluno</th>
              <th className="px-4 py-3 font-semibold">Produto</th>
              <th className="px-4 py-3 font-semibold">Valor</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Link de pagamento</th>
              {session.can("vendas.viewAll") && (
                <th className="px-4 py-3 font-semibold">Vendedor</th>
              )}
              <th className="px-4 py-3 font-semibold">Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.studentName}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.studentEmail}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {r.title}
                  {/* Venda com mais de um curso: o nome acima é o curso
                      principal (o que carrega a cobrança). Na assinatura, a
                      linha de baixo diz a periodicidade. */}
                  {r.subtitle && (
                    <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {formatBRL(r.amount)}
                  {r.amountSuffix}
                </td>
                <td className="px-4 py-3">
                  {r.status === "PENDING" && r.enrollmentId ? (
                    <SyncPaymentButton enrollmentId={r.enrollmentId} />
                  ) : (
                    <StatusBadge status={r.status} />
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.link ? (
                    <CheckoutLink url={r.link} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                {session.can("vendas.viewAll") && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.soldByName ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground">
                  {r.createdAt.toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={session.can("vendas.viewAll") ? 7 : 6}
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
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
  // Status de ASSINATURA: a tabela lista assinatura ao lado de matrícula, e sem
  // estas duas linhas o badge imprimiria o valor cru do enum.
  PAST_DUE: "Em atraso",
  EXPIRED: "Expirada",
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700",
  ACTIVE: "bg-green-50 text-green-700",
  COMPLETED: "bg-blue-50 text-blue-700",
  SUSPENDED: "bg-red-50 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  PAST_DUE: "bg-red-50 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-500",
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-500"
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
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
