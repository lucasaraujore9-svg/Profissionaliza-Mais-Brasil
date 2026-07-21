import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/prisma"
import { appUrl } from "@/lib/tenant/urls"
import { linePercent, parseLinesSnapshot } from "./lines-snapshot"
import { DemonstrativoDocument } from "./demonstrativo-template"

const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  AVAILABLE: "Disponivel",
  PAID: "Pago",
  CANCELLED: "Cancelado",
}

export interface DemonstrativoFilter {
  tenantId: string
  /** Formato YYYY-MM (ano-mes) — mes de referencia (em UTC). */
  month: string
}

export interface DemonstrativoMetadata {
  tenantSlug: string
  tenantName: string
  monthLabel: string
  monthIso: string
  rowsCount: number
}

export interface DemonstrativoResult {
  buffer: Buffer
  metadata: DemonstrativoMetadata
}

function parseMonth(month: string): { start: Date; end: Date; label: string; monthIdx: number; year: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) {
    throw new Error("Mes invalido (use YYYY-MM)")
  }
  const year = Number(match[1])
  const monthIdx = Number(match[2]) - 1
  if (monthIdx < 0 || monthIdx > 11) {
    throw new Error("Mes invalido (01 a 12)")
  }
  const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIdx + 1, 1, 0, 0, 0, 0))
  const label = `${MONTH_NAMES_PT[monthIdx]}/${year}`
  return { start, end, label, monthIdx, year }
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
}

function formatDateTimeBR(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

function formatCompetencia(d: Date | null): string {
  if (!d) return "-"
  return d.toLocaleDateString("pt-BR", {
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
}

function formatPercent(p: number): string {
  // Mostra com 1 casa quando nao e inteiro
  if (Number.isInteger(p)) return `${p}%`
  return `${p.toFixed(2).replace(/\.?0+$/, "")}%`
}

/** Converte o `period` do ledger mensal ("AAAA-MM") em "MM/AAAA". */
function formatPeriodCompetencia(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return "-"
  return `${match[2]}/${match[1]}`
}

/** Valor com sinal explicito — um ajuste sem sinal nao se distingue de um total. */
function formatSignedBRL(n: number): string {
  return `${n < 0 ? "-" : "+"} ${formatBRL(Math.abs(n))}`
}

/**
 * Frase de ajuste gravada em `ReferralPayout.notes` pelo mark-paid do financeiro.
 * Os valores saem de `Intl.NumberFormat("pt-BR")`, entao o separador de milhar e
 * ponto e o espaco depois de "R$" pode ser NBSP.
 */
const ADJUSTMENT_NOTE_RE = /Valor ajustado de R\$\s*[\d.,]+ para R\$\s*[\d.,]+\./g

/**
 * Extrai so a justificativa do ajuste das notas dos saques. O restante da nota e
 * uso interno (nome do admin, carimbo de hora, observacoes do financeiro) e nao
 * vai para um documento que a unidade recebe.
 */
function extractAdjustmentJustification(notes: Array<string | null>): string | null {
  const sentences = notes.flatMap((n) => (n ? n.match(ADJUSTMENT_NOTE_RE) ?? [] : []))
  if (sentences.length === 0) return null
  return Array.from(new Set(sentences)).join(" ")
}

/** Linha do PDF + chaves de ordenacao (nao vao para o template). */
interface SortableRow {
  sortTime: number
  sortName: string
  row: DemonstrativoRow
}

interface DemonstrativoRow {
  paidAtFormatted: string
  referredName: string
  competenciaFormatted: string
  percentFormatted: string
  amountFormatted: string
  statusLabel: string
}

/**
 * Gera o PDF do demonstrativo mensal de comissoes de indicacao para uma unidade.
 *
 * CAIXA x APURACAO — o documento e comprovante do que a unidade RECEBEU, entao o
 * TOTAL e caixa: soma dos `ReferralPayout` PAID com `paidAt` no mes. As LINHAS
 * continuam sendo apuracao (os dois ledgers de comissao), porque e o que da
 * rastreabilidade por unidade indicada. O financeiro pode ajustar o valor na hora
 * de pagar (mark-paid), e nesse caso os dois numeros divergem — a divergencia e
 * publicada como "Ajuste" nos totais em vez de ser escondida.
 *
 * As linhas saem das comissoes VINCULADAS a esses saques (`payoutId`), nunca de
 * `paidAt` solto, senao uma comissao liquidada por um saque de outro mes entraria
 * duas vezes no relatorio.
 *
 * Empty state: sem saque pago no mes, o PDF e emitido com o aviso de vazio.
 *
 * Retorna o buffer do PDF + metadata para uso no Content-Disposition.
 */
export async function generateDemonstrativoPdf(
  filter: DemonstrativoFilter,
): Promise<DemonstrativoResult> {
  const { start, end, label } = parseMonth(filter.month)

  const tenant = await prisma.tenant.findUnique({
    where: { id: filter.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      referralCode: true,
      pixKey: true,
      pixKeyType: true,
    },
  })
  if (!tenant) {
    throw new Error("Unidade nao encontrada")
  }

  // Fonte do TOTAL: o dinheiro que saiu do caixa no mes.
  const payouts = await prisma.referralPayout.findMany({
    where: {
      referrerTenantId: filter.tenantId,
      status: "PAID",
      paidAt: { gte: start, lt: end },
    },
    orderBy: { paidAt: "asc" },
    select: { id: true, amount: true, notes: true, paidAt: true },
  })

  const payoutIds = payouts.map((p) => p.id)
  const paidAtByPayout = new Map(payouts.map((p) => [p.id, p.paidAt]))
  /** Data de referencia da linha: o saque que a liquidou manda no `paidAt` gravado. */
  const rowPaidAt = (payoutId: string | null, fallback: Date): Date =>
    (payoutId ? paidAtByPayout.get(payoutId) : null) ?? fallback

  // `status: PAID` continua obrigatorio ao lado do vinculo por `payoutId`.
  // Um clawback (`/api/admin/referrals/clawback/resolve`, acao CANCEL) marca a
  // comissao como CANCELLED mas PRESERVA o `payoutId` quando o saque ja foi
  // pago — so vinculo a saque ABERTO e bloqueado. Sem este filtro a comissao
  // estornada voltava a ser impressa como recebida E entrava em `accrued`,
  // fabricando um "Ajuste do financeiro" negativo que ninguem fez.
  const commissions = await prisma.referralCommission.findMany({
    where: {
      referrerTenantId: filter.tenantId,
      status: "PAID",
      payoutId: { in: payoutIds },
    },
    orderBy: { paidAt: "asc" },
    include: {
      referred: { select: { name: true } },
      tenantPayment: {
        select: { dueDate: true, paidAt: true },
      },
    },
  })

  // Ledger mensal (motor unificado): uma linha por (unidade indicadora, periodo).
  const monthlyCommissions = await prisma.referralMonthlyCommission.findMany({
    where: {
      referrerTenantId: filter.tenantId,
      status: "PAID",
      payoutId: { in: payoutIds },
    },
    orderBy: { paidAt: "asc" },
  })

  const legacyRows: SortableRow[] = commissions.map((c) => {
    const paidAt = rowPaidAt(c.payoutId, c.paidAt ?? c.updatedAt)
    const competencia = c.tenantPayment.dueDate ?? c.tenantPayment.paidAt ?? null
    const percent = Number(c.percent)
    const amount = Number(c.amount)
    const referredName = c.referred?.name ?? "-"
    return {
      sortTime: paidAt.getTime(),
      sortName: referredName,
      row: {
        paidAtFormatted: formatDateBR(paidAt),
        referredName,
        competenciaFormatted: formatCompetencia(competencia),
        percentFormatted: formatPercent(percent),
        amountFormatted: formatBRL(amount),
        statusLabel: STATUS_LABEL[c.status] ?? c.status,
      },
    }
  })

  // Cada comissao mensal vira N linhas (uma por unidade indicada) para o demonstrativo
  // ficar legivel. A soma das linhas continua sendo apuracao, nao caixa.
  const monthlyRows: SortableRow[] = monthlyCommissions.flatMap((mc) => {
    const paidAt = rowPaidAt(mc.payoutId, mc.paidAt ?? mc.updatedAt)
    const paidAtFormatted = formatDateBR(paidAt)
    const competenciaFormatted = formatPeriodCompetencia(mc.period)
    const statusLabel = STATUS_LABEL[mc.status] ?? mc.status
    const lines = parseLinesSnapshot(mc.linesSnapshot)

    if (lines.length === 0) {
      // Snapshot ausente ou malformado: nao ha como abrir por unidade, entao agrega.
      return [
        {
          sortTime: paidAt.getTime(),
          sortName: "",
          row: {
            paidAtFormatted,
            referredName: `${mc.unitCount} unidade(s)`,
            competenciaFormatted,
            percentFormatted: "-",
            amountFormatted: formatBRL(Number(mc.amount)),
            statusLabel,
          },
        },
      ]
    }

    return lines.map((line) => ({
      sortTime: paidAt.getTime(),
      sortName: line.name,
      row: {
        paidAtFormatted,
        referredName: line.name,
        competenciaFormatted,
        // Valor fixo por unidade nao tem percentual a exibir.
        percentFormatted: (() => {
          const p = linePercent(line)
          return p === null ? "-" : formatPercent(p)
        })(),
        amountFormatted: formatBRL(line.amount),
        statusLabel,
      },
    }))
  })

  const rows = [...legacyRows, ...monthlyRows]
    .sort((a, b) => a.sortTime - b.sortTime || a.sortName.localeCompare(b.sortName, "pt-BR"))
    .map((entry) => entry.row)

  // Apuracao: soma do `amount` gravado nas comissoes (nunca do snapshot, que pode
  // divergir por arredondamento das linhas). So serve para evidenciar o ajuste.
  const accrued =
    commissions.reduce((acc, c) => acc + Number(c.amount), 0) +
    monthlyCommissions.reduce((acc, mc) => acc + Number(mc.amount), 0)

  // Caixa: e este que fecha o documento.
  const gross = payouts.reduce((acc, p) => acc + Number(p.amount), 0)
  const irrf = 0
  const net = gross - irrf

  // Meio centavo de tolerancia: abaixo disso e ruido de arredondamento, nao ajuste.
  const delta = gross - accrued
  const adjustment =
    Math.abs(delta) >= 0.005
      ? {
          accruedFormatted: formatBRL(accrued),
          deltaFormatted: formatSignedBRL(delta),
          note: extractAdjustmentJustification(payouts.map((p) => p.notes)),
        }
      : null

  const logoUrl = `${appUrl()}/images/logo.png`

  const element = DemonstrativoDocument({
    logoUrl,
    monthLabel: label,
    tenant: {
      name: tenant.name,
      slug: tenant.slug,
      referralCode: tenant.referralCode ?? "-",
      pixKey: tenant.pixKey,
      pixKeyType: tenant.pixKeyType,
    },
    rows,
    totals: {
      grossFormatted: formatBRL(gross),
      irrfFormatted: formatBRL(irrf),
      netFormatted: formatBRL(net),
      adjustment,
    },
    emittedAtFormatted: formatDateTimeBR(new Date()),
  })

  const buffer = await renderToBuffer(element)

  return {
    buffer: buffer as Buffer,
    metadata: {
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      monthLabel: label,
      monthIso: filter.month,
      rowsCount: rows.length,
    },
  }
}
