import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { brDayIso } from "@/lib/dates"
import type { TenantContext } from "@/lib/enrollment/fulfill"
import { registerExternalFirstPayment } from "@/lib/enrollment/external-first-payment-server"
import { buildFlexSchedule, flexScheduleError, flexTotal, type FlexScheduleInput } from "./flex"
import { MAX_BOLETO_INSTALLMENTS } from "./schedule"

/** Campo `parcelado` das rotas de venda direta (/painel/vendas e /admin/vendas). */
export const parceladoSchema = z.object({
  count: z.number().int().min(1).max(MAX_BOLETO_INSTALLMENTS),
  installmentValue: z.number().positive(),
  downPayment: z.number().positive().nullable().optional(),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
})

export interface FlexSalePlan {
  schedule: FlexScheduleInput
  paidBefore?: { paidAt: Date }
}

/**
 * Agenda da venda a partir do corpo da rota, ou a mensagem do 400. Roda antes
 * de qualquer escrita: 1º vencimento hoje ou futuro, "1ª paga fora" nunca no
 * futuro (dias no fuso de Brasília), e as regras puras de `flexScheduleError`.
 */
export function flexSalePlan(
  p: z.infer<typeof parceladoSchema>,
  paidAtYmd: string | undefined,
  now: Date = new Date(),
): FlexSalePlan | { error: string } {
  const today = brDayIso(now)
  const firstDueDate = new Date(`${p.firstDueDate}T12:00:00Z`)
  if (Number.isNaN(firstDueDate.getTime()) || p.firstDueDate < today) {
    return { error: "O 1º vencimento deve ser hoje ou uma data futura." }
  }
  const schedule: FlexScheduleInput = {
    count: p.count,
    installmentValue: p.installmentValue,
    downPayment: p.downPayment ?? null,
    firstDueDate,
    saleDate: now,
  }
  const err = flexScheduleError(schedule)
  if (err) return { error: err }
  if (paidAtYmd === undefined) return { schedule }
  const paidAt = new Date(`${paidAtYmd}T12:00:00Z`)
  if (Number.isNaN(paidAt.getTime()) || paidAtYmd > today) {
    return { error: "A data do pagamento feito fora não pode ser futura." }
  }
  return { schedule, paidBefore: { paidAt } }
}

export interface CreateFlexPlanInput {
  enrollmentId: string
  tenant: TenantContext
  schedule: FlexScheduleInput
  /** "1ª já paga fora": a linha 1 nasce PAID e a baixa externa é registrada. */
  paidBefore?: { paidAt: Date }
}

/**
 * Cria o plano da venda parcelada com meio escolhido pelo pagador. NÃO cobra no
 * gateway: as linhas nascem SCHEDULED e o meio (PIX/boleto/cartão) é escolhido
 * depois, parcela a parcela. Se lançar, o chamador deve apagar a matrícula
 * (as linhas caem em cascata).
 */
export async function createFlexPlan(
  input: CreateFlexPlanInput,
): Promise<{ rows: number; total: number }> {
  const err = flexScheduleError(input.schedule)
  if (err) throw new Error(err)

  const enr = await prisma.enrollment.findUnique({
    where: { id: input.enrollmentId },
    select: { id: true, tenantId: true, gateway: true },
  })
  if (!enr) throw new Error("matrícula não encontrada")
  // Vitrine PMB: matrícula com tenantId null.
  const expectedTenantId = input.tenant.isPmbVitrine ? null : input.tenant.id
  if (enr.tenantId !== expectedTenantId) throw new Error("matrícula de outra unidade")

  const rows = buildFlexSchedule(input.schedule)
  const total = flexTotal(input.schedule)
  const paid = input.paidBefore?.paidAt

  // Sem $transaction (o pooler do Supabase derruba transações em prod): linhas
  // primeiro, flag da matrícula depois — falha no meio não deixa matrícula flex sem linhas.
  await prisma.boletoInstallment.createMany({
    data: rows.map((r) => ({
      enrollmentId: enr.id,
      tenantId: enr.tenantId,
      number: r.number,
      amount: r.amount,
      dueDate: r.dueDate,
      gateway: enr.gateway,
      ...(paid && r.number === 1
        ? { status: "PAID" as const, paidAt: paid }
        : { status: "SCHEDULED" as const }),
    })),
  })
  await prisma.enrollment.update({
    where: { id: enr.id },
    data: {
      flexInstallments: true,
      flexHasDownPayment: input.schedule.downPayment != null,
      installmentsTotal: rows.length,
      finalAmount: total,
    },
  })

  if (paid) {
    await registerExternalFirstPayment({
      tenant: input.tenant,
      enrollmentId: enr.id,
      gateway: enr.gateway,
      paymentType: "BOLETO_INSTALLMENT",
      amount: rows[0].amount,
      paidAt: paid,
    })
  }
  return { rows: rows.length, total }
}
