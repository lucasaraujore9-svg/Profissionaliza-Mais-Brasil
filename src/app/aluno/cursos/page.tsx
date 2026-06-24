import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { syncStudentProgress } from "@/lib/students/progress"
import { getStudentPlatformLoginUrl } from "@/lib/students/platform-credentials"
import { EmitCertificateButton } from "@/components/aluno/emit-certificate-button"
import { contextLogger } from "@/lib/logger"
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  ShoppingBag,
  XCircle,
} from "lucide-react"

interface StatusBadge {
  label: string
  icon: typeof Clock
  className: string
}

const STATUS_BADGE: Record<string, StatusBadge> = {
  PENDING: {
    label: "Aguardando pagamento",
    icon: Clock,
    className: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  },
  ACTIVE: {
    label: "Liberado",
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  SUSPENDED: {
    label: "Suspenso",
    icon: XCircle,
    className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  },
  CANCELLED: {
    label: "Cancelado",
    icon: XCircle,
    className: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  },
  COMPLETED: {
    label: "Concluído",
    icon: Award,
    className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  },
}

const PROGRESS_STATUS_LABEL: Record<string, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
  AGUARDANDO: "Aguardando início",
}

// Mensagens amigáveis para a falha de acesso ao curso LMS (FE-005). A rota
// /api/aluno/curso/[id]/acessar redireciona para cá com ?erro=<code> quando não
// consegue abrir o curso, em vez de responder JSON cru.
const ACCESS_ERROR_MESSAGE: Record<string, string> = {
  indisponivel: "Este curso não está disponível para acesso no momento.",
  parceiro:
    "O acesso ao parceiro está indisponível agora. Fale com o suporte se persistir.",
  falha:
    "Não foi possível abrir o curso agora. Tente novamente em instantes.",
}

export default async function StudentCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const session = await requireStudentSession()
  if (!session) return null

  const { erro } = await searchParams
  const accessError = erro ? ACCESS_ERROR_MESSAGE[erro] : undefined

  // Best-effort: sincroniza progresso (não bloqueia a página em caso de erro)
  try {
    await syncStudentProgress(session.studentId)
  } catch (err) {
    contextLogger().warn(
      { err, event: "aluno.cursos.sync_progress_failed", studentId: session.studentId },
      "syncStudentProgress falhou na page — degrada UX mas não bloqueia",
    )
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: session.studentId },
    include: {
      course: {
        select: {
          nome: true,
          descricao: true,
          descricaoOverride: true,
          capaImageUrl: true,
          capaOverride: true,
          categoriaLoja: true,
          provider: true,
        },
      },
      certificates: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, code: true, pdfUrl: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // % mínimo de progresso para o curso ser considerado concluído (libera a
  // emissão do certificado pelo próprio aluno).
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { certificateMinPercent: true },
  })
  const minPercent = settings?.certificateMinPercent ?? 80

  // URL da plataforma de aulas (env EA_STUDENT_LOGIN_URL com fallback playcurso).
  const plataformaLoginUrl = getStudentPlatformLoginUrl()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          Meus cursos
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Acompanhe seu progresso, acesse as aulas e baixe seus certificados
          quando concluir o curso.
        </p>
      </header>

      {accessError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{accessError}</span>
        </div>
      )}

      {enrollments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(2,89,24,0.18)] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
            <BookOpen className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[var(--color-pmb-green-900)]">
            Você ainda não tem cursos
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            Escolha um curso no nosso catálogo e comece a estudar hoje mesmo.
            O pagamento pode ser feito no Pix, cartão ou boleto.
          </p>
          <Link
            href="/aluno/comprar"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
          >
            <ShoppingBag className="h-4 w-4" />
            Ver catálogo de cursos
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {enrollments.map((e) => {
            const capa = e.course.capaOverride ?? e.course.capaImageUrl ?? null
            const descricao =
              e.course.descricaoOverride ?? e.course.descricao ?? null
            const certificate = e.certificates[0] ?? null
            const percent = e.progressPercent ?? 0
            const progressLabel = e.progressStatus
              ? PROGRESS_STATUS_LABEL[e.progressStatus] ?? e.progressStatus
              : null
            const badge = STATUS_BADGE[e.status] ?? STATUS_BADGE.CANCELLED
            const BadgeIcon = badge.icon
            const isActive = e.status === "ACTIVE" || e.status === "COMPLETED"
            const isPending = e.status === "PENDING"
            // Curso concluído (segundo o progresso da plataforma) e ainda sem
            // certificado emitido → libera a emissão self-service.
            const isConcluded =
              e.progressStatus === "CONCLUIDO" || percent >= minPercent
            const canEmitCertificate = isActive && isConcluded && !certificate

            return (
              <article
                key={e.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Capa do curso (com fallback visual quando não há imagem) */}
                <div className="relative h-36 w-full bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-900)]">
                  {capa ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={capa}
                      alt={e.course.nome}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--color-pmb-lime)]">
                      <GraduationCap className="h-14 w-14 opacity-70" aria-hidden />
                    </div>
                  )}
                  <span
                    className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}
                  >
                    <BadgeIcon className="h-3 w-3" aria-hidden />
                    {badge.label}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-base font-semibold leading-snug text-[var(--color-pmb-green-900)]">
                    {e.course.nome}
                  </h3>
                  {e.course.categoriaLoja && (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      {e.course.categoriaLoja}
                    </p>
                  )}
                  {descricao && (
                    <p className="mt-3 line-clamp-2 text-sm text-gray-600">
                      {descricao}
                    </p>
                  )}

                  {/* Progresso (só pra cursos ativos/concluídos) */}
                  {isActive && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>
                          Progresso{progressLabel ? ` · ${progressLabel}` : ""}
                        </span>
                        <span className="font-semibold text-[var(--color-pmb-green-900)]">
                          {percent}%
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100"
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-2 rounded-full bg-[var(--color-pmb-green)] transition-all"
                          style={{
                            width: `${Math.max(0, Math.min(100, percent))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Aviso pendente — mensagem clara para leigos */}
                  {isPending && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Conclua o pagamento para liberar o acesso às aulas.
                      </span>
                    </div>
                  )}

                  <div className="mt-5 flex flex-1 flex-col justify-end gap-3">
                    {/* CTA PRIMÁRIO destacado para a ação mais importante.
                        Curso LMS: SSO de uso único pelo nosso backend (sem
                        login/senha). Curso EA: link da plataforma legada. */}
                    {isActive && e.course.provider === "LMS" ? (
                      <a
                        href={`/api/aluno/curso/${e.id}/acessar`}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
                      >
                        Acessar curso
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : isActive && plataformaLoginUrl ? (
                      <a
                        href={plataformaLoginUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
                      >
                        Acessar aulas
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                    {isPending && (
                      <Link
                        href="/aluno/pagamentos"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
                      >
                        Pagar agora
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}

                    {/* CTA secundário (certificado) */}
                    {certificate ? (
                      <a
                        href={`/aluno/certificados/${certificate.id}`}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-green)]/5"
                      >
                        <Award className="h-4 w-4" />
                        Acessar certificado
                      </a>
                    ) : canEmitCertificate ? (
                      <EmitCertificateButton enrollmentId={e.id} />
                    ) : null}

                    <p className="text-center text-[11px] text-gray-500">
                      Comprado em{" "}
                      {new Date(e.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
