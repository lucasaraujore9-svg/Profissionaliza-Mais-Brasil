import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { syncStudentProgress } from "@/lib/students/progress"
import { contextLogger } from "@/lib/logger"

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando pagamento",
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

const PROGRESS_STATUS_LABEL: Record<string, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
  AGUARDANDO: "Aguardando",
}

export default async function StudentCoursesPage() {
  const session = await requireStudentSession()
  if (!session) return null

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

  // Sem fallback: se a env nao estiver configurada, escondemos o CTA externo
  // em vez de vazar a URL da plataforma parceira (quebra o white-label).
  const plataformaLoginUrl = process.env.EA_STUDENT_LOGIN_URL?.trim() || null

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

      {enrollments.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            Você ainda não tem cursos contratados.
          </p>
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
            return (
              <article
                key={e.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                {capa && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={capa}
                    alt={e.course.nome}
                    className="h-32 w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                      {e.course.nome}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[e.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </div>
                  {e.course.categoriaLoja && (
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                      {e.course.categoriaLoja}
                    </p>
                  )}
                  {descricao && (
                    <p className="mt-3 line-clamp-3 text-xs text-gray-600">
                      {descricao}
                    </p>
                  )}

                  {(e.status === "ACTIVE" || e.status === "COMPLETED") && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] text-gray-600">
                        <span>
                          Progresso{progressLabel ? ` · ${progressLabel}` : ""}
                        </span>
                        <span className="font-semibold text-[var(--color-pmb-green-900)]">
                          {percent}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-[var(--color-pmb-green)]"
                          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-gray-500">
                      Comprado em{" "}
                      {new Date(e.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                    <div className="flex items-center gap-2">
                      {certificate ? (
                        <a
                          href={`/aluno/certificados/${certificate.id}`}
                          className="rounded-md border border-[var(--color-pmb-green)] px-3 py-1 font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green)]/5"
                        >
                          Baixar certificado
                        </a>
                      ) : null}
                      {plataformaLoginUrl &&
                      (e.status === "ACTIVE" || e.status === "COMPLETED") ? (
                        <a
                          href={plataformaLoginUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md bg-[var(--color-pmb-green)] px-3 py-1 font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
                        >
                          Acessar aulas
                        </a>
                      ) : null}
                    </div>
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
