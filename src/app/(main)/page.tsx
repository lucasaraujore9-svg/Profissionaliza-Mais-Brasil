import { HeroBanner } from "@/components/main/home/hero-banner"
import { TrustBar } from "@/components/main/home/trust-bar"
import { CourseRow } from "@/components/main/home/course-row"
import { CategoriesGrid } from "@/components/main/home/categories-grid"
import { LearnAnywhere } from "@/components/main/home/learn-anywhere"
import { Testimonials } from "@/components/main/home/testimonials"
import { FinalCta } from "@/components/main/home/final-cta"
import { MAIS_VENDIDOS, SAUDE, CONSTRUCAO, BELEZA } from "@/components/main/home/courses-data"

export default function LandingPage() {
  return (
    <>
      <HeroBanner />
      <TrustBar />
      <CourseRow
        titulo="Os cursos mais vendidos da semana"
        subtitulo="O que o pessoal está comprando agora pra começar a faturar"
        cursos={MAIS_VENDIDOS}
      />
      <CategoriesGrid />
      <CourseRow
        titulo="Saúde e Bem-estar"
        subtitulo="Profissões com alta procura no Brasil inteiro"
        verTodosHref="/categoria/saude"
        cursos={SAUDE}
      />
      <LearnAnywhere />
      <CourseRow
        titulo="Construção e Reforma"
        subtitulo="Aprenda uma profissão que dá dinheiro de verdade"
        verTodosHref="/categoria/construcao"
        cursos={CONSTRUCAO}
      />
      <CourseRow
        titulo="Beleza e Estética"
        subtitulo="Monte sua clientela e trabalhe de onde estiver"
        verTodosHref="/categoria/beleza"
        cursos={BELEZA}
      />
      <Testimonials />
      <FinalCta />
    </>
  )
}
