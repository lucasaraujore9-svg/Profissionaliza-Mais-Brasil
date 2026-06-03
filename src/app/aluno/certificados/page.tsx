import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { upperCert } from "@/lib/certificates/text"

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export default async function StudentCertificatesPage() {
  const session = await requireStudentSession()
  if (!session) return null

  const certificates = await prisma.certificate.findMany({
    where: { studentId: session.studentId },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  })

  const ativos = certificates.filter((c) => !c.revokedAt)
  const revogados = certificates.filter((c) => c.revokedAt)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          Meus certificados
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Certificados de cursos concluídos. Cada certificado tem código único e
          pode ser validado em qualquer momento na página pública.
        </p>
      </header>

      {certificates.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            Você ainda não tem certificados. Eles são gerados automaticamente
            quando você conclui um curso (geralmente atinge 80% das aulas).
          </p>
        </div>
      ) : (
        <>
          {ativos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Disponíveis ({ativos.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ativos.map((c) => (
                  <article
                    key={c.id}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                          {upperCert(c.courseName)}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Emitido em {formatDate(c.completionDate)}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Ativo
                      </span>
                    </div>

                    <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-[11px]">
                      <span className="text-gray-500">Código: </span>
                      <span className="font-mono font-semibold text-[var(--color-pmb-green-900)]">
                        {upperCert(c.code)}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      <Link
                        href={`/aluno/certificados/${c.id}`}
                        className="rounded-md bg-[var(--color-pmb-green)] px-3 py-1.5 font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
                      >
                        Visualizar
                      </Link>
                      <a
                        href={`/api/student/certificates/${c.id}/download`}
                        className="rounded-md border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Baixar PDF
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {revogados.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Revogados ({revogados.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {revogados.map((c) => (
                  <article
                    key={c.id}
                    className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-rose-900">
                          {upperCert(c.courseName)}
                        </h3>
                        <p className="mt-1 text-xs text-rose-700">
                          Revogado em{" "}
                          {c.revokedAt ? formatDate(c.revokedAt) : "—"}
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        Revogado
                      </span>
                    </div>
                    {c.revokedReason && (
                      <p className="mt-3 text-xs text-rose-800">
                        Motivo: {c.revokedReason}
                      </p>
                    )}
                    <div className="mt-3 text-[11px] text-rose-700/80">
                      Código: <span className="font-mono">{upperCert(c.code)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
