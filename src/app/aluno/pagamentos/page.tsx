import { CheckCircle2, Clock, CreditCard, FileText, XCircle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { PaymentCheckButton } from "@/components/aluno/payment-check-button"
import { PayPendingButton } from "@/components/aluno/pay-pending-button"
import {
  InstallmentsSection,
  type InstallmentCarne,
} from "@/components/aluno/installments-section"
import { isWithinRevealWindow, INSTALLMENT_REVEAL_WINDOW_DAYS } from "@/lib/installments/schedule"

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

interface StatusInfo {
  label: string
  className: string
  icon: typeof Clock
}

const PAYMENT_STATUS: Record<string, StatusInfo> = {
  PENDING: {
    label: "Pendente",
    className: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    icon: Clock,
  },
  ACTIVE: {
    label: "Aprovado",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    icon: CheckCircle2,
  },
  APPROVED: {
    label: "Aprovado",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    icon: CheckCircle2,
  },
  SUSPENDED: {
    label: "Suspenso",
    className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    icon: XCircle,
  },
  CANCELLED: {
    label: "Cancelado",
    className: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
    icon: XCircle,
  },
  REJECTED: {
    label: "Recusado",
    className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    icon: XCircle,
  },
  COMPLETED: {
    label: "Concluído",
    className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    icon: CheckCircle2,
  },
}

function statusOf(key: string): StatusInfo {
  return (
    PAYMENT_STATUS[key] ?? {
      label: key,
      className: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
      icon: Clock,
    }
  )
}

export default async function StudentPaymentsPage() {
  const session = await requireStudentSession()
  if (!session) return null

  const [enrollments, payments, installmentRows] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: session.studentId },
      include: {
        course: { select: { nome: true } },
        // Payability da loja p/ decidir o destino do botao "Pagar agora".
        tenant: { select: { status: true, mpPublicKey: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { enrollment: { studentId: session.studentId } },
      include: {
        enrollment: { include: { course: { select: { nome: true } } } },
      },
      orderBy: { paidAt: "desc" },
    }),
    prisma.boletoInstallment.findMany({
      where: {
        enrollment: { studentId: session.studentId },
        status: { not: "CANCELLED" },
      },
      include: { enrollment: { include: { course: { select: { nome: true } } } } },
      orderBy: [{ enrollmentId: "asc" }, { number: "asc" }],
    }),
  ])

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  // Carnê tem sua própria seção (boletos por parcela) — fora da lista genérica.
  const pending = enrollments.filter(
    (e) => e.status === "PENDING" && e.paymentType !== "BOLETO_INSTALLMENT",
  )

  // View model do carnê: agrupa parcelas por matrícula e resolve a disponibilidade
  // (1ª sempre; demais 7 dias antes do vencimento).
  const now = new Date()
  const carnesMap = new Map<string, InstallmentCarne>()
  for (const row of installmentRows) {
    let carne = carnesMap.get(row.enrollmentId)
    if (!carne) {
      carne = {
        enrollmentId: row.enrollmentId,
        courseName: row.enrollment.course.nome,
        parcelas: [],
      }
      carnesMap.set(row.enrollmentId, carne)
    }
    const inWindow = isWithinRevealWindow({ number: row.number, dueDate: row.dueDate }, now)
    const available =
      row.status !== "PAID" && row.status !== "CANCELLED" && inWindow
    let availableFromISO: string | null = null
    if (!inWindow) {
      const from = new Date(row.dueDate)
      from.setUTCDate(from.getUTCDate() - INSTALLMENT_REVEAL_WINDOW_DAYS)
      availableFromISO = from.toISOString()
    }
    carne.parcelas.push({
      number: row.number,
      amount: Number(row.amount),
      dueDateISO: row.dueDate.toISOString(),
      status: row.status,
      available,
      availableFromISO,
      invoiceUrl: row.invoiceUrl,
      digitableLine: row.digitableLine,
    })
  }
  const carnes = [...carnesMap.values()]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          Pagamentos
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Histórico completo de pagamentos e cobranças em aberto.
        </p>
      </header>

      <div data-tour="aluno-pagamentos:resumo" className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CreditCard className="h-4 w-4" />
            </span>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Total pago
            </p>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
            {brl(totalPaid)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </span>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Em aberto
            </p>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-amber-700">
            {pending.length}{" "}
            <span className="text-base font-medium text-gray-500">
              cobrança{pending.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      </div>

      {/* Cobranças em aberto */}
      <section
        data-tour="aluno-pagamentos:pendentes"
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Cobranças em aberto
          </h2>
        </div>
        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            Você não tem cobranças pendentes. 🎉
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {e.course.nome}
                  </p>
                  <p className="text-xs text-gray-500">
                    {e.paymentType === "MONTHLY"
                      ? "Mensalidade"
                      : "Pagamento único"}{" "}
                    · {brl(Number(e.finalAmount))}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <PayPendingButton enrollment={e} />
                  <PaymentCheckButton enrollmentId={e.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Carnê (venda parcelada no boleto) — boletos por parcela */}
      <InstallmentsSection carnes={carnes} />

      {/* Histórico — tabela em desktop, cards em mobile */}
      <section
        data-tour="aluno-pagamentos:lista"
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Histórico de pagamentos
          </h2>
        </div>

        {payments.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            Nenhum pagamento confirmado ainda.
          </p>
        ) : (
          <>
            {/* Cards no mobile */}
            <ul className="mt-4 space-y-3 md:hidden">
              {payments.map((p) => {
                const s = statusOf(p.mpStatus)
                const Icon = s.icon
                return (
                  <li
                    key={p.id}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--color-pmb-green-900)]">
                          {p.enrollment.course.nome}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {p.paidAt
                            ? new Date(p.paidAt).toLocaleDateString("pt-BR")
                            : "Data não disponível"}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
                        {brl(Number(p.amount))}
                      </span>
                    </div>
                    <span
                      className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.className}`}
                    >
                      <Icon className="h-3 w-3" aria-hidden />
                      {s.label}
                    </span>
                  </li>
                )
              })}
            </ul>

            {/* Tabela no desktop */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">
                      Data
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">
                      Curso
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => {
                    const s = statusOf(p.mpStatus)
                    const Icon = s.icon
                    return (
                      <tr key={p.id}>
                        <td className="px-3 py-3 text-xs text-gray-700">
                          {p.paidAt
                            ? new Date(p.paidAt).toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-sm font-medium text-[var(--color-pmb-green-900)]">
                          {p.enrollment.course.nome}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.className}`}
                          >
                            <Icon className="h-3 w-3" aria-hidden />
                            {s.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
                          {brl(Number(p.amount))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
