import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  SUSPENDED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-gray-100 text-gray-700",
  COMPLETED: "bg-blue-100 text-blue-700",
}

export default async function StudentPaymentsPage() {
  const session = await requireStudentSession()
  if (!session) return null

  const [enrollments, payments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: session.studentId },
      include: { course: { select: { nome: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { enrollment: { studentId: session.studentId } },
      include: {
        enrollment: { include: { course: { select: { nome: true } } } },
      },
      orderBy: { paidAt: "desc" },
    }),
  ])

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const pending = enrollments.filter((e) => e.status === "PENDING")

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total pago
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-[var(--color-pmb-green)]">
            {brl(totalPaid)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Em aberto
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-amber-700">
            {pending.length} cobrança{pending.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Cobranças em aberto
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            Você não tem cobranças pendentes.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {pending.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {e.course.nome}
                  </p>
                  <p className="text-xs text-gray-500">
                    {e.paymentType === "MONTHLY" ? "Mensalidade" : "Pagamento único"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {brl(Number(e.finalAmount))}
                  </p>
                  {e.asaasInvoiceUrl && (
                    <a
                      href={e.asaasInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block rounded-md bg-[var(--color-pmb-green)] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
                    >
                      Pagar agora
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Histórico de pagamentos
        </h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            Nenhum pagamento confirmado ainda.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-500">Data</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-500">Curso</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-500">Gateway</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {p.paidAt
                        ? new Date(p.paidAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-[var(--color-pmb-green-900)]">
                      {p.enrollment.course.nome}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      Cobrança
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[p.mpStatus] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {STATUS_LABEL[p.mpStatus] ?? p.mpStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
                      {brl(Number(p.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
