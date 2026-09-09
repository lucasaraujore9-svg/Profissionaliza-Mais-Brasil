/**
 * Relatorio de indicacoes de UM indicador, por competencia.
 *
 * Existe para o financeiro CONFERIR o valor antes de pagar: mostra a carteira
 * inteira, quanto cada indicada pagou no mes, quem entrou na conta, quanto
 * valeu — e, para quem ficou de fora, o porque.
 *
 * REGRA DE OURO: nada aqui recalcula comissao. Quem entrou e quanto valeu sai
 * do `linesSnapshot` gravado pelo motor no fechamento; a faixa e a contagem que
 * a escolheu saem das colunas da propria comissao. Recalcular para exibir
 * criaria uma segunda fonte da verdade e a tela passaria a "conferir" a si
 * mesma. O que este modulo faz de proprio e so CONTEXTO (carteira, recebimentos
 * do mes) e a EXPLICACAO das ausencias — ver ./relatorio-motivo.ts.
 */
import { prisma } from "@/lib/prisma"
import { EVER_PAID_TENANT_WHERE } from "@/lib/tenants/lifecycle"
import { PAID_STATUSES } from "@/lib/tenant-billing/types"
import { parseLinesSnapshot } from "@/lib/referrals/lines-snapshot"
import {
  monthIndex,
  motivoForaDaConta,
  periodMonthIndex,
  type MotivoForaDaConta,
} from "@/lib/referrals/relatorio-motivo"

export interface LinhaCarteira {
  id: string
  name: string
  slug: string
  status: string
  planValue: number
  /** Entrada no programa: COALESCE(commissionPlanStartedAt, activatedAt, createdAt). */
  entrouEm: Date
  /** A data veio de `activatedAt`? Se nao, e o fallback por cadastro. */
  ativacaoRegistrada: boolean
  everPaid: boolean
  /** Mensalidade recebida DENTRO da competencia. */
  recebidoNoMes: number
  /**
   * Quando o CLIENTE pagou cada mensalidade da competencia. E o dado que
   * explica a linha: a fatura antecipada (paga no mes anterior) e a atrasada
   * (paga no seguinte) so fazem sentido na tela quando a data aparece.
   * Pode ter MAIS DE UMA — a atrasada e a corrente caem na mesma competencia.
   */
  pagamentosNoMes: Date[]
  /** Ativou nesta competencia — e o que define a FAIXA do indicador. */
  ativouNoMes: boolean
  /** Entrou na conta do mes (fonte: linesSnapshot do motor). */
  naConta: boolean
  /** Quanto esta unidade valeu na comissao do mes. */
  valorNaConta: number
  motivoFora: MotivoForaDaConta | null
}

export interface RelatorioIndicador {
  referrer: { id: string; name: string; slug: string }
  period: string
  periodosDisponiveis: string[]
  comissao: {
    amount: number
    rate: number
    rateType: string
    bracketBasis: string
    bracketCount: number
    payoutBase: string
    unitCount: number
    baseSum: number
    status: string
    availableAt: Date
    payout: { id: string; amount: number; status: string; dueAt: Date | null } | null
  } | null
  carteira: LinhaCarteira[]
  totais: {
    ativas: number
    total: number
    canceladas: number
    ativouNoMes: number
    recebidoNoMes: number
    naConta: number
  }
}

function monthRange(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

/** Competencia anterior a `ref` — o ultimo mes fechado. */
export function ultimaCompetencia(ref = new Date()): string {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export async function loadRelatorioIndicador(
  referrerId: string,
  period: string,
): Promise<RelatorioIndicador | null> {
  const range = monthRange(period)
  const pIndex = periodMonthIndex(period)
  if (!range || pIndex === null) return null

  const referrer = await prisma.tenant.findUnique({
    where: { id: referrerId },
    select: { id: true, name: true, slug: true },
  })
  if (!referrer) return null

  const [comissao, competencias, unidades, jaPagaram, recebidos] =
    await Promise.all([
      prisma.referralMonthlyCommission.findUnique({
        where: { referrerTenantId_period: { referrerTenantId: referrerId, period } },
        select: {
          amount: true,
          rate: true,
          rateType: true,
          bracketBasis: true,
          bracketCount: true,
          payoutBase: true,
          unitCount: true,
          baseSum: true,
          status: true,
          availableAt: true,
          linesSnapshot: true,
          payout: { select: { id: true, amount: true, status: true, dueAt: true } },
        },
      }),
      prisma.referralMonthlyCommission.findMany({
        where: { referrerTenantId: referrerId },
        select: { period: true },
        orderBy: { period: "desc" },
        take: 24,
      }),
      prisma.tenant.findMany({
        where: { referrerTenantId: referrerId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          planValue: true,
          createdAt: true,
          activatedAt: true,
          commissionPlanStartedAt: true,
        },
        orderBy: { name: "asc" },
      }),
      // Predicado do lifecycle, nunca uma copia local: e o MESMO que o motor
      // aplica para excluir quem nunca pagou.
      prisma.tenant.findMany({
        where: { referrerTenantId: referrerId, ...EVER_PAID_TENANT_WHERE },
        select: { id: true },
      }),
      // Linha a linha, e nao `groupBy`: a tela precisa das DATAS de pagamento,
      // e uma competencia pode ter mais de uma fatura (a atrasada do mes
      // anterior somada a corrente).
      prisma.tenantPayment.findMany({
        where: {
          tenant: { referrerTenantId: referrerId },
          status: { in: [...PAID_STATUSES] },
          // MESMA data que o motor usa para a competencia. Consultar por
          // `paidAt` aqui faria a tela mostrar "sem pagamento no mes" para uma
          // unidade que o motor contou — o relatorio existe justamente para
          // conferir o motor, entao os dois tem de olhar a mesma coluna.
          competenceAt: { gte: range.start, lt: range.end },
        },
        select: {
          tenantId: true,
          amount: true,
          clientPaidAt: true,
          competenceAt: true,
        },
        orderBy: { competenceAt: "asc" },
      }),
    ])

  const everPaidSet = new Set(jaPagaram.map((t) => t.id))
  const recebidoMap = new Map<string, number>()
  const pagamentosMap = new Map<string, Date[]>()
  for (const r of recebidos) {
    recebidoMap.set(
      r.tenantId,
      (recebidoMap.get(r.tenantId) ?? 0) + Number(r.amount),
    )
    // `clientPaidAt` e a data que o cliente pagou; `competenceAt` cobre a linha
    // antiga que so tem a data de caixa (backfill).
    const quando = r.clientPaidAt ?? r.competenceAt
    if (quando) {
      pagamentosMap.set(r.tenantId, [
        ...(pagamentosMap.get(r.tenantId) ?? []),
        quando,
      ])
    }
  }
  // Fonte da verdade de quem entrou e de quanto valeu. Snapshot corrompido cai
  // em lista vazia (o parser descarta linha invalida em vez de coagir para 0) —
  // a tela mostra a conta sem a quebra, nunca uma quebra inventada.
  const linhas = parseLinesSnapshot(comissao?.linesSnapshot)
  const naContaMap = new Map(linhas.map((l) => [l.tenantId, l.amount]))

  const carteira: LinhaCarteira[] = unidades.map((u) => {
    const entrouEm = u.commissionPlanStartedAt ?? u.activatedAt ?? u.createdAt
    const planValue = Number(u.planValue)
    const everPaid = everPaidSet.has(u.id)
    const recebidoNoMes = recebidoMap.get(u.id) ?? 0
    const naConta = naContaMap.has(u.id)
    // Mesma ancora e mesmo fallback da contagem de faixa do motor: sem
    // `activatedAt`, so vale a data de cadastro se a unidade esta ACTIVE — o
    // campo nulo cobre a ativacao por cartao, nao quem nunca ativou.
    const ancoraAtivacao = u.activatedAt ?? (u.status === "ACTIVE" ? u.createdAt : null)
    const ativouNoMes =
      planValue > 0 &&
      everPaid &&
      u.status !== "CANCELLED" &&
      ancoraAtivacao !== null &&
      monthIndex(ancoraAtivacao) === pIndex

    return {
      id: u.id,
      name: u.name,
      slug: u.slug,
      status: u.status,
      planValue,
      entrouEm,
      ativacaoRegistrada: u.activatedAt !== null,
      everPaid,
      recebidoNoMes,
      pagamentosNoMes: pagamentosMap.get(u.id) ?? [],
      ativouNoMes,
      naConta,
      valorNaConta: naContaMap.get(u.id) ?? 0,
      motivoFora: motivoForaDaConta(
        {
          planValue,
          status: u.status,
          everPaid,
          paidInPeriod: recebidoNoMes > 0,
          entryMonthIndex: monthIndex(entrouEm),
        },
        pIndex,
        naConta,
      ),
    }
  })

  // Quem entrou primeiro, depois por valor — a tela abre pela conta e o resto
  // do universo vem abaixo como contexto.
  carteira.sort((a, b) => {
    if (a.naConta !== b.naConta) return a.naConta ? -1 : 1
    if (b.valorNaConta !== a.valorNaConta) return b.valorNaConta - a.valorNaConta
    return a.name.localeCompare(b.name, "pt-BR")
  })

  const periodos = competencias.map((c) => c.period)
  if (!periodos.includes(period)) periodos.unshift(period)

  return {
    referrer,
    period,
    periodosDisponiveis: periodos,
    comissao: comissao
      ? {
          amount: Number(comissao.amount),
          rate: Number(comissao.rate),
          rateType: comissao.rateType,
          bracketBasis: comissao.bracketBasis,
          bracketCount: comissao.bracketCount,
          payoutBase: comissao.payoutBase,
          unitCount: comissao.unitCount,
          baseSum: Number(comissao.baseSum),
          status: comissao.status,
          availableAt: comissao.availableAt,
          payout: comissao.payout
            ? {
                id: comissao.payout.id,
                amount: Number(comissao.payout.amount),
                status: comissao.payout.status,
                dueAt: comissao.payout.dueAt,
              }
            : null,
        }
      : null,
    carteira,
    totais: {
      ativas: carteira.filter((u) => u.status === "ACTIVE").length,
      total: carteira.length,
      canceladas: carteira.filter((u) => u.status === "CANCELLED").length,
      ativouNoMes: carteira.filter((u) => u.ativouNoMes).length,
      recebidoNoMes: carteira.reduce((acc, u) => acc + u.recebidoNoMes, 0),
      naConta: carteira.filter((u) => u.naConta).length,
    },
  }
}
