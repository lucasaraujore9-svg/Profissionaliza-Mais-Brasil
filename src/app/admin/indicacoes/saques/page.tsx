import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { adminHome, requireAdminPage } from "@/lib/auth/admin-guard"
import {
  referralPayoutMethodLabel,
  referralPayoutStatusLabel,
} from "@/lib/labels"
import { PageHeader } from "@/components/painel/page-header"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AdminPayoutRowActions } from "@/components/admin/admin-payout-row-actions"

export const dynamic = "force-dynamic"

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}

export default async function AdminSaquesPage() {
  const ctx = await requireAdminPage("indicacoes.view")

  // A tela expoe chave PIX, valor e transferId — PII financeira. Mesmo recorte
  // de GET /api/admin/financeiro/referral-payouts: sem visao do ecossistema, so
  // a propria carteira.
  const scope = await ctx.comissoesScope()
  if (!scope) redirect(adminHome(ctx))

  // O download do comprovante é `financeiro.manage` na rota — mesma permissão
  // de quem dá baixa. Sem isto o link aparecia para quem só acompanha a
  // carteira e abria uma aba com 403.
  const podeBaixarComprovante = ctx.can("financeiro.manage")

  const payouts = await prisma.referralPayout.findMany({
    where: { referrer: scope },
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      pixKey: true,
      pixKeyType: true,
      asaasTransferId: true,
      failureReason: true,
      requestedAt: true,
      processedAt: true,
      paidAt: true,
      proofUrl: true,
      referrer: { select: { id: true, name: true, slug: true } },
      commissions: { select: { id: true } },
    },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 200,
  })

  return (
    <div className="space-y-6">
      <Link
        href="/admin/indicacoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>
      <PageHeader
        title="Pagamentos de indicação"
        description="Lista de comissões liberadas para pagamento manual. Pague, marque como pago e anexe o comprovante (obrigatório)."
      />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Solicitado em</TableHead>
              <TableHead>Indicador</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Chave</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-gray-500 py-8">
                  Nenhum saque solicitado.
                </TableCell>
              </TableRow>
            ) : (
              payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.requestedAt.toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/revendedores/${p.referrer.id}`}
                      className="hover:underline"
                    >
                      {p.referrer.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(Number(p.amount))}
                  </TableCell>
                  <TableCell>{referralPayoutMethodLabel(p.method)}</TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {p.pixKey
                      ? `${p.pixKeyType ?? ""}: ${p.pixKey}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.status === "PAID"
                          ? "default"
                          : p.status === "FAILED" || p.status === "CANCELLED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {referralPayoutStatusLabel(p.status)}
                    </Badge>
                    {p.failureReason ? (
                      <p className="mt-1 text-[10px] text-red-600">
                        {p.failureReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.status === "REQUESTED" || p.status === "PROCESSING" ? (
                      <AdminPayoutRowActions payoutId={p.id} proofUrl={p.proofUrl} />
                    ) : p.proofUrl && podeBaixarComprovante ? (
                      <a
                        href={`/api/admin/financeiro/referral-payouts/${p.id}/proof/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
                      >
                        Comprovante
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
