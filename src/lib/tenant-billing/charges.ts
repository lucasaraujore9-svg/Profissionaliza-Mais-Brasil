/**
 * Cobranças que a UNIDADE paga para a PMB (mensalidade da revenda).
 *
 * Fonte única do que a unidade vê em /painel/cobrancas, no card do dashboard e
 * no pop-up de vencimento — e do que o cron de lembretes considera "em aberto".
 * Manter uma regra só evita a divergência clássica: o pop-up avisa de um boleto
 * que a listagem não mostra (ou vice-versa).
 *
 * Direção do dinheiro: aqui é SEMPRE revenda → PMB (gateway Asaas da mãe). Não
 * confundir com `Payment`, que é aluno → revenda.
 *
 * SERVER-ONLY: fala com o Prisma. Tipos e helpers puros (usáveis no cliente)
 * ficam em `./types`.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  OPEN_STATUSES,
  PAID_STATUSES,
  ALERT_WINDOW_DAYS,
  toCharge,
  type TenantBillingSummary,
  type TenantCharge,
} from "./types"

export * from "./types"

const SELECT = {
  id: true,
  asaasPaymentId: true,
  amount: true,
  billingType: true,
  status: true,
  dueDate: true,
  paidAt: true,
  invoiceUrl: true,
  bankSlipUrl: true,
  markedPaidAt: true,
} as const

/**
 * O que conta como dívida viva da unidade. Um objeto só porque a leitura por
 * unidade (`getTenantBillingSummary`) e a leitura em lote (a lista e o export do
 * /admin) precisam responder a MESMA pergunta — divergir aqui produziria a tela
 * de revendedores dizendo "em dia" para quem o painel da unidade cobra.
 */
const OPEN_WHERE: Prisma.TenantPaymentWhereInput = {
  status: { in: [...OPEN_STATUSES] },
  // Cobrança quitada na mão pelo financeiro da PMB não é dívida da unidade —
  // cobrar de novo seria um erro de cara para o cliente.
  markedPaidAt: null,
}

/**
 * Resumo de cobranças da unidade. `historyLimit` controla quantas pagas voltam
 * (0 = nenhuma, para o card do dashboard e o pop-up, que só olham o que está em
 * aberto).
 */
export async function getTenantBillingSummary(
  tenantId: string,
  options: { historyLimit?: number; now?: Date } = {},
): Promise<TenantBillingSummary> {
  const historyLimit = options.historyLimit ?? 0
  const now = options.now ?? new Date()

  const [openRows, paidRows] = await Promise.all([
    prisma.tenantPayment.findMany({
      where: { tenantId, ...OPEN_WHERE },
      select: SELECT,
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
    historyLimit > 0
      ? prisma.tenantPayment.findMany({
          where: {
            tenantId,
            OR: [
              { status: { in: [...PAID_STATUSES] } },
              { markedPaidAt: { not: null } },
            ],
          },
          select: SELECT,
          orderBy: { dueDate: "desc" },
          take: historyLimit,
        })
      : Promise.resolve([]),
  ])

  const open = openRows.map((r) => toCharge(r, now))
  const paid = paidRows.map((r) => toCharge(r, now))

  return { ...rollupOpenCharges(open), paid }
}

/**
 * Agregados de um conjunto de cobranças EM ABERTO já ordenado por vencimento.
 * Puro de propósito: é a mesma conta para uma unidade (`getTenantBillingSummary`)
 * e para as 200 linhas da lista do /admin — e a única forma de garantir que as
 * duas telas contem "vencidas" do mesmo jeito.
 */
export function rollupOpenCharges(
  open: TenantCharge[],
): Omit<TenantBillingSummary, "paid"> {
  const overdue = open.filter((c) => c.urgency === "overdue")
  return {
    open,
    openCount: open.length,
    openAmount: open.reduce((sum, c) => sum + c.amount, 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, c) => sum + c.amount, 0),
    // `open` já vem ordenada por vencimento: a primeira é a vencida mais antiga
    // quando há atraso, senão a próxima a vencer.
    next: open[0] ?? null,
    alerts: open.filter((c) => c.daysUntilDue <= ALERT_WINDOW_DAYS),
  }
}

/**
 * Teto de linhas da leitura em lote. A lista do /admin traz no máximo 200
 * unidades e uma unidade saudável tem 1–2 cobranças em aberto, então o teto só
 * é alcançado por anomalia — e, se for, o corte cai nas cobranças de vencimento
 * MAIS DISTANTE (a ordenação é global por `dueDate`), que são as menos urgentes.
 */
const BULK_OPEN_CHARGES_LIMIT = 5_000

/**
 * Cobranças em aberto de VÁRIAS unidades numa consulta só.
 *
 * Existe porque chamar `getTenantBillingSummary` por linha na lista do /admin
 * seria um N+1 de 200 queries. O predicado é o mesmo (`OPEN_WHERE`); o que muda
 * é o número de unidades por ida ao banco.
 *
 * Devolve um Map tenantId -> cobranças ordenadas por vencimento (asc). Unidade
 * sem nada em aberto não aparece no Map — use `?? []`.
 */
export async function getOpenChargesByTenant(
  tenantIds: string[],
  options: { now?: Date } = {},
): Promise<Map<string, TenantCharge[]>> {
  const byTenant = new Map<string, TenantCharge[]>()
  if (tenantIds.length === 0) return byTenant

  const now = options.now ?? new Date()
  const rows = await prisma.tenantPayment.findMany({
    where: { tenantId: { in: tenantIds }, ...OPEN_WHERE },
    select: { ...SELECT, tenantId: true },
    orderBy: { dueDate: "asc" },
    take: BULK_OPEN_CHARGES_LIMIT,
  })

  for (const row of rows) {
    const list = byTenant.get(row.tenantId)
    // Preserva a ordem por vencimento da consulta — `next` é o primeiro item.
    if (list) list.push(toCharge(row, now))
    else byTenant.set(row.tenantId, [toCharge(row, now)])
  }
  return byTenant
}
