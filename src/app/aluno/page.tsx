import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { CreditCard, GraduationCap, AlertCircle, ShoppingBag } from "lucide-react"

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function StudentDashboardPage() {
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
      orderBy: { paidAt: "desc" },
      take: 5,
      include: { enrollment: { include: { course: { select: { nome: true } } } } },
    }),
  ])

  const activeCourses = enrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "COMPLETED",
  ).length
  const pendingEnrollments = enrollments.filter((e) => e.status === "PENDING")
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  const eaLoginUrl =
    process.env.EA_STUDENT_LOGIN_URL ?? "https://escolaavancada.com.br/aluno"

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          Olá, {session.name?.split(" ")[0] ?? "aluno"}!
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Aqui você acompanha seus cursos e pagamentos.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
              <GraduationCap className="h-4 w-4" />
            </span>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Cursos ativos
            </p>
          </div>
          <p className="mt-3 text-2xl font-bold text-[var(--color-pmb-green-900)]">
            {activeCourses}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CreditCard className="h-4 w-4" />
            </span>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Total pago
            </p>
          </div>
          <p className="mt-3 text-2xl font-bold text-[var(--color-pmb-green-900)]">
            {brl(totalPaid)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertCircle className="h-4 w-4" />
            </span>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Pagamentos pendentes
            </p>
          </div>
          <p className="mt-3 text-2xl font-bold text-[var(--color-pmb-green-900)]">
            {pendingEnrollments.length}
          </p>
        </div>
      </div>

      {pendingEnrollments.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-sm font-semibold text-amber-900">
            Você tem cobranças aguardando pagamento
          </h2>
          <p className="mt-1 text-xs text-amber-800">
            Conclua os pagamentos abaixo para liberar o acesso ao(s) curso(s).
          </p>
          <ul className="mt-4 space-y-2">
            {pendingEnrollments.map((e) => {
              const link = e.asaasInvoiceUrl ?? null
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-pmb-green-900)]">
                      {e.course.nome}
                    </p>
                    <p className="text-xs text-gray-500">
                      Valor: {brl(Number(e.finalAmount))}
                    </p>
                  </div>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
                    >
                      Pagar agora
                    </a>
                  ) : (
                    <Link
                      href="/aluno/pagamentos"
                      className="text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
                    >
                      Detalhes
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Últimos pagamentos
          </h2>
          <Link
            href="/aluno/pagamentos"
            className="text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
          >
            Ver todos
          </Link>
        </div>
        {payments.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            Você ainda não tem pagamentos confirmados.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-pmb-green-900)]">
                    {p.enrollment.course.nome}
                  </p>
                  <p className="text-xs text-gray-500">
                    {p.paidAt
                      ? new Date(p.paidAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                </div>
                <span className="font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
                  {brl(Number(p.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/aluno/comprar"
          className="group flex items-center gap-4 rounded-2xl border border-[var(--color-pmb-green)]/20 bg-white p-6 shadow-sm transition-all hover:border-[var(--color-pmb-green)] hover:shadow-md"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              Comprar novo curso →
            </p>
            <p className="mt-0.5 text-xs text-gray-600">
              Acesse o catálogo PMB e contrate em poucos cliques.
            </p>
          </div>
        </Link>

        <a
          href={eaLoginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[var(--color-pmb-green)] hover:shadow-md"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              Acesse sua área de aulas →
            </p>
            <p className="mt-0.5 text-xs text-gray-600">
              Use as credenciais enviadas por email.
            </p>
          </div>
        </a>
      </div>
    </div>
  )
}
