import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, BookOpen, Check, Layers } from "lucide-react"
import { shouldUnoptimizeImage } from "@/lib/images"
import type { VitrinePackageDetail } from "@/lib/packages/vitrine"

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

interface PackageDetailViewProps {
  pkg: VitrinePackageDetail
  ctaHref: string
  ctaLabel: string
  backHref: string
  backLabel: string
}

export function PackageDetailView({
  pkg,
  ctaHref,
  ctaLabel,
  backHref,
  backLabel,
}: PackageDetailViewProps) {
  return (
    <section className="bg-[#FAFAFA] py-8 md:py-12">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-pmb-green-700)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="relative aspect-[16/7] w-full overflow-hidden bg-gradient-to-br from-[var(--color-pmb-lime-50)] to-[var(--color-pmb-mist)]">
                {/* Spacer em fluxo garante a altura 16:7 da capa em engines
                    antigos (iOS Safari ≤14) onde aspect-ratio colapsa sem
                    conteudo em fluxo. */}
                <div aria-hidden className="pt-[43.75%]" />
                {pkg.coverImageUrl ? (
                  <Image
                    src={pkg.coverImageUrl}
                    alt={pkg.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 800px"
                    className="object-cover"
                    unoptimized={shouldUnoptimizeImage(pkg.coverImageUrl)}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--color-pmb-green)]">
                    <Layers className="h-14 w-14" aria-hidden />
                  </div>
                )}
              </div>
              <div className="p-6 lg:p-8">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-lime-50)] px-3 py-1 text-xs font-bold text-[var(--color-pmb-green-700)]">
                  <Layers className="h-3.5 w-3.5" /> Pacote • {pkg.courseCount}{" "}
                  {pkg.courseCount === 1 ? "curso" : "cursos"}
                </span>
                <h1 className="mt-3 text-2xl font-black leading-tight text-[var(--color-pmb-green-900)] md:text-3xl">
                  {pkg.name}
                </h1>
                {pkg.description && (
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                    {pkg.description}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-pmb-green-900)]">
                <BookOpen className="h-5 w-5 text-[var(--color-pmb-green)]" />
                Cursos inclusos neste pacote
              </h2>
              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pkg.courses.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-[#FAFAFA] p-3"
                  >
                    {c.coverImageUrl ? (
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-[rgba(2,89,24,0.08)]">
                        <Image
                          src={c.coverImageUrl}
                          alt={c.nome}
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized={shouldUnoptimizeImage(c.coverImageUrl)}
                        />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                        <Check className="h-5 w-5" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--color-pmb-green-900)]">
                        {c.nome}
                      </div>
                      <div className="text-xs text-gray-500">
                        {c.cargaHoraria ? `${c.cargaHoraria} • ` : ""}
                        {c.qtdAulas} aulas
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
              <div className="text-xs font-medium text-gray-500">Pacote completo</div>
              <div className="mt-1 font-mono text-3xl font-bold text-[var(--color-pmb-green-900)]">
                {formatBRL(pkg.price)}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Acesso a {pkg.courseCount} {pkg.courseCount === 1 ? "curso" : "cursos"} por um
                valor único.
              </p>
              <Link
                href={ctaHref}
                className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-pmb-green)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
              >
                {ctaLabel}
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
