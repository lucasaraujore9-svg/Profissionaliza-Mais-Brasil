import Link from "next/link"
import { ArrowRight, Building2, GraduationCap, ArrowLeft } from "lucide-react"
import type { TecnicaCourse } from "@/lib/catalog/tecnica"

interface TecnicaCoursesListProps {
  label: string
  url: string
  courses: TecnicaCourse[]
  tenantName?: string
}

export function TecnicaCoursesList({
  label,
  url,
  courses,
  tenantName,
}: TecnicaCoursesListProps) {
  return (
    <main className="min-h-[60vh] bg-[var(--color-pmb-mist)]">
      <div className="mx-auto max-w-[1080px] px-4 py-12 md:px-6 md:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--color-pmb-green-900)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar para a home
        </Link>

        <header className="mt-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-pmb-green)]/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-green-900)]">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            Unidade Técnica
          </span>
          <h1 className="mt-3 text-[28px] font-black leading-tight text-[var(--color-pmb-green-900)] md:text-[40px]">
            {label}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-gray-700">
            {tenantName
              ? `Cursos técnicos oferecidos pela escola parceira de ${tenantName}.`
              : "Cursos técnicos da nossa escola parceira. Clique no curso desejado para conhecer mais."}
          </p>
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {courses.map((course) => (
            <a
              key={course.name}
              href={course.url || url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[var(--color-pmb-green)] hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                  <GraduationCap className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold leading-snug text-[var(--color-pmb-green-900)]">
                    {course.name}
                  </h2>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    Conheça o curso na escola técnica
                  </p>
                </div>
              </div>
              <ArrowRight
                className="h-5 w-5 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-pmb-green)]"
                aria-hidden
              />
            </a>
          ))}
        </section>

        <div className="mt-8 rounded-xl border border-[var(--color-pmb-green)]/15 bg-white p-5 text-center">
          <p className="text-[14px] text-gray-700">
            Quer ver todos os cursos disponíveis?
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-5 py-3 text-[14px] font-black text-white transition hover:bg-[var(--color-pmb-green-700)]"
          >
            Visitar escola técnica
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </main>
  )
}
