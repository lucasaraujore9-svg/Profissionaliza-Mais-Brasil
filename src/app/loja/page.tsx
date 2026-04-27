import { HeroBanner } from "@/components/main/home/hero-banner"
import { TrustBar } from "@/components/main/home/trust-bar"
import { CourseRow } from "@/components/main/home/course-row"
import { CategoriesGrid } from "@/components/main/home/categories-grid"
import { LearnAnywhere } from "@/components/main/home/learn-anywhere"
import { Testimonials } from "@/components/main/home/testimonials"
import { FinalCta } from "@/components/main/home/final-cta"
import type { Course } from "@/components/main/home/course-card"
import {
  MAIS_VENDIDOS,
  SAUDE,
  CONSTRUCAO,
  BELEZA,
} from "@/components/main/home/courses-data"
import { getCurrentTenant } from "@/lib/tenant/current"
import { listTenantCourses } from "@/lib/tenant/courses"

async function loadTenantCurated(tenantId: string): Promise<Course[]> {
  const { items } = await listTenantCourses({ tenantId, limit: 8 })
  if (items.length === 0) return MAIS_VENDIDOS
  return items.map((c, idx): Course => ({
    slug: c.slug,
    categoria: c.categoria ?? "Curso profissionalizante",
    titulo: c.nome,
    instrutor: "Equipe PMB",
    rating: "4.9",
    alunos: "—",
    horas: c.horas ?? "Curso online",
    preco: `R$ ${c.price.toFixed(2).replace(".", ",")}`,
    parcelas: "12x sem juros",
    selo: idx === 0 ? "mais-vendido" : null,
    accent: idx % 2 === 0 ? "gold" : "green",
  }))
}

export default async function LojaHomePage() {
  const tenant = await getCurrentTenant()

  if (!tenant) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Vitrine indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Não conseguimos identificar esta loja. Verifique o endereço e tente
          novamente.
        </p>
      </div>
    )
  }

  const curated = await loadTenantCurated(tenant.id)

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
