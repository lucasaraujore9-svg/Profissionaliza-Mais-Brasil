import { HeroBanner } from "@/components/main/home/hero-banner"
import { TrustBar } from "@/components/main/home/trust-bar"
import { CourseRow } from "@/components/main/home/course-row"
import { CategoriesGrid } from "@/components/main/home/categories-grid"
import { LearnAnywhere } from "@/components/main/home/learn-anywhere"
import { Testimonials } from "@/components/main/home/testimonials"
import { FinalCta } from "@/components/main/home/final-cta"
import type { Course } from "@/components/main/home/course-card"
import { getCurrentTenant } from "@/lib/tenant/current"
import { listTenantCourses } from "@/lib/tenant/courses"
import { prisma } from "@/lib/prisma"

interface DbCourse {
  slug: string
  nome: string
  categoriaLoja: string | null
  cargaHoraria: string | null
  precoVitrineMain: number | null
  precoPromocional: number | null
  precoOriginal: number | null
  capaImageUrl: string | null
}

function formatPrice(value: number | null): string {
  if (value == null || value <= 0) return "Consulte"
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

function toDisplayCourse(c: DbCourse, idx: number, selo?: Course["selo"]): Course {
  const preco =
    Number(c.precoVitrineMain ?? 0) ||
    Number(c.precoPromocional ?? 0) ||
    Number(c.precoOriginal ?? 0)
  return {
    slug: c.slug,
    categoria: c.categoriaLoja ?? "Curso profissionalizante",
    titulo: c.nome,
    instrutor: "Equipe PMB",
    rating: "4.9",
    alunos: "—",
    horas: c.cargaHoraria ? `${c.cargaHoraria}h` : "Curso online",
    preco: formatPrice(preco),
    parcelas: "12x sem juros",
    selo: selo ?? null,
    accent: idx % 2 === 0 ? "gold" : "green",
    imageUrl: c.capaImageUrl,
  }
}

async function loadCurated(tenantId: string): Promise<Course[]> {
  const tenantCurated = await listTenantCourses({ tenantId, limit: 8 })
  if (tenantCurated.items.length > 0) {
    return tenantCurated.items.map(
      (c, idx): Course => ({
        slug: c.slug,
        categoria: c.categoria ?? "Curso profissionalizante",
        titulo: c.nome,
        instrutor: "Equipe PMB",
        rating: "4.9",
        alunos: "—",
        horas: c.horas ? `${c.horas}h` : "Curso online",
        preco: formatPrice(c.price),
        parcelas: "12x sem juros",
        selo: idx === 0 ? "mais-vendido" : null,
        accent: idx % 2 === 0 ? "gold" : "green",
        imageUrl: c.imageUrl,
      }),
    )
  }

  try {
    const rows = await prisma.course.findMany({
      where: { destaque: true, status: "ATIVO" },
      orderBy: { nome: "asc" },
      take: 8,
      select: {
        slug: true,
        nome: true,
        categoriaLoja: true,
        cargaHoraria: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        capaImageUrl: true,
      },
    })
    if (rows.length === 0) return []
    return rows.map((r, idx) => toDisplayCourse({
      ...r,
      precoVitrineMain: r.precoVitrineMain ? Number(r.precoVitrineMain) : null,
      precoPromocional: r.precoPromocional ? Number(r.precoPromocional) : null,
      precoOriginal: r.precoOriginal ? Number(r.precoOriginal) : null,
    }, idx, idx === 0 ? "mais-vendido" : null))
  } catch {
    return []
  }
}

async function loadByCategoria(categoria: string, take = 8): Promise<Course[]> {
  try {
    const rows = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        categoriaLoja: { equals: categoria, mode: "insensitive" },
      },
      orderBy: { nome: "asc" },
      take,
      select: {
        slug: true,
        nome: true,
        categoriaLoja: true,
        cargaHoraria: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        capaImageUrl: true,
      },
    })
    return rows.map((r, idx) => toDisplayCourse({
      ...r,
      precoVitrineMain: r.precoVitrineMain ? Number(r.precoVitrineMain) : null,
      precoPromocional: r.precoPromocional ? Number(r.precoPromocional) : null,
      precoOriginal: r.precoOriginal ? Number(r.precoOriginal) : null,
    }, idx))
  } catch {
    return []
  }
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

  const [curated, informatica, administrativo, diversas] = await Promise.all([
    loadCurated(tenant.id),
    loadByCategoria("INFORMÁTICA E TECNOLOGIA"),
    loadByCategoria("ADMINISTRATIVO"),
    loadByCategoria("DIVERSAS ÁREAS"),
  ])

  return (
    <>
      <HeroBanner />
      <TrustBar />
      {curated.length > 0 && (
        <CourseRow
          titulo="Os cursos mais vendidos da semana"
          subtitulo="O que o pessoal está comprando agora pra começar a faturar"
          cursos={curated}
        />
      )}
      <CategoriesGrid />
      {informatica.length > 0 && (
        <CourseRow
          titulo="Informática e Tecnologia"
          subtitulo="Profissões em alta no mercado digital"
          verTodosHref="/cursos?categoria=Informática+e+Tecnologia"
          cursos={informatica}
        />
      )}
      <LearnAnywhere />
      {administrativo.length > 0 && (
        <CourseRow
          titulo="Administrativo"
          subtitulo="Da rotina ao planejamento — capacite-se pra qualquer empresa"
          verTodosHref="/cursos?categoria=Administrativo"
          cursos={administrativo}
        />
      )}
      {diversas.length > 0 && (
        <CourseRow
          titulo="Diversas áreas"
          subtitulo="Beleza, saúde, segurança do trabalho e muito mais"
          verTodosHref="/cursos?categoria=Diversas+Áreas"
          cursos={diversas}
        />
      )}
      <Testimonials />
      <FinalCta />
    </>
  )
}
