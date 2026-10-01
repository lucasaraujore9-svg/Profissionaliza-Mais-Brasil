import { prisma } from "@/lib/prisma"
import { SUBSCRIPTION_REVENUE_WHERE } from "@/lib/subscriptions/revenue"

/**
 * Pagamentos confirmados do aluno, de curso E de assinatura, numa lista só.
 *
 * O ciclo de assinatura mora em `subscription_payments`, não em `payments`. As
 * telas do aluno só liam `payments`: o assinante com o plano pago e ativo via
 * "Total pago R$ 0,00" e "Nenhum pagamento confirmado ainda". Mesmo recorte que
 * a receita da unidade usa (`SUBSCRIPTION_REVENUE_WHERE`): ciclo pago e não
 * estornado.
 */
export interface StudentPaymentRow {
  id: string
  /** Nome do curso, ou "Assinatura — <plano>". */
  label: string
  amount: number
  paidAt: Date | null
  /** Chave de status no formato de `Payment.mpStatus`. */
  status: string
}

export async function loadStudentPaymentHistory(
  studentId: string,
  take?: number,
): Promise<StudentPaymentRow[]> {
  const [payments, cycles] = await Promise.all([
    prisma.payment.findMany({
      where: { enrollment: { studentId } },
      orderBy: { paidAt: "desc" },
      take,
      select: {
        id: true,
        amount: true,
        paidAt: true,
        mpStatus: true,
        enrollment: { select: { course: { select: { nome: true } } } },
      },
    }),
    prisma.subscriptionPayment.findMany({
      where: { subscription: { studentId }, ...SUBSCRIPTION_REVENUE_WHERE },
      orderBy: { paidAt: "desc" },
      take,
      select: {
        id: true,
        amount: true,
        paidAt: true,
        subscription: { select: { plan: { select: { name: true } } } },
      },
    }),
  ])

  const rows: StudentPaymentRow[] = [
    ...payments.map((p) => ({
      id: p.id,
      label: p.enrollment.course.nome,
      amount: Number(p.amount),
      paidAt: p.paidAt,
      status: p.mpStatus,
    })),
    ...cycles.map((c) => ({
      id: c.id,
      label: `Assinatura — ${c.subscription.plan.name}`,
      amount: Number(c.amount),
      paidAt: c.paidAt,
      status: "APPROVED",
    })),
  ]
  rows.sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))
  return take ? rows.slice(0, take) : rows
}
