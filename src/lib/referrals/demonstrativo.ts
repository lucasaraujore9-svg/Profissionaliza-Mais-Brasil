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
 * Considera comissoes com status PAID e cujo paidAt esta dentro do mes informado,
 * unindo os dois ledgers: o legado (uma linha por mensalidade) e o mensal
 * (uma linha por periodo, expandida por unidade via `linesSnapshot`).
 * Empty state: PDF emitido normalmente com aviso de "nenhuma comissao paga".
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

  const commissions = await prisma.referralCommission.findMany({
    where: {
      referrerTenantId: filter.tenantId,
      status: "PAID",
      paidAt: { gte: start, lt: end },
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
      paidAt: { gte: start, lt: end },
    },
    orderBy: { paidAt: "asc" },
  })

  const legacyRows: SortableRow[] = commissions.map((c) => {
    const paidAt = c.paidAt ?? c.updatedAt
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
  // ficar legivel. O total, porem, sai do `amount` da comissao (ver `gross` abaixo).
  const monthlyRows: SortableRow[] = monthlyCommissions.flatMap((mc) => {
    const paidAt = mc.paidAt ?? mc.updatedAt
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

  // O total sempre vem do `amount` gravado (nunca da soma do snapshot), para nao
  // divergir por arredondamento das linhas.
  const gross =
    commissions.reduce((acc, c) => acc + Number(c.amount), 0) +
    monthlyCommissions.reduce((acc, mc) => acc + Number(mc.amount), 0)
  const irrf = 0
  const net = gross - irrf

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
