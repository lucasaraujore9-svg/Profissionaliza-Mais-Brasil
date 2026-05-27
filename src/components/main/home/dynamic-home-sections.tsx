import { cookies } from "next/headers"
import { CourseRow } from "./course-row"
import {
  CategoriesGridSection,
  InstitutionalSection,
} from "./section-renderers"
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
  /** Forwarded para CategoriesGridSection — adiciona pill da Unidade Técnica. */
  tecnicaEnabled?: boolean
  tecnicaLabel?: string
}

export async function DynamicHomeSections({
  tenantId,
  tecnicaEnabled,
  tecnicaLabel,
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
      tecnicaEnabled: tecnicaEnabled ?? false,
      tecnicaLabel,
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
    tecnicaEnabled: boolean
    tecnicaLabel?: string
  },
): Promise<React.ReactNode | null> {
  const cfg = section.config

  if (cfg.kind === "bestsellers" || cfg.kind === "category_courses") {
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
      />
    )
  }

  if (cfg.kind === "categories_grid") {
    const categories = await resolveCategoriesForSection(
      section as HomeSectionRecord<CategoriesGridConfig>,
    )
    return (
      <CategoriesGridSection
        config={cfg}
        categories={categories}
        tecnicaEnabled={ctx.tecnicaEnabled}
        tecnicaLabel={ctx.tecnicaLabel}
      />
    )
  }

  if (cfg.kind === "institutional") {
    return <InstitutionalSection config={cfg as InstitutionalConfig} />
  }

  return null
}
