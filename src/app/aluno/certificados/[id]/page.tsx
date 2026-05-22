import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { validationUrlFor } from "@/lib/certificates/generate-pdf"

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function StudentCertificateDetailPage({ params }: Props) {
  const session = await requireStudentSession()
  if (!session) return null

  const { id } = await params
  const cert = await prisma.certificate.findUnique({
    where: { id },
    include: {
      tenant: { select: { name: true } },
    },
  })
  if (!cert || cert.studentId !== session.studentId) {
    notFound()
  }

  const validationUrl = validationUrlFor(cert.code)
  const isRevoked = cert.revokedAt !== null
  const downloadUrl = `/api/student/certificates/${cert.id}/download`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/aluno/certificados"
          className="text-sm text-gray-500 hover:text-[var(--color-pmb-green)]"
        >
          ← Voltar para certificados
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          {cert.courseName}
        </h1>
        <p className="text-sm text-gray-600">
          Certificado emitido por{" "}
          <strong>
            {cert.tenant?.name ?? "Profissionaliza Mais Brasil"}
          </strong>
        </p>
      </header>

      {isRevoked && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
          <strong className="block text-base">
            Este certificado foi revogado
          </strong>
          {cert.revokedAt && (
            <p className="mt-1 text-rose-800">
              Revogado em {formatDate(cert.revokedAt)}.
            </p>
          )}
          {cert.revokedReason && (
            <p className="mt-1 text-rose-800">Motivo: {cert.revokedReason}</p>
          )}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Nome do aluno
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {cert.studentName}
            </dd>
          </div>
          {cert.studentCpf && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">
                CPF
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {cert.studentCpf}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Curso
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {cert.courseName}
            </dd>
          </div>
          {cert.cargaHoraria && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">
                Carga horária
              </dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {cert.cargaHoraria}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Data de conclusão
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {formatDate(cert.completionDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Código de validação
            </dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {cert.code}
            </dd>
          </div>
        </dl>

        <div className="mt-6 rounded-md bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <span className="font-semibold text-gray-800">
            URL pública de validação:
          </span>{" "}
          <a
            href={validationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-pmb-green)] hover:underline"
          >
            {validationUrl}
          </a>
        </div>

        {!isRevoked && (
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={downloadUrl}
              className="inline-flex items-center justify-center rounded-md bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              Baixar PDF
            </a>
            <a
              href={validationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Ver página de validação
            </a>
          </div>
        )}
      </section>
    </div>
  )
}
