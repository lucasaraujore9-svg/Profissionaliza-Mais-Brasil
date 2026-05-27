import Link from "next/link"
import { ArrowRight, GraduationCap } from "lucide-react"
import type { TecnicaCourse } from "@/lib/catalog/tecnica"
import { tecnicaRedirectHref } from "@/lib/catalog/tecnica-redirect"

interface TecnicaSectionProps {
  label: string
  courses?: TecnicaCourse[]
  fallbackUrl?: string | null
}

/**
 * Seção "Cursos Técnicos" da home — estilo limpo, igual aos demais
 * CourseRows. Cada card leva para a página interna de redirecionamento
 * /cursos-tecnicos/ir, que valida e encaminha para o site da Escola
 * Técnica parceira.
 *
 * Se não houver cursos cadastrados, a seção não renderiza (preferimos
 * silêncio a um placeholder vazio quando o operador ainda não populou).
 */
export function TecnicaSection({
  label,
  courses = [],
  fallbackUrl,
}: TecnicaSectionProps) {
  const visibleCourses = courses.slice(0, 8)
  if (visibleCourses.length === 0) return null

  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        {/* Cabeçalho enxuto, no mesmo formato dos outros CourseRows */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-pmb-lime)]/40 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-widest text-[var(--color-pmb-green)]">
              Reconhecido pelo MEC
            </span>
            <h2 className="mt-2 text-[22px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[28px]">
              {label || "Cursos técnicos"}
            </h2>
            <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[rgba(2,89,24,0.7)]">
              Diploma de técnico em apenas 7 meses e mercado pronto te esperando.
            </p>
          </div>
          <Link
            href="/cursos-tecnicos"
            className="shrink-0 text-[13.5px] font-bold text-[var(--color-pmb-green)] hover:underline"
          >
            Ver todos →
          </Link>
        </div>

        {/* Grid de cards limpos */}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleCourses.map((course) => (
            <li key={course.name}>
              <Link
                href={tecnicaRedirectHref(course.name, course.url || fallbackUrl)}
                className="group flex h-full flex-col rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-3 transition hover:-translate-y-0.5 hover:border-[var(--color-pmb-green)] hover:shadow-md"
              >
                <div className="grid aspect-[4/3] place-items-center rounded-lg bg-[var(--color-pmb-lime-50)]">
                  <GraduationCap
                    className="h-9 w-9 text-[var(--color-pmb-green)] opacity-80"
                    strokeWidth={1.6}
                    aria-hidden
                  />
                </div>
                <h3 className="mt-3 line-clamp-2 text-[14px] font-bold leading-snug text-[var(--color-pmb-green-900)]">
                  {course.name}
                </h3>
                <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-zinc-500">
                  Técnico · MEC
                  <ArrowRight
                    className="ml-auto h-3.5 w-3.5 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-pmb-green)]"
                    aria-hidden
                  />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
