import Link from "next/link"
import Image from "next/image"
import { Layers, ArrowRight } from "lucide-react"
import { shouldUnoptimizeImage } from "@/lib/images"
import type { VitrinePackageCard } from "@/lib/packages/vitrine"

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

interface PackagesRowProps {
  titulo: string
  subtitulo?: string
  packages: VitrinePackageCard[]
  /** Base do link de detalhe: "/pacote" (revenda) ou "/pacotes" (PMB). */
  hrefBase: string
}

/**
 * Linha de cards de pacotes na home (vitrine PMB e revendas). Mesmo "DNA"
 * visual do CourseRow. Renderiza no máximo 8 cards.
 */
export function PackagesRow({ titulo, subtitulo, packages, hrefBase }: PackagesRowProps) {
  if (packages.length === 0) return null
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]">
      <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6 md:py-10">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[26px]">
              {titulo}
            </h2>
            {subtitulo && (
              <p className="mt-1 text-[13px] text-[rgba(2,89,24,0.65)] md:text-[14px]">
                {subtitulo}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {packages.slice(0, 8).map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} hrefBase={hrefBase} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PackageCard({ pkg, hrefBase }: { pkg: VitrinePackageCard; hrefBase: string }) {
  return (
    <Link
      href={`${hrefBase}/${pkg.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.10)] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[var(--color-pmb-lime-50)] to-[var(--color-pmb-mist)]">
        {/* Spacer em fluxo reserva a altura 16:9 a partir da largura mesmo em
            engines antigos (iOS Safari ≤14) onde aspect-ratio colapsa para 0
            quando todo o conteudo e position:absolute. */}
        <div aria-hidden className="pt-[56.25%]" />
        {pkg.coverImageUrl ? (
          <Image
            src={pkg.coverImageUrl}
            alt={pkg.name}
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized={shouldUnoptimizeImage(pkg.coverImageUrl)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--color-pmb-green)]">
            <Layers className="h-10 w-10" aria-hidden />
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-green)] px-2.5 py-1 text-[11px] font-bold text-white shadow">
          <Layers className="h-3 w-3" aria-hidden /> Pacote
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--color-pmb-green-900)]">
          {pkg.name}
        </h3>
        <p className="mt-1 text-[12px] text-[rgba(2,89,24,0.65)]">
          {pkg.courseCount} {pkg.courseCount === 1 ? "curso incluso" : "cursos inclusos"}
        </p>
        <div className="mt-auto pt-3">
          <div className="font-mono text-lg font-extrabold text-[var(--color-pmb-green-900)]">
            {formatBRL(pkg.price)}
          </div>
          <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-pmb-cyan)] group-hover:underline">
            Ver pacote <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  )
}
