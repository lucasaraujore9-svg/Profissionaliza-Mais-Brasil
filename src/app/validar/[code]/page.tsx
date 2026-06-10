import Image from "next/image"
import Link from "next/link"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { PMB_TENANT_NAME } from "@/lib/pmb-config"
import { rateLimitByKey, RATE_LIMITS } from "@/lib/ratelimit"
import {
  createSignedCertificateUrl,
  extractCertificatePath,
} from "@/lib/certificates/storage"
import { ensureFreshCertificatePdf } from "@/lib/certificates/freshness"
import { swallow } from "@/lib/errors"
import { upperCert } from "@/lib/certificates/text"

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function formatDateShort(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

interface Props {
  params: Promise<{ code: string }>
}

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Validar certificado",
  description:
    "Verifique a autenticidade de um certificado emitido pela Profissionaliza Mais Brasil.",
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--color-pmb-mist)]">
      <header className="border-b border-black/5 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/logo.png"
              alt="Profissionaliza Mais Brasil"
              width={140}
              height={48}
              priority
              className="h-9 w-auto object-contain"
            />
            <span className="sr-only">Profissionaliza Mais Brasil</span>
          </Link>
          <span className="hidden text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-pmb-green-900)]/70 sm:inline">
            Validação de certificado
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:py-16">
        {children}
      </div>

      <footer className="border-t border-black/5 bg-white/60">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center text-xs text-gray-500">
          Página oficial de verificação ·{" "}
          <Link
            href="/"
            className="font-semibold text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
          >
            profissionalizamaisbrasil.com.br
          </Link>
        </div>
      </footer>
    </main>
  )
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx="11"
        cy="11"
        r="7"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default async function ValidateCertificatePage({ params }: Props) {
  const { code } = await params
  const normalizedCode = (code ?? "").trim().toUpperCase()

  // Rate limit por IP para mitigar enumeration de códigos de certificado.
  const hdrs = await headers()
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "anon"
  const rl = await rateLimitByKey(ip, RATE_LIMITS.certificateValidate)
  if (!rl.ok) {
    return (
      <PageShell>
        <section className="overflow-hidden rounded-3xl border border-amber-200/70 bg-white shadow-sm">
          <div className="flex items-center gap-4 bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-5 text-white sm:px-8">
            <h1 className="font-display text-2xl sm:text-3xl">
              Muitas tentativas
            </h1>
          </div>
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-base text-gray-700">
              Aguarde alguns segundos e tente novamente.
            </p>
          </div>
        </section>
      </PageShell>
    )
  }

  const cert = normalizedCode
    ? await prisma.certificate.findUnique({
        where: { code: normalizedCode },
        include: {
          tenant: { select: { name: true, logoUrl: true, slug: true } },
        },
      })
    : null

  if (!cert) {
    return (
      <PageShell>
        <section className="overflow-hidden rounded-3xl border border-rose-200/70 bg-white shadow-sm">
          <div className="flex items-center gap-4 bg-gradient-to-r from-rose-500 to-rose-600 px-6 py-5 text-white sm:px-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              <SearchIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                Não encontrado
              </p>
              <h1 className="font-display text-2xl sm:text-3xl">
                Certificado não localizado
              </h1>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-base text-gray-700">
              O código informado não corresponde a nenhum certificado emitido
              em nossos registros.
            </p>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Código pesquisado
              </p>
              <p className="mt-1 break-all font-mono text-base font-semibold text-gray-900">
                {normalizedCode || "—"}
              </p>
            </div>

            <ul className="mt-6 space-y-2 text-sm text-gray-600">
              <li>
                <span className="font-semibold text-gray-800">·</span> Confira
                se digitou o código corretamente (sem espaços extras).
              </li>
              <li>
                <span className="font-semibold text-gray-800">·</span> O código
                aparece no rodapé do certificado e no QR code.
              </li>
              <li>
                <span className="font-semibold text-gray-800">·</span> Em caso
                de dúvida, contate a unidade emissora do certificado.
              </li>
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/validar"
                className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 transition hover:border-gray-400 hover:bg-gray-50"
              >
                Tentar outro código
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-pmb-green)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-pmb-green-700)]"
              >
                Voltar ao site
              </Link>
            </div>
          </div>
        </section>
      </PageShell>
    )
  }

  const unidade = upperCert(cert.tenant?.name ?? PMB_TENANT_NAME)
  const isRevoked = cert.revokedAt !== null
  const logoSrc = cert.tenant?.logoUrl ?? null

  // Link de download via signed URL de curta duração (não expõe a URL pública
  // permanente). Funciona com bucket público ou privado — pré-requisito para
  // tornar o bucket privado (issue 100/R1). Fallback para a URL armazenada.
  // O PDF é regenerado on-demand se o template/branding mudou depois da última
  // geração (no máximo uma regeneração por mudança; a página é rate-limited).
  let pdfDownloadUrl: string | null = cert.pdfUrl
  if (!isRevoked) {
    const freshUrl = await ensureFreshCertificatePdf(cert).catch(
      swallow("validar.pdf_refresh"),
    )
    const effectiveUrl = freshUrl ?? cert.pdfUrl
    pdfDownloadUrl = effectiveUrl
    const path = extractCertificatePath(effectiveUrl)
    if (path) {
      const signed = await createSignedCertificateUrl(path, 300).catch(
        swallow("validar.sign_url"),
      )
      if (signed) pdfDownloadUrl = signed
    }
  }

  return (
    <PageShell>
      {/* Banner principal de status */}
      <section
        className={`overflow-hidden rounded-3xl border shadow-sm ${
          isRevoked
            ? "border-rose-200/70 bg-white"
            : "border-emerald-200/70 bg-white"
        }`}
      >
        <div
          className={`flex items-center gap-4 px-6 py-5 text-white sm:px-8 ${
            isRevoked
              ? "bg-gradient-to-r from-rose-500 to-rose-600"
              : "bg-gradient-to-r from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)]"
          }`}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur">
            {isRevoked ? (
              <XIcon className="h-6 w-6" />
            ) : (
              <CheckIcon className="h-6 w-6" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
              {isRevoked ? "Atenção" : "Autenticado"}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl">
              {isRevoked ? "Certificado revogado" : "Certificado válido"}
            </h1>
          </div>
        </div>

        <div className="px-6 py-8 sm:px-8 sm:py-10">
          {/* Aviso de revogação */}
          {isRevoked && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
              <p>
                Este certificado foi <strong>revogado</strong>
                {cert.revokedAt ? (
                  <>
                    {" "}em <strong>{formatDate(cert.revokedAt)}</strong>
                  </>
                ) : null}
                {cert.revokedReason ? (
                  <>
                    . Motivo: <strong>{cert.revokedReason}</strong>
                  </>
                ) : (
                  "."
                )}
              </p>
              <p className="mt-2 text-rose-800">
                Os dados abaixo são exibidos apenas para referência e{" "}
                <strong>não configuram</strong> comprovação válida de conclusão.
              </p>
            </div>
          )}

          {/* Cabeçalho do emissor */}
          <div className="flex flex-col items-start gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Emitido por
              </p>
              <p
                className={`mt-1 font-display text-xl ${
                  isRevoked
                    ? "text-gray-500"
                    : "text-[var(--color-pmb-green-900)]"
                }`}
              >
                {unidade}
              </p>
            </div>
            <div className="flex h-14 items-center">
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoSrc}
                  alt={unidade}
                  className={`max-h-14 w-auto object-contain ${
                    isRevoked ? "opacity-50 grayscale" : ""
                  }`}
                />
              ) : (
                <Image
                  src="/images/logo.png"
                  alt={unidade}
                  width={140}
                  height={48}
                  className={`h-12 w-auto object-contain ${
                    isRevoked ? "opacity-50 grayscale" : ""
                  }`}
                />
              )}
            </div>
          </div>

          {/* Dados do certificado */}
          <dl
            className={`mt-6 grid gap-6 sm:grid-cols-2 ${
              isRevoked ? "text-gray-500" : "text-gray-900"
            }`}
          >
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Aluno(a)
              </dt>
              <dd
                className={`mt-1 font-display text-2xl sm:text-3xl ${
                  isRevoked
                    ? "text-gray-500 line-through decoration-rose-300/70"
                    : "text-[var(--color-pmb-green-900)]"
                }`}
              >
                {upperCert(cert.studentName)}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Curso concluído
              </dt>
              <dd
                className={`mt-1 text-lg font-semibold ${
                  isRevoked ? "text-gray-500" : "text-gray-900"
                }`}
              >
                {upperCert(cert.courseName)}
              </dd>
            </div>

            {cert.cargaHoraria && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Carga horária
                </dt>
                <dd
                  className={`mt-1 text-base font-semibold ${
                    isRevoked ? "text-gray-500" : "text-gray-900"
                  }`}
                >
                  {upperCert(cert.cargaHoraria)}
                </dd>
              </div>
            )}

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Data de conclusão
              </dt>
              <dd
                className={`mt-1 text-base font-semibold ${
                  isRevoked ? "text-gray-500" : "text-gray-900"
                }`}
              >
                {upperCert(formatDate(cert.completionDate))}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Código de validação
              </dt>
              <dd className="mt-1 inline-flex max-w-full items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-base font-semibold tracking-wider text-[var(--color-pmb-green-900)]">
                <span className="truncate">{upperCert(cert.code)}</span>
              </dd>
            </div>
          </dl>

          {/* Ações + nota */}
          <div className="mt-8 flex flex-col gap-4 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              {isRevoked ? (
                <>
                  Registro emitido originalmente em{" "}
                  <strong>{formatDateShort(cert.createdAt)}</strong> e revogado
                  posteriormente.
                </>
              ) : (
                <>
                  Esta página confirma a autenticidade do certificado emitido
                  em{" "}
                  <strong>{formatDateShort(cert.createdAt)}</strong>.
                </>
              )}
            </p>
            {!isRevoked && pdfDownloadUrl && (
              <a
                href={pdfDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-pmb-green)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-pmb-green-700)]"
              >
                <DownloadIcon className="h-4 w-4" />
                Baixar PDF
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Card secundário com explicação */}
      <section className="rounded-2xl border border-black/5 bg-white/80 px-6 py-5 text-sm text-gray-600 shadow-sm">
        <p>
          <strong className="text-[var(--color-pmb-green-900)]">
            Como funciona a validação?
          </strong>{" "}
          Cada certificado emitido pela Profissionaliza Mais Brasil recebe um
          código único e um QR code que apontam para esta página. Se os dados
          exibidos aqui conferem com os do documento físico ou digital, o
          certificado é autêntico.
        </p>
      </section>
    </PageShell>
  )
}
