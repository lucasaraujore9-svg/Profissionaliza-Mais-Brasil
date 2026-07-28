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
import { prisma } from "@/lib/prisma"
import {
  OPEN_STATUSES,
  PAID_STATUSES,
  ALERT_WINDOW_DAYS,
  toCharge,
  type TenantBillingSummary,
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
      where: {
        tenantId,
        status: { in: [...OPEN_STATUSES] },
        // Cobrança quitada na mão pelo financeiro da PMB não é dívida da
        // unidade — cobrar de novo seria um erro de cara para o cliente.
        markedPaidAt: null,
      },
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

  const overdue = open.filter((c) => c.urgency === "overdue")

  return {
    open,
    paid,
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
