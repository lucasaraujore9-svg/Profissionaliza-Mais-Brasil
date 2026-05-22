import Image from "next/image"
import { prisma } from "@/lib/prisma"
import { PMB_TENANT_NAME } from "@/lib/pmb-config"

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

interface Props {
  params: Promise<{ code: string }>
}

export const dynamic = "force-dynamic"

export default async function ValidateCertificatePage({ params }: Props) {
  const { code } = await params
  const normalizedCode = (code ?? "").trim().toUpperCase()

  const cert = normalizedCode
    ? await prisma.certificate.findUnique({
        where: { code: normalizedCode },
        include: {
          tenant: { select: { name: true, logoUrl: true } },
        },
      })
    : null

  if (!cert) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="rounded-3xl border border-rose-100 bg-white p-10 shadow-sm">
            <h1 className="font-display text-3xl text-rose-900">
              Certificado não encontrado
            </h1>
            <p className="mt-3 text-sm text-gray-600">
              Nenhum certificado encontrado com o código{" "}
              <span className="font-mono font-semibold text-gray-900">
                {normalizedCode || "—"}
              </span>
              . Verifique o código e tente novamente.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const unidade = cert.tenant?.name ?? PMB_TENANT_NAME
  const isRevoked = cert.revokedAt !== null

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
              Validação de certificado
            </p>
            <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
              Profissionaliza Mais Brasil
            </h1>
          </div>
          {cert.tenant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cert.tenant.logoUrl}
              alt={unidade}
              className="h-12 w-auto object-contain"
            />
          ) : (
            <Image
              src="/images/logo.png"
              alt="Profissionaliza Mais Brasil"
              width={120}
              height={48}
              className="h-12 w-auto object-contain"
            />
          )}
        </header>

        {isRevoked && (
          <div className="mb-6 rounded-3xl border-2 border-rose-300 bg-rose-50 p-6 text-rose-900 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-rose-700">
              Atenção
            </p>
            <h2 className="mt-1 font-display text-2xl">
              Certificado REVOGADO
            </h2>
            {cert.revokedAt && (
              <p className="mt-2 text-sm">
                Revogado em <strong>{formatDate(cert.revokedAt)}</strong>.
              </p>
            )}
            {cert.revokedReason && (
              <p className="mt-1 text-sm">
                Motivo: <strong>{cert.revokedReason}</strong>
              </p>
            )}
            <p className="mt-3 text-sm text-rose-800">
              Os dados abaixo são apenas para referência histórica e não
              configuram comprovação válida de conclusão.
            </p>
          </div>
        )}

        <section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          {!isRevoked && (
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Certificado válido
            </div>
          )}

          <h2 className="text-xs uppercase tracking-wide text-gray-500">
            Emitido por
          </h2>
          <p className="mt-1 text-lg font-semibold text-gray-900">{unidade}</p>

          <hr className="my-6 border-gray-100" />

          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">
                Aluno(a)
              </dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--color-pmb-green-900)]">
                {cert.studentName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">
                Curso
              </dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">
                {cert.courseName}
              </dd>
            </div>
            {cert.cargaHoraria && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">
                  Carga horária
                </dt>
                <dd className="mt-1 text-base font-semibold text-gray-900">
                  {cert.cargaHoraria}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">
                Data de conclusão
              </dt>
              <dd className="mt-1 text-base font-semibold text-gray-900">
                {formatDate(cert.completionDate)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-gray-500">
                Código de validação
              </dt>
              <dd className="mt-1 font-mono text-lg font-semibold text-[var(--color-pmb-green-900)]">
                {cert.code}
              </dd>
            </div>
          </dl>

          <hr className="my-6 border-gray-100" />

          <p className="text-xs text-gray-500">
            Esta página comprova a existência e os dados do certificado de
            código <span className="font-mono">{cert.code}</span> em nossos
            registros. Para verificar autenticidade adicional, contate{" "}
            {unidade}.
          </p>
        </section>
      </div>
    </main>
  )
}
