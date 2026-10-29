import type { PaymentGateway, PaymentType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"
import { brDayIso } from "@/lib/dates"
import { fulfillEnrollment, type TenantContext } from "@/lib/enrollment/fulfill"
import { rollbackSaleEnrollment } from "@/lib/enrollment/multi-course-server"
import { createMpPlanAfterExternalFirst } from "@/lib/installments/plan"
import {
  EXTERNAL_PAYMENT_TYPE,
  externalPaymentId,
  nextDueAfterExternal,
  nextMpBoletoDueAfterExternal,
} from "./external-first-payment"

/**
 * Dá baixa na 1ª mensalidade paga fora da plataforma: o mesmo `fulfillEnrollment`
 * de um pagamento confirmado pelo gateway — libera o curso, envia o acesso,
 * grava o `Payment` (com o id `ext_`, rotulado como pagamento externo) e conta
 * a 1ª parcela. Idempotente pelo id `ext_<matrícula>`.
 */
export async function registerExternalFirstPayment(input: {
  tenant: TenantContext
  enrollmentId: string
  gateway: PaymentGateway
  paymentType: PaymentType
  amount: number
  paidAt: Date
}): Promise<void> {
  const id = externalPaymentId(input.enrollmentId)
  await fulfillEnrollment(input.tenant, input.enrollmentId, {
    gateway: input.gateway,
    externalPaymentId: id,
    amount: input.amount,
    paidAt: input.paidAt,
    paymentType: input.paymentType,
    mpPaymentType: EXTERNAL_PAYMENT_TYPE,
  })
  // O fulfill carimba o id do pagamento na matrícula, que é onde a verificação
  // de pagamento e o cancelamento procuram a cobrança NO GATEWAY. `ext_` não
  // existe em gateway nenhum — a baixa fica só no `Payment`.
  await prisma.enrollment.updateMany({
    where: { id: input.enrollmentId, asaasPaymentId: id },
    data: { asaasPaymentId: null },
  })
  await prisma.enrollment.updateMany({
    where: { id: input.enrollmentId, mpPaymentId: id },
    data: { mpPaymentId: null },
  })
}

/** `paidAt` da baixa externa desta matrícula, ou null. */
export async function externalPaidAt(enrollmentId: string): Promise<Date | null> {
  const id = externalPaymentId(enrollmentId)
  const p = await prisma.payment.findFirst({
    where: { enrollmentId, OR: [{ asaasPaymentId: id }, { mpPaymentId: id }] },
    select: { paidAt: true },
  })
  return p?.paidAt ?? null
}

export interface ExternalSaleInput {
  /** null = vitrine PMB (conta-mãe Asaas). */
  tenantId: string | null
  fulfillTenant: TenantContext
  studentId: string
  soldByUserId: string
  gateway: PaymentGateway
  /** O curso é vendido em mensalidades neste canal? */
  isMonthly: boolean
  /** Nº total de mensalidades do curso (a 1ª incluída). */
  months: number | null
  /** Dia do pagamento no marketplace (YYYY-MM-DD). */
  paidAtYmd: string
  /** Endereço do aluno — o boleto do MP exige. */
  endereco?: {
    cep: string
    rua: string
    numero: string
    bairro: string
    cidade: string
    estado: string
  }
  enrollment: {
    tenantCourseId: string | null
    courseId: string
    bundleCourseIds: string[]
    /** Valores de UMA mensalidade. */
    originalAmount: number
    discountAmount: number
    finalAmount: number
    couponId: string | null
    splitSnapshot: unknown
  }
}

export type ExternalSaleResult =
  | {
      ok: true
      enrollmentId: string
      summary: {
        gateway: PaymentGateway
        months: number
        remaining: number
        monthlyAmount: number
        nextDueDate: string
      }
    }
  | { ok: false; status: number; error: string }

const cents = (v: number) => Math.round(v * 100) / 100

/**
 * Venda de curso mensal com a 1ª mensalidade paga fora. Cria a matrícula, dá
 * baixa na 1ª e prepara as próximas (ver o cabeçalho de
 * `external-first-payment.ts`). Qualquer falha desfaz a matrícula.
 */
export async function sellWithExternalFirstPayment(
  input: ExternalSaleInput,
  now: Date = new Date(),
): Promise<ExternalSaleResult> {
  const months = input.months ?? 0
  const monthly = input.enrollment.finalAmount
  if (!input.isMonthly) {
    return { ok: false, status: 400, error: "Este curso não é vendido em mensalidades." }
  }
  if (months < 2) {
    return { ok: false, status: 400, error: "O curso não tem mensalidades seguintes a cobrar." }
  }
  if (!(monthly > 0)) {
    return { ok: false, status: 400, error: "Mensalidade sem valor a cobrar." }
  }
  const paidAt = new Date(`${input.paidAtYmd}T12:00:00Z`)
  if (Number.isNaN(paidAt.getTime()) || input.paidAtYmd > brDayIso(now)) {
    return { ok: false, status: 400, error: "A data do pagamento no marketplace não pode ser futura." }
  }
  const isMp = input.gateway === "MP"
  if (isMp && input.tenantId === null) {
    return { ok: false, status: 400, error: "A vitrine PMB só cobra mensalidades pelo Asaas." }
  }
  if (isMp && !input.endereco) {
    return {
      ok: false,
      status: 400,
      error: "Informe o endereço do aluno para gerar os boletos (Mercado Pago).",
    }
  }

  const e = input.enrollment
  // MP: carnê — os valores da matrícula são do carnê INTEIRO, como em todo carnê.
  const factor = isMp ? months : 1
  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId: input.tenantId,
      studentId: input.studentId,
      tenantCourseId: e.tenantCourseId,
      courseId: e.courseId,
      bundleCourseIds: e.bundleCourseIds,
      soldByUserId: input.soldByUserId,
      paymentType: isMp ? "BOLETO_INSTALLMENT" : "MONTHLY",
      status: "PENDING",
      gateway: input.gateway,
      originalAmount: cents(e.originalAmount * factor),
      discountAmount: cents(e.discountAmount * factor),
      finalAmount: cents(monthly * factor),
      couponId: e.couponId,
      installmentsTotal: months,
      authorSplitSnapshot: e.splitSnapshot
        ? (e.splitSnapshot as Prisma.InputJsonValue)
        : undefined,
    },
    select: { id: true },
  })

  try {
    let nextDue: Date
    if (isMp) {
      await prisma.student.update({
        where: { id: input.studentId },
        data: { ...input.endereco! },
      })
      nextDue = nextMpBoletoDueAfterExternal(paidAt, now)
      // ponytail: se o fulfill abaixo falhar depois de o boleto da 2ª parcela já
      // ter saído (venda cadastrada com 3+ semanas de atraso), ele fica órfão no
      // MP. Cancelar no rollback se isso aparecer.
      await createMpPlanAfterExternalFirst({
        enrollmentId: enrollment.id,
        count: months,
        installmentValue: monthly,
        paidAt,
        nextDueDate: nextDue,
      })
    } else {
      nextDue = nextDueAfterExternal(paidAt, now)
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          externalReference:
            input.tenantId === null ? `pmb_enr_${enrollment.id}` : `enr_${enrollment.id}`,
        },
      })
    }
    await registerExternalFirstPayment({
      tenant: input.fulfillTenant,
      enrollmentId: enrollment.id,
      gateway: input.gateway,
      paymentType: isMp ? "BOLETO_INSTALLMENT" : "MONTHLY",
      amount: monthly,
      paidAt,
    })
    return {
      ok: true,
      enrollmentId: enrollment.id,
      summary: {
        gateway: input.gateway,
        months,
        remaining: months - 1,
        monthlyAmount: monthly,
        nextDueDate: nextDue.toISOString().slice(0, 10),
      },
    }
  } catch (err) {
    await rollbackSaleEnrollment(enrollment.id).catch(swallow("external_sale.rollback"))
    contextLogger().error(
      { err, event: "external_sale.failed", enrollmentId: enrollment.id },
      "venda com 1ª mensalidade paga fora falhou",
    )
    const msg = err instanceof Error ? err.message : "falha inesperada"
    return { ok: false, status: 502, error: `Falha ao registrar a venda: ${msg}` }
  }
}
