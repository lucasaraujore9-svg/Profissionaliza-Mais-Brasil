import { cookies } from "next/headers"
import { CourseRow } from "./course-row"
import {
  loadHomeSections,
  resolveSectionCourses,
  parseBestsellersCookie,
  serializeBestsellersCookie,
  BESTSELLERS_COOKIE,
  type BestsellersSnapshot,
} from "@/lib/home/sections"

interface DynamicHomeSectionsProps {
  tenantId: string | null
}

/**
 * Server Component que carrega `home_sections` do tenant (ou PMB) e renderiza
 * cada seção habilitada como um <CourseRow/>.
 *
 * Estratégia de cache do "Mais vendidos" em modo random:
 *   1. Lê o cookie pmb_bestsellers_v1 (snapshot da sessão atual).
 *   2. Se existir e for válido, usa os mesmos IDs.
 *   3. Se não, sorteia novos IDs e tenta gravar via `cookies().set()`.
 *
 * Important: `cookies().set()` em Server Component só funciona quando a página
 * é renderizada dinamicamente (não estaticamente). As home pages que usam isso
 * já são dinâmicas porque carregam cursos do banco a cada request.
 */
export async function DynamicHomeSections({
  tenantId,
}: DynamicHomeSectionsProps) {
  const sections = await loadHomeSections(tenantId)
  const enabled = sections.filter((s) => s.enabled)

  const cookieStore = await cookies()
  const initialSnapshot = parseBestsellersCookie(
    cookieStore.get(BESTSELLERS_COOKIE)?.value,
  )

  let nextSnapshot: BestsellersSnapshot | null = null

  // Resolve cursos de cada seção em série (manter ordem, ainda barato — 4-8 secoes)
  const rendered: {
    id: string
    title: string
    subtitle: string
    courses: Awaited<
      ReturnType<typeof resolveSectionCourses>
    > extends infer R
      ? R extends { courses: infer C }
        ? C
        : never
      : never
    seeMoreHref?: string
  }[] = []

  for (const section of enabled) {
    const resolved = await resolveSectionCourses(section, tenantId, {
      bestsellersSnapshot: initialSnapshot,
      onNewBestsellersSnapshot: (snap) => {
        nextSnapshot = snap
      },
    })
    if (!resolved) continue
    const cfg = section.config
    let seeMoreHref: string | undefined
    if (cfg.kind === "category_courses" && cfg.showSeeMore && resolved.meta.categorySlug) {
      seeMoreHref = `/cursos?categoria=${resolved.meta.categorySlug}`
    }
    rendered.push({
      id: section.id,
      title: cfg.title,
      subtitle: cfg.subtitle,
      courses: resolved.courses,
      seeMoreHref,
    })
  }

  // Persiste novo snapshot do bestsellers (se gerou) — best-effort, falha
  // silenciosamente em pre-render estático.
  if (nextSnapshot) {
    try {
      cookieStore.set({
        name: BESTSELLERS_COOKIE,
        value: serializeBestsellersCookie(nextSnapshot),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24h
      })
    } catch {
      // OK — em modo estático, cookies().set() lança. Próxima sessão regenera.
    }
  }

  return (
    <>
      {rendered.map((r) => (
        <CourseRow
          key={r.id}
          titulo={r.title}
          subtitulo={r.subtitle || undefined}
          verTodosHref={r.seeMoreHref}
          cursos={r.courses}
        />
      ))}
    </>
  )
}
