import { HeroBanner } from "@/components/main/home/hero-banner"
import { TrustBar } from "@/components/main/home/trust-bar"
import { CourseRow } from "@/components/main/home/course-row"
import { CategoriesGrid } from "@/components/main/home/categories-grid"
import { LearnAnywhere } from "@/components/main/home/learn-anywhere"
import { Testimonials } from "@/components/main/home/testimonials"
import { FinalCta } from "@/components/main/home/final-cta"
import {
  loadCurated,
  loadByCategoria,
  loadShowcase,
  loadCategorias,
} from "@/lib/catalog/home"

export default async function LandingPage() {
  const [
    showcase,
    curated,
    informatica,
    administrativo,
    diversas,
    categorias,
  ] = await Promise.all([
    loadShowcase(),
    loadCurated(),
    loadByCategoria("informatica"),
    loadByCategoria("administrativo"),
    loadByCategoria("diversas"),
    loadCategorias(),
  ])

  return (
    <>
      <HeroBanner showcase={showcase} />
      <TrustBar />
      {curated.length > 0 && (
        <CourseRow
          titulo="Os cursos mais vendidos da semana"
          subtitulo="O que o pessoal está comprando agora pra começar a faturar"
          cursos={curated}
        />
      )}
      <CategoriesGrid categorias={categorias} />
      {informatica.length > 0 && (
        <CourseRow
          titulo="Informática e Tecnologia"
          subtitulo="Profissões em alta no mercado digital"
          verTodosHref="/cursos?categoria=informatica"
          cursos={informatica}
        />
      )}
      <LearnAnywhere />
      {administrativo.length > 0 && (
        <CourseRow
          titulo="Administrativo"
          subtitulo="Da rotina ao planejamento — capacite-se pra qualquer empresa"
          verTodosHref="/cursos?categoria=administrativo"
          cursos={administrativo}
        />
      )}
      {diversas.length > 0 && (
        <CourseRow
          titulo="Diversas áreas"
          subtitulo="Beleza, saúde, segurança do trabalho e muito mais"
          verTodosHref="/cursos?categoria=diversas"
          cursos={diversas}
        />
      )}
      <Testimonials />
      <FinalCta />
    </>
  )
}
