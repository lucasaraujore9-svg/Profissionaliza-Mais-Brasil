/**
 * Edição de UMA parcela do carnê depois da venda (valor e/ou vencimento) — a
 * renegociação que antes exigia cancelar a matrícula e vender de novo. Usado
 * pelas rotas de gestão do aluno no /admin e no /painel.
 *
 * O gateway é alterado ANTES do banco: se ele recusar, nada muda aqui.
 *   - ASAAS: cada parcela é uma cobrança própria; `PUT /payments/{id}` troca
 *     valor e vencimento no mesmo boleto (o rateio é preservado — omitir
 *     `split` mantém o que já existe).
 *   - MP: boleto emitido não muda de valor. Ele é CANCELADO e a parcela volta a
 *     SCHEDULED; se já está na janela de 7 dias (ou é a 1ª), sai um boleto novo
 *     na hora, senão o cron emite no prazo de sempre.
 *
 * Nunca mexe em parcela paga: antes de alterar, o gateway é consultado — uma
 * parcela paga cujo webhook se perdeu NÃO pode ser reprecificada.
 */
import type { BoletoInstallment } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { resolveEnrollmentGatewayKeys } from "@/lib/enrollment/gateway-credentials"
import {
  AsaasApiError,
  getPayment as getAsaasPayment,
  updatePayment as updateAsaasPayment,
} from "@/lib/asaas/client"
import {
  MPApiError,
  getPayment as getMpPayment,
  cancelPayment as cancelMpPayment,
} from "@/lib/mercadopago/client"
import { generateMpBoletoForInstallment } from "./plan"
import { maybeReactivate } from "./settle"
import {
  installmentAmountsError,
  MIN_INSTALLMENT_AMOUNT,
  isWithinRevealWindow,
  sumAmounts,
} from "./schedule"

/** Recusa esperada e acionável (vira 4xx na rota, com a mensagem). */
export class InstallmentEditError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 502 = 409,
  ) {
    super(message)
    this.name = "InstallmentEditError"
  }
}

const EDITABLE = new Set(["SCHEDULED", "GENERATED", "OVERDUE"])
const ASAAS_PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"])

export interface InstallmentSnapshot {
  number: number
  amount: number
  dueDate: string
  status: string
}

export interface EditInstallmentResult {
  before: InstallmentSnapshot
  after: InstallmentSnapshot
  /** MP: o boleto novo não pôde ser emitido agora — o cron tenta de novo. */
  reissuePending: boolean
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function snapshot(row: BoletoInstallment): InstallmentSnapshot {
  return {
    number: row.number,
    amount: Number(row.amount),
    dueDate: ymd(row.dueDate),
    status: row.status,
  }
}

export async function editBoletoInstallment(params: {
  enrollmentId: string
  installmentId: string
  amount?: number
  /** YYYY-MM-DD */
  dueDate?: string
  now?: Date
}): Promise<EditInstallmentResult> {
  const now = params.now ?? new Date()
  const row = await prisma.boletoInstallment.findFirst({
    where: { id: params.installmentId, enrollmentId: params.enrollmentId },
    include: { enrollment: { select: { status: true, tenantId: true } } },
  })
  if (!row) throw new InstallmentEditError("Parcela não encontrada", 404)
  if (!EDITABLE.has(row.status) || row.enrollment.status === "CANCELLED") {
    throw new InstallmentEditError(
      "Parcela paga ou cancelada não pode ser alterada.",
    )
  }

  const amount = params.amount ?? Number(row.amount)
  if (installmentAmountsError([amount], 1)) {
    throw new InstallmentEditError(
      `Valor inválido — mínimo de R$ ${MIN_INSTALLMENT_AMOUNT},00 por parcela.`,
      400,
    )
  }

  const dueDate = params.dueDate
    ? new Date(`${params.dueDate}T12:00:00Z`)
    : row.dueDate
  // Vale também quando só o valor muda: boleto novo não pode nascer vencido,
  // então renegociar parcela em atraso exige um vencimento novo.
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  if (Number.isNaN(dueDate.getTime()) || dueDate < todayStart) {
    throw new InstallmentEditError(
      params.dueDate
        ? "O vencimento deve ser hoje ou uma data futura."
        : "Parcela vencida: informe um novo vencimento.",
      400,
    )
  }

  const before = snapshot(row)
  if (amount === before.amount && ymd(dueDate) === before.dueDate) {
    return { before, after: before, reissuePending: false }
  }

  const keys = await resolveEnrollmentGatewayKeys(row.enrollment)
  let updated: BoletoInstallment
  let reissuePending = false

  if (row.gateway === "ASAAS") {
    if (!row.asaasPaymentId) {
      throw new InstallmentEditError("Parcela sem cobrança no Asaas.")
    }
    if (!keys.asaasApiKey) {
      throw new InstallmentEditError(keys.missing ?? "Conta Asaas da venda indisponível.", 502)
    }
    const current = await getAsaasPayment(row.asaasPaymentId, keys.asaasApiKey)
    if (ASAAS_PAID.has(current.status)) {
      throw new InstallmentEditError(
        "Esta parcela já foi paga no Asaas. Use “Verificar pagamento” para registrar.",
      )
    }
    const res = await updateAsaasPayment(
      row.asaasPaymentId,
      { billingType: "BOLETO", value: amount, dueDate: ymd(dueDate) },
      keys.asaasApiKey,
    )
    updated = await prisma.boletoInstallment.update({
      where: { id: row.id },
      data: {
        amount,
        dueDate,
        invoiceUrl: res.bankSlipUrl ?? row.invoiceUrl,
        // Vencimento novo é hoje ou depois: a parcela sai do atraso.
        status: row.status === "OVERDUE" ? "GENERATED" : row.status,
      },
    })
  } else {
    if (row.mpPaymentId) {
      if (!keys.mpAccessToken) {
        throw new InstallmentEditError(keys.missing ?? "Conta Mercado Pago da venda indisponível.", 502)
      }
      const current = await getMpPayment(keys.mpAccessToken, row.mpPaymentId)
      if (current.status === "approved" || current.status === "authorized") {
        throw new InstallmentEditError(
          "Esta parcela já foi paga no Mercado Pago. Use “Verificar pagamento” para registrar.",
        )
      }
      if (current.status !== "cancelled") {
        await cancelMpPayment(keys.mpAccessToken, row.mpPaymentId)
      }
    }
    // ponytail: sem lock contra o cron emitindo a mesma linha no mesmo instante;
    // a janela é de milissegundos uma vez por dia. Lock por linha se aparecer duplicata.
    updated = await prisma.boletoInstallment.update({
      where: { id: row.id },
      data: {
        amount,
        dueDate,
        status: "SCHEDULED",
        mpPaymentId: null,
        invoiceUrl: null,
        digitableLine: null,
        generatedAt: null,
      },
    })
    if (isWithinRevealWindow(updated, now)) {
      try {
        updated = (await generateMpBoletoForInstallment(updated.id)) ?? updated
      } catch {
        // Já logado em generateMpBoletoForInstallment. A linha fica SCHEDULED e
        // o cron diário emite — a edição em si valeu.
        reissuePending = true
      }
    }
  }

  // Total da venda acompanha as parcelas (relatórios e a tela leem finalAmount).
  const all = await prisma.boletoInstallment.findMany({
    where: { enrollmentId: row.enrollmentId, status: { not: "CANCELLED" } },
    select: { amount: true },
  })
  await prisma.enrollment.update({
    where: { id: row.enrollmentId },
    data: { finalAmount: sumAmounts(all.map((a) => Number(a.amount))) },
  })

  if (row.status === "OVERDUE") {
    await maybeReactivate(row.enrollmentId).catch((err) =>
      contextLogger().error(
        { err, event: "installments.edit.reactivate_failed", enrollmentId: row.enrollmentId },
        "reativação após renegociar parcela falhou",
      ),
    )
  }

  return { before, after: snapshot(updated), reissuePending }
}

// ── Contrato das rotas de gestão (/admin e /painel) ──────────────────────────

export const editInstallmentSchema = z
  .object({
    installmentId: z.string().min(1),
    amount: z.number().positive().max(100000).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").optional(),
  })
  .refine((v) => v.amount !== undefined || v.dueDate !== undefined, {
    message: "Informe o novo valor ou o novo vencimento.",
  })

export interface InstallmentListItem {
  id: string
  number: number
  amount: number
  dueDate: string
  status: string
  paidAt: string | null
  gateway: string
}

export async function listEnrollmentInstallments(
  enrollmentId: string,
): Promise<InstallmentListItem[]> {
  const rows = await prisma.boletoInstallment.findMany({
    where: { enrollmentId },
    orderBy: { number: "asc" },
  })
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    amount: Number(r.amount),
    dueDate: ymd(r.dueDate),
    status: r.status,
    paidAt: r.paidAt?.toISOString() ?? null,
    gateway: r.gateway,
  }))
}

/**
 * Erro da edição -> resposta HTTP. Recusa 4xx do gateway (valor mínimo, data
 * inválida) chega ao operador com a mensagem do gateway; falha 5xx/rede vira
 * 502 com "tente de novo". `null` = erro inesperado (o chamador loga e responde 500).
 */
export function installmentEditErrorStatus(
  err: unknown,
): { status: number; error: string } | null {
  if (err instanceof InstallmentEditError) {
    return { status: err.status, error: err.message }
  }
  if (err instanceof AsaasApiError || err instanceof MPApiError) {
    return err.statusCode < 500
      ? { status: 400, error: `O gateway recusou: ${err.message}` }
      : { status: 502, error: "O gateway não respondeu. Tente novamente em alguns minutos." }
  }
  return null
}
