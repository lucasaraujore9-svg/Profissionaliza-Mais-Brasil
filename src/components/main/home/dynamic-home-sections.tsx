import { cookies } from "next/headers"
import { CourseRow } from "./course-row"
import { TecnicaSection } from "./tecnica-section"
import { EjaSection } from "./eja-section"
import { PackagesRow } from "@/components/loja/packages-row"
import { resolveVitrinePackages } from "@/lib/packages/vitrine"
import {
  CategoriesGridSection,
  InstitutionalSection,
} from "./section-renderers"
import { loadTecnicaSectionContent } from "@/lib/catalog/tecnica"
import { loadEjaSectionContent } from "@/lib/catalog/eja"
import {
  loadHomeSections,
  resolveSectionCourses,
  resolveCategoriesForSection,
  parseBestsellersCookie,
  serializeBestsellersCookie,
  BESTSELLERS_COOKIE,
  type BestsellersSnapshot,
  type HomeSectionRecord,
  type CategoriesGridConfig,
  type InstitutionalConfig,
} from "@/lib/home/sections"

interface DynamicHomeSectionsProps {
  tenantId: string | null
}

export async function DynamicHomeSections({
  tenantId,
}: DynamicHomeSectionsProps) {
  const sections = await loadHomeSections(tenantId)
  const enabled = sections.filter((s) => s.enabled)

  const cookieStore = await cookies()
  const initialSnapshot = parseBestsellersCookie(
    cookieStore.get(BESTSELLERS_COOKIE)?.value,
  )

  // Holder object: mutar `current` em callbacks evita o erro
  // `react-hooks/immutability` que vetaria reatribuir uma `let` capturada.
  const snapshotHolder: { current: BestsellersSnapshot | null } = {
    current: null,
  }

  // Pré-processa cada seção, gerando o nó React correspondente.
  const nodes: { id: string; node: React.ReactNode }[] = []

  for (const section of enabled) {
    const node = await renderSection(section, {
      tenantId,
      bestsellersSnapshot: initialSnapshot,
      onNewBestsellersSnapshot: (snap) => {
        snapshotHolder.current = snap
      },
    })
    if (node) nodes.push({ id: section.id, node })
  }

  // Persiste snapshot novo (best-effort).
  if (snapshotHolder.current) {
    try {
      cookieStore.set({
        name: BESTSELLERS_COOKIE,
        value: serializeBestsellersCookie(snapshotHolder.current),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      })
    } catch {
      // pre-render estático lança — ignora.
    }
  }

  return (
    <>
      {nodes.map((n) => (
        <div key={n.id}>{n.node}</div>
      ))}
    </>
  )
}

async function renderSection(
  section: HomeSectionRecord,
  ctx: {
    tenantId: string | null
    bestsellersSnapshot: BestsellersSnapshot | null
    onNewBestsellersSnapshot: (snap: BestsellersSnapshot) => void
  },
): Promise<React.ReactNode | null> {
  const cfg = section.config

  if (
    cfg.kind === "bestsellers" ||
    cfg.kind === "category_courses" ||
    cfg.kind === "idiomas"
  ) {
    const resolved = await resolveSectionCourses(section, ctx.tenantId, {
      bestsellersSnapshot: ctx.bestsellersSnapshot,
      onNewBestsellersSnapshot: ctx.onNewBestsellersSnapshot,
    })
    if (!resolved) return null
    let seeMoreHref: string | undefined
    if (
      cfg.kind === "category_courses" &&
      cfg.showSeeMore &&
      resolved.meta.categorySlug
    ) {
      seeMoreHref = `/cursos?categoria=${resolved.meta.categorySlug}`
    }
    return (
      <CourseRow
        titulo={cfg.title}
        subtitulo={cfg.subtitle || undefined}
        verTodosHref={seeMoreHref}
        cursos={resolved.courses}
        // Na vitrine do revendedor (tenantId) os cards apontam para o detalhe
        // da loja (`/curso/:slug`), nao para o detalhe global da PMB.
        hrefBase={ctx.tenantId ? "/curso" : "/cursos"}
      />
    )
  }

  if (cfg.kind === "packages") {
    const packages = await resolveVitrinePackages(ctx.tenantId)
    if (packages.length === 0) return null
    return (
      <PackagesRow
        titulo={cfg.title}
        subtitulo={cfg.subtitle || undefined}
        packages={packages}
        // Vitrine de revenda: detalhe em /pacote/:slug; PMB: /pacotes/:slug.
        hrefBase={ctx.tenantId ? "/pacote" : "/pacotes"}
      />
    )
  }

  if (cfg.kind === "categories_grid") {
    const categories = await resolveCategoriesForSection(
      section as HomeSectionRecord<CategoriesGridConfig>,
    )
    return <CategoriesGridSection config={cfg} categories={categories} />
  }

  if (cfg.kind === "institutional") {
    return <InstitutionalSection config={cfg as InstitutionalConfig} />
  }

  if (cfg.kind === "tecnica") {
    // Lista/imagens padronizadas pela PMB; na vitrine de revendedor o link de
    // destino e o rótulo são os da própria unidade (Tenant.tecnica*).
    const { label, url, courses } = await loadTecnicaSectionContent(ctx.tenantId)
    // TecnicaSection já retorna null quando não há cursos nem URL base.
    return <TecnicaSection label={label} courses={courses} fallbackUrl={url} />
  }

  if (cfg.kind === "eja") {
    // Banner (só imagem) padronizado pela PMB — desktop + mobile; link do escopo
    // (PMB ou unidade). EjaSection retorna null sem link ou sem imagem.
    const { label, url, bannerImageUrl, bannerImageUrlMobile } =
      await loadEjaSectionContent(ctx.tenantId)
    return (
      <EjaSection
        label={label}
        url={url}
        bannerImageUrl={bannerImageUrl}
        bannerImageUrlMobile={bannerImageUrlMobile}
      />
    )
  }

  return null
}
