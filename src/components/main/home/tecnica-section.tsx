import Link from "next/link"
import { ArrowRight, ArrowUpRight, ShieldCheck } from "lucide-react"
import type { TecnicaCourse } from "@/lib/catalog/tecnica"
import { tecnicaRedirectHref } from "@/lib/catalog/tecnica-redirect"

interface TecnicaSectionProps {
  label: string
  courses?: TecnicaCourse[]
  fallbackUrl?: string | null
}

/**
 * Seção "Cursos Técnicos" da home — bloco de destaque em alto contraste
 * (gradiente verde profundo com glow dourado) usando tipografia black.
 *
 * Cada card e o CTA "Conhecer todos" abrem em nova guia na tela interna
 * de loading (/cursos-tecnicos/ir), que valida e redireciona para o
 * site externo da Escola Técnica parceira.
 *
 * NÃO mostramos duração nem numeração ordinal nos cards — a Escola Técnica
 * tem 40+ cursos com tempos diferentes, qualquer rótulo fixo seria
 * impreciso. Mantemos apenas o selo "MEC" como signo de credibilidade.
 */
export function TecnicaSection({
  label: _label,
  courses = [],
  fallbackUrl,
}: TecnicaSectionProps) {
  const visibleCourses = courses.slice(0, 8)
  if (visibleCourses.length === 0) return null

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#013d10] via-[var(--color-pmb-green,#025918)] to-[#013d10] p-6 shadow-[0_30px_60px_-30px_rgba(2,89,24,0.5)] sm:p-8 md:p-12">
          {/* Glow decorativo dourado (canto direito superior) */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--color-pmb-gold,#F2B705)] opacity-25 blur-3xl"
          />
          {/* Glow decorativo lime (canto esquerdo inferior) */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-20 -bottom-24 h-72 w-72 rounded-full bg-[var(--color-pmb-lime,#C0D904)] opacity-20 blur-3xl"
          />

          <div className="relative">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-[640px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-pmb-gold,#F2B705)] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#013d10]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Reconhecido pelo MEC
                </span>
                <h2 className="mt-4 text-[28px] font-black leading-[1.05] tracking-tight text-white sm:text-[34px] md:text-[42px]">
                  Sua{" "}
                  <span className="bg-gradient-to-r from-[var(--color-pmb-gold,#F2B705)] to-[var(--color-pmb-lime,#C0D904)] bg-clip-text text-transparent">
                    carreira técnica
                  </span>
                  <br />
                  começa aqui.
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-white/75 md:text-[15px]">
                  Mais de 40 cursos técnicos pela nossa escola parceira — uma
                  das maiores do país, com diploma do MEC e mercado real
                  esperando por você.
                </p>
              </div>

              {/* CTA "Conhecer todos" — abre direto a tela de loading */}
              <Link
                href={tecnicaRedirectHref(null, fallbackUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-[var(--color-pmb-gold,#F2B705)] px-5 py-3 text-[14px] font-black text-[#013d10] transition hover:bg-white md:self-end"
              >
                Conhecer todos
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>

            {/* Grade de cursos — sem número, sem duração */}
            <ul className="mt-7 grid grid-cols-2 gap-3 md:mt-9 md:grid-cols-3 lg:grid-cols-4">
              {visibleCourses.map((course) => (
                <li key={course.name}>
                  <Link
                    href={tecnicaRedirectHref(
                      course.name,
                      course.url || fallbackUrl,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex h-full min-h-[120px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[var(--color-pmb-gold,#F2B705)]/60 hover:bg-white/[0.08] sm:p-5"
                  >
                    {/* Topo: selo MEC discreto + arrow */}
                    <div className="flex items-start justify-between">
                      <span className="text-[10.5px] font-black uppercase tracking-widest text-[var(--color-pmb-lime,#C0D904)]/90">
                        MEC
                      </span>
                      <ArrowUpRight
                        className="h-4 w-4 text-white/40 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--color-pmb-gold,#F2B705)]"
                        aria-hidden
                      />
                    </div>

                    {/* Nome do curso — protagonista do card */}
                    <h3 className="mt-3 line-clamp-3 text-[15px] font-bold leading-snug text-white sm:text-[16px]">
                      {course.name}
                    </h3>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
