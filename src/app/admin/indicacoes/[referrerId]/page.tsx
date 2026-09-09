import Link from "next/link"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { adminHome, requireAdminPage } from "@/lib/auth/admin-guard"
import {
  referralCommissionStatusLabel,
  referralPayoutStatusLabel,
  tenantStatusLabel,
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
import {
  loadRelatorioIndicador,
  ultimaCompetencia,
} from "@/lib/referrals/relatorio-indicador"
import { MOTIVO_LABEL } from "@/lib/referrals/relatorio-motivo"

export const dynamic = "force-dynamic"

const BASE_LABEL: Record<string, string> = {
  ALL_ACTIVE: "todas as ativas",
  REFERRED_THIS_MONTH: "indicadas no mês",
  PAID_THIS_MONTH: "pagantes no mês",
}
const BASIS_LABEL: Record<string, string> = {
  NEW_REFERRALS_MONTH: "unidades ativadas no mês",
  ACTIVE_UNITS: "unidades ativas",
}

function money(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}

function competenciaLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return period
  const nomes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ]
  return `${nomes[Number(m[2]) - 1]}/${m[1]}`
}

function Tile({
  label,
  value,
  hint,
  highlight,
}: {
  label: string
  value: string
  hint?: string
  highlight?: boolean
}) {
  return (
    <Card
      className={`p-4 ${highlight ? "border-[var(--color-pmb-green-900)]/25 bg-[var(--color-pmb-green-900)]/5" : ""}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-[var(--color-pmb-green-900)]">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p> : null}
    </Card>
  )
}

export default async function RelatorioIndicadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ referrerId: string }>
  searchParams: Promise<{ competencia?: string }>
}) {
  const ctx = await requireAdminPage("indicacoes.view")
  const { referrerId } = await params
  const { competencia } = await searchParams

  // Mesmo recorte de carteira do hub e da lista de pagamentos: o relatório
  // expõe nome, status e valores das indicadas. `null` = não alcança unidade
  // nenhuma; e um indicador fora da carteira responde 404, não uma tela vazia.
  const scope = await ctx.comissoesScope()
  if (!scope) redirect(adminHome(ctx))
  const alcanca = await prisma.tenant.findFirst({
    where: { id: referrerId, ...scope },
    select: { id: true },
  })
  if (!alcanca) notFound()

  const period = /^\d{4}-\d{2}$/.test(competencia ?? "")
    ? (competencia as string)
    : ultimaCompetencia()

  const rel = await loadRelatorioIndicador(referrerId, period)
  if (!rel) notFound()

  const { comissao, totais } = rel
  const fixa = comissao?.rateType === "FIXED"

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
        title={rel.referrer.name}
        description="Relatório de indicações: o que a carteira movimentou no mês e como o valor da comissão foi formado."
        actions={
          <Link
            href={`/admin/revendedores/${rel.referrer.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
          >
            Ver unidade
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {/* Seletor de competência: links, não form — a página é server component
          e o mês vive na URL, então o relatório é compartilhável e recarregável. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Competência
        </span>
        {rel.periodosDisponiveis.map((p) => (
          <Link
            key={p}
            href={`/admin/indicacoes/${rel.referrer.id}?competencia=${p}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              p === rel.period
                ? "bg-[var(--color-pmb-green-900)] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {competenciaLabel(p)}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={`Comissão de ${competenciaLabel(rel.period)}`}
          value={comissao ? money(comissao.amount) : "—"}
          hint={
            comissao
              ? `${referralCommissionStatusLabel(comissao.status)} · liberação em ${comissao.availableAt.toLocaleDateString("pt-BR")}`
              : "competência ainda não apurada"
          }
          highlight
        />
        <Tile
          label="Ativadas no mês"
          value={String(comissao?.bracketCount ?? totais.ativouNoMes)}
          hint="é o número que define a faixa"
        />
        <Tile
          label="Recebido das indicadas"
          value={money(totais.recebidoNoMes)}
          hint="mensalidades pagas dentro do mês"
        />
        <Tile
          label="Carteira"
          value={`${totais.ativas} ativas`}
          hint={`${totais.total} no total · ${totais.canceladas} canceladas`}
        />
      </div>

      {comissao ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-800">
            Como este valor foi calculado
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-700">
            <li>
              <span className="font-semibold">1.</span> A faixa saiu de{" "}
              <strong>{comissao.bracketCount}</strong>{" "}
              {BASIS_LABEL[comissao.bracketBasis] ?? comissao.bracketBasis} →{" "}
              <strong>
                {fixa
                  ? `${money(comissao.rate)} por unidade`
                  : `${comissao.rate}%`}
              </strong>
              .
            </li>
            <li>
              <span className="font-semibold">2.</span> A base de pagamento é{" "}
              <strong>{BASE_LABEL[comissao.payoutBase] ?? comissao.payoutBase}</strong>
              : <strong>{comissao.unitCount}</strong>{" "}
              {comissao.unitCount === 1 ? "unidade" : "unidades"}
              {fixa
                ? "."
                : `, somando ${money(comissao.baseSum)} de mensalidade.`}
            </li>
            <li>
              <span className="font-semibold">3.</span>{" "}
              {fixa
                ? `${money(comissao.rate)} × ${comissao.unitCount} = `
                : `${comissao.rate}% de ${money(comissao.baseSum)} = `}
              <strong>{money(comissao.amount)}</strong>.
            </li>
          </ol>
          {comissao.payout ? (
            <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-600">
              Pagamento:{" "}
              <Link
                href="/admin/indicacoes/saques"
                className="font-medium text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
              >
                {money(comissao.payout.amount)} ·{" "}
                {referralPayoutStatusLabel(comissao.payout.status)}
              </Link>
              {comissao.payout.dueAt
                ? ` · previsto para ${comissao.payout.dueAt.toLocaleDateString("pt-BR")}`
                : null}
            </p>
          ) : (
            <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-600">
              Ainda sem pagamento montado para esta competência.
            </p>
          )}
        </Card>
      ) : (
        <Card className="p-5 text-sm text-gray-600">
          Nenhuma comissão apurada em {competenciaLabel(rel.period)}. O
          fechamento roda no dia 1 do mês seguinte; competência retida pelo
          mínimo de indicações ativas também não gera linha.
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-800">
            Carteira de indicadas
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Todas as unidades indicadas por {rel.referrer.name}. A coluna da
            direita diz quem entrou na conta de {competenciaLabel(rel.period)} e,
            quando não entrou, o motivo.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entrou em</TableHead>
              <TableHead className="text-right">Recebido no mês</TableHead>
              <TableHead>Na conta de {competenciaLabel(rel.period)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rel.carteira.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-gray-500"
                >
                  Nenhuma unidade indicada ainda.
                </TableCell>
              </TableRow>
            ) : (
              rel.carteira.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/revendedores/${u.id}`}
                      className="hover:underline"
                    >
                      {u.name}
                    </Link>
                    {u.ativouNoMes ? (
                      <span className="ml-2 rounded bg-[var(--color-pmb-lime-50)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                        ativou no mês
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        u.status === "ACTIVE"
                          ? "default"
                          : u.status === "CANCELLED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {tenantStatusLabel(u.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {u.entrouEm.toLocaleDateString("pt-BR")}
                    {!u.ativacaoRegistrada ? (
                      <span
                        className="ml-1 text-gray-400"
                        title="Sem data de ativação registrada — usamos a data de cadastro"
                      >
                        (cadastro)
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {u.recebidoNoMes > 0 ? (
                      money(u.recebidoNoMes)
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.naConta ? (
                      <span className="font-semibold text-[var(--color-pmb-green-900)]">
                        Sim · {money(u.valorNaConta)}
                      </span>
                    ) : (
                      <span className="text-gray-500">
                        Não
                        {u.motivoFora ? ` · ${MOTIVO_LABEL[u.motivoFora]}` : ""}
                      </span>
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
