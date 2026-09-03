import Link from "next/link"
import { Plus, ShoppingCart } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { SaleStatusBadge } from "@/components/painel/sale-status"
import { CheckoutLink } from "@/components/shared/checkout-link"
import { VerifyPaymentButton } from "@/components/shared/verify-payment-button"
import { buildEnrollmentCheckoutUrl } from "@/lib/students/checkout-link"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import {
  INTERVAL_LABEL,
  INTERVAL_PRICE_SUFFIX,
} from "@/lib/subscriptions/interval"

/** Cobrança em aberto: cabe perguntar ao gateway se já foi paga. */
const VERIFIABLE = new Set(["PENDING", "SUSPENDED"])

export const dynamic = "force-dynamic"

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function PainelVendasPage() {
  const ctx = await requirePainelPage("vendas.view")
  // O endpoint de verificação exige `alunos.manage` (mesma matriz da rota irmã
  // de cancelamento). Quem só concilia (Financeiro) enxerga a venda pendente,
  // mas não vê um botão que responderia 403.
  const canVerifyPayment = ctx.can("alunos.manage")
  // O Financeiro da unidade concilia vendas sem registrar venda nova: tem
  // `vendas.view` sem `vendas.create`, e /painel/vendas/nova o redirigiria.
  const canCreateSale = ctx.can("vendas.create")

  const [tenant, enrollments, subscriptions] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { slug: true, customDomain: true },
    }),
    // Escopo do papel: sem `vendas.viewAll`, só as vendas da própria pessoa.
    prisma.enrollment.findMany({
      where: {
        tenantId: ctx.tenantId,
        soldByUserId: { not: null },
        ...ctx.scope.vendas,
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
    // Venda de ASSINATURA não gera matrícula (elas nascem sob demanda, uma por
    // curso aberto). Sem esta consulta o vendedor emitiria a cobrança e a venda
    // sumiria justamente da tela que lista as vendas diretas dele. O MESMO
    // recorte de carteira se aplica — `ctx.scope.assinaturas` é o gêmeo de
    // `ctx.scope.vendas` para este model.
    prisma.studentSubscription.findMany({
      where: {
        tenantId: ctx.tenantId,
        soldByUserId: { not: null },
        ...ctx.scope.assinaturas,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        student: { select: { nome: true, email: true } },
        plan: { select: { name: true } },
      },
    }),
  ])

  const sellerIds = [
    ...new Set(subscriptions.map((s) => s.soldByUserId).filter(Boolean)),
  ] as string[]
  const sellers =
    sellerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, name: true },
        })
      : []
  const sellerName = new Map(sellers.map((u) => [u.id, u.name]))

  /**
   * Linha unificada da tabela. Matrícula e assinatura são models diferentes,
   * mas na tela do vendedor são a MESMA coisa: uma venda que ele fez, com um
   * link para cobrar. Unificar aqui evita duas tabelas dizendo a mesma coisa
   * com colunas diferentes.
   */
  const rows = [
    ...enrollments.map((e) => ({
      key: `enr:${e.id}`,
      kind: "COURSE" as const,
      studentId: e.studentId,
      studentName: e.student.nome,
      studentEmail: e.student.email,
      title: e.course.nome,
      subtitle:
        e.bundleCourseIds.length > 0
          ? `+ ${e.bundleCourseIds.length} ${e.bundleCourseIds.length === 1 ? "curso" : "cursos"} na mesma venda`
          : null,
      couponCode: e.coupon?.code ?? null,
      amount: Number(e.finalAmount),
      amountSuffix: "",
      originalAmount: Number(e.originalAmount),
      discountAmount: Number(e.discountAmount),
      status: e.status as string,
      link: buildEnrollmentCheckoutUrl({
        status: e.status,
        enrollmentId: e.id,
        gateway: e.gateway,
        asaasInvoiceUrl: e.asaasInvoiceUrl,
        tenantSlug: tenant?.slug ?? "",
        tenantCustomDomain: tenant?.customDomain ?? null,
      }),
      enrollmentId: e.id as string | null,
      soldByName: e.soldByUser?.name ?? null,
      createdAt: e.createdAt,
    })),
    ...subscriptions.map((sub) => ({
      key: `sub:${sub.id}`,
      kind: "SUBSCRIPTION" as const,
      studentId: sub.studentId,
      studentName: sub.student.nome,
      studentEmail: sub.student.email,
      title: sub.plan.name,
      subtitle: `Assinatura ${INTERVAL_LABEL[sub.interval].toLowerCase()}`,
      couponCode: null,
      // `priceAtPurchase` já é o valor congelado, com o desconto do vendedor
      // dentro — a assinatura não guarda "preço de tabela".
      amount: Number(sub.priceAtPurchase),
      amountSuffix: INTERVAL_PRICE_SUFFIX[sub.interval],
      originalAmount: Number(sub.priceAtPurchase),
      discountAmount: 0,
      status: sub.status as string,
      // Só oferece o link enquanto há o que pagar: uma assinatura ativa não tem
      // cobrança em aberto, e o link antigo levaria a uma fatura já quitada.
      link: sub.status === "PENDING" ? sub.checkoutUrl : null,
      // Assinatura não tem matrícula própria — o botão "Verificar pagamento"
      // (que consulta o gateway PELA matrícula) não se aplica.
      enrollmentId: null as string | null,
      soldByName: sub.soldByUserId
        ? (sellerName.get(sub.soldByUserId) ?? null)
        : null,
      createdAt: sub.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 100)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas diretas"
        description="Vendas em que você gerou o link de pagamento manualmente. Vendas pela vitrine pública aparecem em Financeiro."
        actions={
          canCreateSale ? (
            <Link
              href="/painel/vendas/nova"
              data-tour="vendas:nova"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova venda
            </Link>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma venda direta ainda"
          description="Gere um link de pagamento manual para um aluno e ele aparecerá aqui."
          action={
            canCreateSale ? (
              <Link
                href="/painel/vendas/nova"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Gerar primeira venda
              </Link>
            ) : null
          }
        />
      ) : (
        <div
          data-tour="vendas:lista"
          className="rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  <th className="px-4 py-2.5">Aluno</th>
                  <th className="px-4 py-2.5">Produto</th>
                  <th className="px-4 py-2.5">Valor</th>
                  <th data-tour="vendas:status" className="px-4 py-2.5">Status</th>
                  <th data-tour="vendas:link" className="px-4 py-2.5">Link de pagamento</th>
                  <th className="px-4 py-2.5">Vendido por</th>
                  <th className="px-4 py-2.5">Data</th>
                  {canVerifyPayment && <th className="px-4 py-2.5">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--color-pmb-green-900)]">
                        {r.studentName}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {r.studentEmail ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.title}
                      {/* Venda com mais de um curso: o nome acima é o curso
                          principal (o que carrega a cobrança). Na assinatura, a
                          linha de baixo diz a periodicidade. */}
                      {r.subtitle && (
                        <div className="text-[10px] text-gray-500">{r.subtitle}</div>
                      )}
                      {r.couponCode && (
                        <div className="text-[10px] text-[var(--color-pmb-green-700)]">
                          cupom {r.couponCode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {fmtBRL(r.amount)}
                      {r.amountSuffix}
                      {r.discountAmount > 0 && (
                        <div className="text-[10px] text-gray-500 line-through">
                          {fmtBRL(r.originalAmount)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SaleStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      {r.link ? (
                        <CheckoutLink url={r.link} />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {r.soldByName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {r.createdAt.toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    {canVerifyPayment && (
                      <td className="px-4 py-3">
                        {r.enrollmentId && VERIFIABLE.has(r.status) ? (
                          <VerifyPaymentButton
                            url={`/api/painel/alunos/${r.studentId}/enrollments/${r.enrollmentId}/verificar-pagamento`}
                            label="Verificar"
                          />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    )}
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
