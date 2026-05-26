import Link from "next/link"
import { Building2, ArrowRight, GraduationCap, BadgeCheck } from "lucide-react"
import type { TecnicaCourse } from "@/lib/catalog/tecnica"

interface TecnicaSectionProps {
  label: string
  courses?: TecnicaCourse[]
  fallbackUrl?: string | null
}

export function TecnicaSection({
  label,
  courses = [],
  fallbackUrl,
}: TecnicaSectionProps) {
  const visibleCourses = courses.slice(0, 8)

  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6 md:py-12">
        <div className="relative overflow-hidden rounded-2xl bg-[var(--color-pmb-green)] p-6 text-white md:p-10">
          <div
            className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-[var(--color-pmb-gold)] opacity-25 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--color-pmb-lime)] opacity-25 blur-3xl"
            aria-hidden
          />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Unidade Técnica
            </span>
            <h2 className="mt-3 text-[24px] font-black leading-tight md:text-[32px]">
              {label}
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-white/80 md:text-[15px]">
              Já pensou em seguir uma carreira técnica? Conheça os cursos da
              nossa escola técnica parceira e dê o próximo passo na sua
              jornada profissional.
            </p>

            <ul className="mt-5 grid max-w-xl gap-2 text-[13px] text-white/90 md:grid-cols-2">
              <li className="flex items-center gap-2">
                <BadgeCheck
                  className="h-4 w-4 text-[var(--color-pmb-gold)]"
                  aria-hidden
                />
                Certificação reconhecida
              </li>
              <li className="flex items-center gap-2">
                <GraduationCap
                  className="h-4 w-4 text-[var(--color-pmb-gold)]"
                  aria-hidden
                />
                Mercado de trabalho real
              </li>
            </ul>

            {visibleCourses.length > 0 && (
              <div className="mt-6">
                <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
                  Cursos técnicos disponíveis
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
                  {visibleCourses.map((course) => (
                    <a
                      key={course.name}
                      href={course.url || fallbackUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/[0.06] px-4 py-3 text-[14px] font-semibold text-white transition hover:border-[var(--color-pmb-gold)] hover:bg-white/[0.12]"
                    >
                      <span className="flex items-center gap-2">
                        <GraduationCap
                          className="h-4 w-4 shrink-0 text-[var(--color-pmb-gold)]"
                          aria-hidden
                        />
                        <span className="line-clamp-1">{course.name}</span>
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-white/60 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-pmb-gold)]"
                        aria-hidden
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <Link
              href="/cursos-tecnicos"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)] transition hover:bg-[var(--color-pmb-gold-600)]"
            >
              Conhecer todos os cursos técnicos
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
