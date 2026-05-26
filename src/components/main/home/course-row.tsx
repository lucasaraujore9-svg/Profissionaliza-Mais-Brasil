import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { CourseCard, type Course } from "./course-card"

interface CourseRowProps {
  titulo: string
  subtitulo?: string
  verTodosHref?: string
  cursos: Course[]
}

export function CourseRow({ titulo, subtitulo, verTodosHref = "/cursos", cursos }: CourseRowProps) {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
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
          <Link
            href={verTodosHref}
            className="hidden shrink-0 items-center gap-1 text-[13px] font-bold text-[var(--color-pmb-cyan)] hover:underline md:inline-flex"
          >
            Ver todos os cursos
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {/* 2 linhas x 4 cursos = 8 cards no desktop. Limita a 8 para nao
            estourar a grade quando o caller passar mais itens. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {cursos.slice(0, 8).map((curso) => (
            <CourseCard key={curso.slug} course={curso} />
          ))}
        </div>

        <div className="mt-5 md:hidden">
          <Link
            href={verTodosHref}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-pmb-cyan)] hover:underline"
          >
            Ver todos os cursos
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
