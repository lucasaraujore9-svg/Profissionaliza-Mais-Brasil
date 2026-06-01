import Link from "next/link"
import { Clock, Award } from "lucide-react"
import { CourseThumb } from "./course-thumb"

export interface Course {
  slug: string
  categoria: string
  titulo: string
  horas: string
  preco: string
  precoDe?: string
  parcelas: string
  /** MONTHLY exibe o preco como mensalidade recorrente (sufixo "/mês"). */
  paymentType?: "ONE_TIME" | "MONTHLY"
  selo?: "novo" | "mais-vendido" | "pix-10" | null
  accent: "gold" | "cyan" | "lime" | "green" | "terracotta"
  imageUrl?: string | null
}

interface CourseCardProps {
  course: Course
  /**
   * Base do link de detalhe. Site PMB usa "/cursos" (rota `(main)/cursos/[slug]`);
   * a vitrine do revendedor usa "/curso" (rota `loja/curso/[slug]`), que respeita
   * o tenant e os precos da unidade. Sem isso, os cards da vitrine apontavam para
   * o detalhe global da PMB.
   */
  hrefBase?: string
}

export function CourseCard({ course, hrefBase = "/cursos" }: CourseCardProps) {
  const {
    slug,
    categoria,
    titulo,
    horas,
    preco,
    precoDe,
    parcelas,
    paymentType,
    selo,
    accent,
    imageUrl,
  } = course
  const isMonthly = paymentType === "MONTHLY"

  return (
    <Link
      href={`${hrefBase}/${slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[rgba(2,89,24,0.08)] bg-white transition-all hover:-translate-y-0.5 hover:border-[rgba(2,89,24,0.2)] hover:shadow-[0_10px_30px_-12px_rgba(2,89,24,0.25)]"
    >
      <div className="relative">
        <CourseThumb
          categoria={categoria}
          accent={accent}
          hours={horas}
          imageUrl={imageUrl}
          titulo={titulo}
        />
        {selo && (
          <span
            className={`absolute left-2.5 top-2.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider shadow-sm ${
              selo === "novo"
                ? "bg-[var(--color-pmb-cyan)] text-white"
                : selo === "mais-vendido"
                  ? "bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green)]"
                  : "bg-[var(--color-pmb-gold)] text-[var(--color-pmb-green)]"
            }`}
          >
            {selo === "novo"
              ? "Novo"
              : selo === "mais-vendido"
                ? "+ Vendido"
                : "10% no Pix"}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(2,89,24,0.55)]">
          {categoria}
        </p>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug text-[var(--color-pmb-green)] group-hover:underline decoration-[var(--color-pmb-gold)] underline-offset-4">
          {titulo}
        </h3>

        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[rgba(2,89,24,0.65)]">
          <li className="flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            {horas}
          </li>
          <li className="flex items-center gap-1">
            <Award className="h-3 w-3" aria-hidden />
            Certificado
          </li>
        </ul>

        <div className="mt-auto pt-3">
          {precoDe && (
            <p className="text-[11px] line-through text-[rgba(2,89,24,0.5)]">
              De {precoDe}
            </p>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] font-black text-[var(--color-pmb-green)]">
              {preco}
              {isMonthly && (
                <span className="text-[12px] font-bold text-[rgba(2,89,24,0.6)]">
                  /mês
                </span>
              )}
            </span>
            <span className="text-[11px] text-[rgba(2,89,24,0.65)]">
              {parcelas}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
