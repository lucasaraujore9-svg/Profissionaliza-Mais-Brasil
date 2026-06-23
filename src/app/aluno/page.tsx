import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import {
  getStudentPlatformCredentials,
  getStudentPlatformLoginUrl,
} from "@/lib/students/platform-credentials"
import { PlatformCredentialsCard } from "@/components/aluno/platform-credentials-card"
import { PaymentCheckButton } from "@/components/aluno/payment-check-button"
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CreditCard,
  ExternalLink,
  GraduationCap,
  HelpCircle,
  ShoppingBag,
} from "lucide-react"

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function timeGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

export default async function StudentDashboardPage() {
  const session = await requireStudentSession()
  if (!session) return null

  const [enrollments, payments, platformCredentials] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: session.studentId },
      include: {
        course: {
          select: {
            nome: true,
            capaImageUrl: true,
            capaOverride: true,
            provider: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { enrollment: { studentId: session.studentId } },
      orderBy: { paidAt: "desc" },
      take: 5,
      include: { enrollment: { include: { course: { select: { nome: true } } } } },
    }),
    getStudentPlatformCredentials(session.studentId),
  ])

  const activeEnrollments = enrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "COMPLETED",
  )
  const activeCourses = activeEnrollments.length
  const pendingEnrollments = enrollments.filter((e) => e.status === "PENDING")
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const hasNoEnrollments = enrollments.length === 0
  const continueEnrollment = activeEnrollments[0] ?? null

  // URL da plataforma de aulas (env EA_STUDENT_LOGIN_URL com fallback playcurso).
  const plataformaLoginUrl = getStudentPlatformLoginUrl()

  // Link "continuar estudando": curso LMS abre via SSO do nosso backend; curso
  // EA abre o login da plataforma legada.
  const continueHref = continueEnrollment
    ? continueEnrollment.course.provider === "LMS"
      ? `/api/aluno/curso/${continueEnrollment.id}/acessar`
      : plataformaLoginUrl
    : null

  const firstName = session.name?.split(" ")[0] ?? "aluno"

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          {timeGreeting()}, {firstName}!
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {hasNoEnrollments
            ? "Vamos começar? Escolha um curso e comece a estudar hoje mesmo."
            : "Esta é a sua plataforma acadêmica: acompanhe cursos, pagamentos e certificados aqui — e acesse a plataforma de aulas para assistir aos vídeos."}
        </p>
      </header>

      {/* Banner de "Continuar estudando" — primeiro destaque visual quando há curso ativo */}
      {continueEnrollment && continueHref && (
        <a
          href={continueHref}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--color-pmb-green)]/20 bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-900)] p-6 text-white shadow-sm transition-all hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pmb-gold)] text-[var(--color-pmb-green-900)]">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-pmb-lime)]">
                Continue estudando
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold">
                {continueEnrollment.course.nome}
              </p>
              {continueEnrollment.progressPercent !== null &&
                continueEnrollment.progressPercent !== undefined && (
                  <p className="mt-0.5 text-xs text-white/80">
                    {continueEnrollment.progressPercent}% concluído
                  </p>
                )}
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-pmb-green)] shadow-sm transition-transform group-hover:translate-x-0.5">
            Acessar aulas
            <ExternalLink className="h-4 w-4" />
          </span>
        </a>
      )}

      {/* Credenciais da plataforma de aulas — só aparece com matrícula paga */}
      {platformCredentials && (
        <PlatformCredentialsCard
          login={platformCredentials.login}
          senha={platformCredentials.senha}
          loginUrl={plataformaLoginUrl}
        />
      )}

      {/* Empty state quando aluno ainda não tem cursos */}
      {hasNoEnrollments && (
        <Link
          href="/aluno/comprar"
          className="group flex flex-col items-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed border-[var(--color-pmb-green)]/30 bg-white p-8 text-center shadow-sm transition-all hover:border-[var(--color-pmb-green)] hover:shadow-md sm:flex-row sm:text-left"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
            <ShoppingBag className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[var(--color-pmb-green-900)]">
              Escolha seu primeiro curso
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Mais de 200 cursos profissionalizantes com certificado.
              Pague no Pix e comece a estudar agora.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-[var(--color-pmb-green-700)]">
            Ver catálogo
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {/* Cards de métricas */}
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
          <p className="mt-3 font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
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

      {/* Pendências — alerta de ação imediata */}
      {pendingEnrollments.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <h2 className="text-base font-semibold text-amber-900">
                Você tem cobranças aguardando pagamento
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Conclua os pagamentos abaixo para liberar o acesso ao(s) curso(s).
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {pendingEnrollments.map((e) => {
              const link = e.asaasInvoiceUrl ?? null
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-3 rounded-lg bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-pmb-green-900)]">
                      {e.course.nome}
                    </p>
                    <p className="text-xs text-gray-500">
                      Valor: <span className="font-mono">{brl(Number(e.finalAmount))}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
                      >
                        Pagar agora
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    )}
                    <PaymentCheckButton enrollmentId={e.id} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Últimos pagamentos */}
      {payments.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              Últimos pagamentos
            </h2>
            <Link
              href="/aluno/pagamentos"
              className="text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
            >
              Ver todos →
            </Link>
          </div>
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
        </section>
      )}

      {/* Acessos secundários (só aparece se já tem cursos para evitar redundância) */}
      {!hasNoEnrollments && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/aluno/cursos"
            className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[var(--color-pmb-green)] hover:shadow-md"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Meus cursos
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                Veja progresso e baixe certificados.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/aluno/comprar"
            className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[var(--color-pmb-green)] hover:shadow-md"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Comprar novo curso
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                Acesse o catálogo e contrate em poucos cliques.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/aluno/suporte"
            className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[var(--color-pmb-green)] hover:shadow-md"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
              <HelpCircle className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Suporte
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                Tire dúvidas ou fale com a equipe.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </div>
  )
}
