import { HeroBanner } from "@/components/main/home/hero-banner"
import { TrustBar } from "@/components/main/home/trust-bar"
import { CourseRow } from "@/components/main/home/course-row"
import { CategoriesGrid } from "@/components/main/home/categories-grid"
import { LearnAnywhere } from "@/components/main/home/learn-anywhere"
import { Testimonials } from "@/components/main/home/testimonials"
import { FinalCta } from "@/components/main/home/final-cta"
import { TecnicaSection } from "@/components/main/home/tecnica-section"
import type { Course } from "@/components/main/home/course-card"
import { getCurrentTenant } from "@/lib/tenant/current"
import { listTenantCourses } from "@/lib/tenant/courses"
import { tecnicaFromTenant } from "@/lib/catalog/tecnica"
import { prisma } from "@/lib/prisma"
import {
  loadCurated,
  loadByCategoria,
  loadShowcase,
  loadCategorias,
} from "@/lib/catalog/home"

function formatPrice(value: number | null): string {
  if (value == null || value <= 0) return "Consulte"
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

async function loadTenantOrGlobalCurated(tenantId: string): Promise<Course[]> {
  const tenantCurated = await listTenantCourses({ tenantId, limit: 8 })
  if (tenantCurated.items.length > 0) {
    return tenantCurated.items.map(
      (c, idx): Course => ({
        slug: c.slug,
        categoria: c.categoria ?? "Curso profissionalizante",
        titulo: c.nome,
        horas: c.horas ? `${c.horas}h` : "Curso online",
        preco: formatPrice(c.price),
        parcelas: "12x sem juros",
        selo: idx === 0 ? "mais-vendido" : null,
        accent: idx % 2 === 0 ? "gold" : "green",
        imageUrl: c.imageUrl,
      }),
    )
  }
  return loadCurated()
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

  const [
    showcase,
    curated,
    informatica,
    administrativo,
    diversas,
    categorias,
    bannerSlides,
  ] = await Promise.all([
    loadShowcase(),
    loadTenantOrGlobalCurated(tenant.id),
    loadByCategoria("informatica"),
    loadByCategoria("administrativo"),
    loadByCategoria("diversas"),
    loadCategorias(),
    prisma.bannerSlide.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        desktopUrl: true,
        mobileUrl: true,
        linkUrl: true,
      },
    }),
  ])

  const tecnica = tecnicaFromTenant(tenant)

  return (
    <>
      <HeroBanner
        showcase={showcase}
        tenantBannerUrl={tenant.bannerUrl}
        slides={bannerSlides}
      />
      <TrustBar />
      {curated.length > 0 && (
        <CourseRow
          titulo="Os cursos mais vendidos da semana"
          subtitulo="O que o pessoal está comprando agora pra começar a faturar"
          cursos={curated}
        />
      )}
      <CategoriesGrid
        categorias={categorias}
        tecnicaEnabled={tecnica.enabled}
        tecnicaLabel={tecnica.label}
      />
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
      {tecnica.enabled && (
        <TecnicaSection
          label={tecnica.label}
          courses={tecnica.courses}
          fallbackUrl={tecnica.url}
        />
      )}
      <Testimonials />
      <FinalCta />
    </>
  )
}
