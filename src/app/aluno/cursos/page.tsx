import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"

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

export default async function StudentCoursesPage() {
  const session = await requireStudentSession()
  if (!session) return null

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
    },
    orderBy: { createdAt: "desc" },
  })

  const plataformaLoginUrl =
    process.env.EA_STUDENT_LOGIN_URL ?? "https://escolaavancada.com.br/aluno"

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          Meus cursos
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Cursos que você adquiriu. Ative o acesso na plataforma de aulas para
          começar a estudar.
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

                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-gray-500">
                    Comprado em{" "}
                    {new Date(e.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  {e.status === "ACTIVE" || e.status === "COMPLETED" ? (
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
            </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
