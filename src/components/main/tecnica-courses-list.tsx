import Link from "next/link"
import { ArrowLeft, ArrowRight, GraduationCap, ShieldCheck } from "lucide-react"
import type { TecnicaCourse } from "@/lib/catalog/tecnica"
import { tecnicaRedirectHref } from "@/lib/catalog/tecnica-redirect"

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
      <div className="mx-auto max-w-[1080px] px-4 py-10 md:px-6 md:py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--color-pmb-green-900)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar para a home
        </Link>

        <header className="mt-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-pmb-lime)]/40 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-widest text-[var(--color-pmb-green)]">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            Reconhecido pelo MEC
          </span>
          <h1 className="mt-3 text-[28px] font-black leading-tight text-[var(--color-pmb-green-900)] md:text-[36px]">
            {label || "Cursos técnicos"}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[rgba(2,89,24,0.7)]">
            {tenantName
              ? `Cursos da escola técnica parceira de ${tenantName} — diploma reconhecido pelo MEC, formação a partir de 7 meses.`
              : "Diploma técnico reconhecido pelo MEC em até 7 meses, pela nossa escola técnica parceira. Escolha o curso e siga pra plataforma da escola."}
          </p>
        </header>

        {/* Grid limpo de cards técnicos */}
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {courses.map((course) => (
            <Link
              key={course.name}
              href={tecnicaRedirectHref(course.name, course.url || url)}
              className="group flex h-full flex-col rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-3 transition hover:-translate-y-0.5 hover:border-[var(--color-pmb-green)] hover:shadow-md"
            >
              <div className="grid aspect-[4/3] place-items-center rounded-lg bg-[var(--color-pmb-lime-50)]">
                <GraduationCap
                  className="h-9 w-9 text-[var(--color-pmb-green)] opacity-80"
                  strokeWidth={1.6}
                  aria-hidden
                />
              </div>
              <h2 className="mt-3 line-clamp-2 text-[14px] font-bold leading-snug text-[var(--color-pmb-green-900)]">
                {course.name}
              </h2>
              <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-zinc-500">
                Técnico · MEC
                <ArrowRight
                  className="ml-auto h-3.5 w-3.5 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-pmb-green)]"
                  aria-hidden
                />
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
