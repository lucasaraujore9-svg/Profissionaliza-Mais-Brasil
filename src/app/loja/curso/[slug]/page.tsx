import { Breadcrumb } from "@/components/loja/breadcrumb"
import { CourseHero } from "@/components/loja/course-hero"
import { PriceDisplay } from "@/components/loja/price-display"
import { CourseDescription } from "@/components/loja/course-description"
import { LessonAccordion } from "@/components/loja/lesson-accordion"
import { CourseStats } from "@/components/loja/course-stats"
import { StickyCTA } from "@/components/loja/sticky-cta"

export default function CoursePage() {
  const preco = "R$ 197,00"
  const parcelas = "3x de R$ 65,67"

  return (
    <>
      <section className="bg-white py-6 md:py-8">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Breadcrumb
            items={[
              { label: "Cursos", href: "/loja" },
              { label: "Tecnologia", href: "/loja?cat=tecnologia" },
              { label: "Excel Avançado — Do Zero ao PROCV" },
            ]}
          />
        </div>
      </section>

      <section className="bg-white pb-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <CourseHero
            categoria="Tecnologia"
            nome="Excel Avançado — Do Zero ao PROCV"
            tagline="Domine o Excel de ponta a ponta: fórmulas avançadas, tabelas dinâmicas, macros e automação com VBA."
            rating={4.9}
            ratingCount={1240}
            alunos="12.4k"
            horas="120h"
            gradient="from-green-600 to-emerald-800"
          />
        </div>
      </section>

      <section className="bg-[#FAFAFA] py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px] lg:gap-12">
            <div className="space-y-12">
              <CourseStats />
              <CourseDescription />
              <LessonAccordion />
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <PriceDisplay
                precoOriginal="R$ 297,00"
                preco={preco}
                parcelas={parcelas}
              />
            </aside>
          </div>
        </div>
      </section>

      <div className="pb-20 lg:pb-0" />
      <StickyCTA preco={preco} parcelas={parcelas} />
    </>
  )
}
