import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { PageHeader } from "@/components/painel/page-header"
import { Card } from "@/components/ui/card"
import { referralCommissionStatusLabel } from "@/lib/labels"
import {
  loadRelatorioIndicador,
  ultimaCompetencia,
} from "@/lib/referrals/relatorio-indicador"
import {
  ordenarCarteira,
  parseDirecao,
  parseOrdem,
} from "@/lib/referrals/relatorio-ordem"
import { ReferralCarteiraTable } from "@/components/shared/referral-carteira-table"

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

/**
 * O MESMO relatorio que o financeiro da PMB usa para conferir a comissao, agora
 * para o indicador conferir a dele. E o ponto: quando ele contesta um valor, os
 * dois lados precisam estar olhando exatamente a mesma conta — dai o loader e a
 * tabela serem compartilhados com /admin/indicacoes/[id], e nao uma segunda
 * versao "simplificada" que arredonda a verdade.
 *
 * O tenant vem SEMPRE da sessao (`ctx.tenantId`), nunca da URL: nao existe
 * parametro de indicador aqui, entao nao ha o que forjar para ler a carteira de
 * outra unidade.
 */
export default async function PainelRelatorioIndicacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string; ordem?: string; dir?: string }>
}) {
  const ctx = await requirePainelPage("indicacoes.view")
  const { competencia, ordem: ordemRaw, dir: dirRaw } = await searchParams

  const period = /^\d{4}-\d{2}$/.test(competencia ?? "")
    ? (competencia as string)
    : ultimaCompetencia()

  const rel = await loadRelatorioIndicador(ctx.tenantId, period)
  if (!rel) notFound()

  const { comissao, totais } = rel
  const fixa = comissao?.rateType === "FIXED"
  const ordem = parseOrdem(ordemRaw)
  const dir = parseDirecao(dirRaw)
  const carteira = ordenarCarteira(rel.carteira, ordem, dir)

  return (
    <div className="space-y-6">
      <Link
        href="/painel/indicacoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>

      <PageHeader
        title="Relatório de indicações"
        description="O que a sua carteira movimentou no mês e como a sua comissão foi formada."
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Competência
        </span>
        {rel.periodosDisponiveis.map((p) => (
          <Link
            key={p}
            href={`/painel/indicacoes/relatorio?competencia=${p}&ordem=${ordem}&dir=${dir}`}
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
          hint="é o número que define a sua faixa"
        />
        <Tile
          label="Na conta do mês"
          value={String(comissao?.unitCount ?? totais.naConta)}
          hint="unidades que geraram comissão"
        />
        <Tile
          label="Sua carteira"
          value={`${totais.ativas} ativas`}
          hint={`${totais.total} no total · ${totais.canceladas} canceladas`}
        />
      </div>

      {comissao ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-800">
            Como a sua comissão foi calculada
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-700">
            <li>
              <span className="font-semibold">1.</span> A faixa saiu de{" "}
              <strong>{comissao.bracketCount}</strong>{" "}
              {BASIS_LABEL[comissao.bracketBasis] ?? comissao.bracketBasis} →{" "}
              <strong>
                {fixa ? `${money(comissao.rate)} por unidade` : `${comissao.rate}%`}
              </strong>
              .
            </li>
            <li>
              <span className="font-semibold">2.</span> A base de pagamento é{" "}
              <strong>{BASE_LABEL[comissao.payoutBase] ?? comissao.payoutBase}</strong>
              : <strong>{comissao.unitCount}</strong>{" "}
              {comissao.unitCount === 1 ? "unidade" : "unidades"}
              {fixa ? "." : `, somando ${money(comissao.baseSum)} de mensalidade.`}
            </li>
            <li>
              <span className="font-semibold">3.</span>{" "}
              {fixa
                ? `${money(comissao.rate)} × ${comissao.unitCount} = `
                : `${comissao.rate}% de ${money(comissao.baseSum)} = `}
              <strong>{money(comissao.amount)}</strong>.
            </li>
          </ol>
          <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-600">
            O pagamento é feito manualmente pela equipe financeira após
            conferência, e o comprovante fica disponível em{" "}
            <Link
              href="/painel/indicacoes"
              className="font-medium text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
            >
              Indicações
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card className="p-5 text-sm text-gray-600">
          Nenhuma comissão apurada em {competenciaLabel(rel.period)}. O
          fechamento do mês roda no dia 1 do mês seguinte.
        </Card>
      )}

      <ReferralCarteiraTable
        linhas={carteira}
        competenciaLabel={competenciaLabel(rel.period)}
        baseHref="/painel/indicacoes/relatorio"
        queryExtra={{ competencia: rel.period }}
        ordem={ordem}
        dir={dir}
        // Sem link: o indicador nao administra as unidades que indicou.
        unidadeHrefBase={null}
        titulo="Unidades que você indicou"
        descricao={`A coluna da direita mostra quem entrou na sua comissão de ${competenciaLabel(rel.period)} e, quando não entrou, o motivo.`}
      />
    </div>
  )
}
