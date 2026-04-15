import { HeroBanner } from "@/components/main/home/hero-banner"
import { TrustBar } from "@/components/main/home/trust-bar"
import { CourseRow } from "@/components/main/home/course-row"
import { CategoriesGrid } from "@/components/main/home/categories-grid"
import { LearnAnywhere } from "@/components/main/home/learn-anywhere"
import { Testimonials } from "@/components/main/home/testimonials"
import { FinalCta } from "@/components/main/home/final-cta"
import type { Course } from "@/components/main/home/course-card"
import { MAIS_VENDIDOS, SAUDE, CONSTRUCAO, BELEZA } from "@/components/main/home/courses-data"
import { prisma } from "@/lib/prisma"

async function loadCurated(): Promise<Course[]> {
  try {
    const rows = await prisma.course.findMany({
      where: { destaqueHome: true, status: "ATIVO" },
      orderBy: [{ ordemHome: "asc" }, { nome: "asc" }],
      take: 8,
    })
    if (rows.length === 0) return MAIS_VENDIDOS
    return rows.map((c, idx): Course => {
      const preco = c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal
      return {
        slug: c.slug,
        categoria: c.categoriaLoja ?? "Curso profissionalizante",
        titulo: c.nome,
        instrutor: "Equipe PMB",
        rating: "4.9",
        alunos: "—",
        horas: c.cargaHoraria ?? `${c.qtdAulas} aulas`,
        preco: preco ? `R$ ${Number(preco).toFixed(2).replace(".", ",")}` : "Consulte",
        parcelas: "12x sem juros",
        selo: idx === 0 ? "mais-vendido" : null,
        accent: idx % 2 === 0 ? "gold" : "green",
      }
    })
  } catch {
    return MAIS_VENDIDOS
  }
}

export default async function LandingPage() {
  const curated = await loadCurated()
  return (
    <>
      <HeroBanner />
      <TrustBar />
      <CourseRow
        titulo="Os cursos mais vendidos da semana"
        subtitulo="O que o pessoal está comprando agora pra começar a faturar"
        cursos={curated}
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
