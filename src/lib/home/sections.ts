import { prisma } from "@/lib/prisma"
import type { Course } from "@/components/main/home/course-card"

// ---------------------------------------------------------------------------
// Tipos das configs por kind (gravados em home_sections.config como JSON)
// ---------------------------------------------------------------------------

export type SectionMode = "manual" | "random"
export type SectionCount = 4 | 8

export interface BestsellersConfig {
  kind: "bestsellers"
  title: string
  subtitle: string
  mode: SectionMode
  count: SectionCount
  /** Quando mode==="manual", esses IDs sao os exibidos. Vazio em modo random. */
  courseIds: string[]
}

export interface CategoryCoursesConfig {
  kind: "category_courses"
  title: string
  subtitle: string
  categoryId: string
  mode: SectionMode
  count: SectionCount
  courseIds: string[]
  /** Mostrar botao "Ver todos os cursos da categoria". */
  showSeeMore: boolean
}

export type AnySectionConfig = BestsellersConfig | CategoryCoursesConfig

/** Persistido em home_sections (1 row por seção). */
export interface HomeSectionRecord<T extends AnySectionConfig = AnySectionConfig> {
  id: string
  tenantId: string | null
  kind: T["kind"]
  position: number
  enabled: boolean
  config: T
}

// ---------------------------------------------------------------------------
// Validacao
// ---------------------------------------------------------------------------

export const SECTION_KINDS = ["bestsellers", "category_courses"] as const
export type SectionKind = (typeof SECTION_KINDS)[number]

export function isSectionKind(value: unknown): value is SectionKind {
  return typeof value === "string" && (SECTION_KINDS as readonly string[]).includes(value)
}

interface ValidationOk {
  ok: true
  kind: SectionKind
  config: AnySectionConfig
}
interface ValidationErr {
  ok: false
  error: string
}

/**
 * Valida um payload bruto e retorna a config normalizada (com defaults).
 * Validacao de existencia de cursos/categoria fica para o caller (precisa de DB).
 */
export function validateSectionPayload(
  kind: unknown,
  rawConfig: unknown,
): ValidationOk | ValidationErr {
  if (!isSectionKind(kind)) {
    return { ok: false, error: `kind inválido: ${String(kind)}` }
  }
  if (!rawConfig || typeof rawConfig !== "object") {
    return { ok: false, error: "config obrigatória" }
  }
  const c = rawConfig as Record<string, unknown>

  const title = typeof c.title === "string" ? c.title.trim() : ""
  if (!title) return { ok: false, error: "Título obrigatório" }
  if (title.length > 120) return { ok: false, error: "Título muito longo (máx 120)" }
  const subtitle = typeof c.subtitle === "string" ? c.subtitle.trim().slice(0, 200) : ""

  const mode = c.mode === "manual" || c.mode === "random" ? c.mode : null
  if (!mode) return { ok: false, error: "Modo deve ser 'manual' ou 'random'" }

  const count = c.count === 4 || c.count === 8 ? c.count : null
  if (!count) return { ok: false, error: "Quantidade deve ser 4 ou 8" }

  let courseIds: string[] = []
  if (Array.isArray(c.courseIds)) {
    courseIds = c.courseIds.filter((x): x is string => typeof x === "string")
  }

  if (mode === "manual") {
    if (courseIds.length < 4) {
      return { ok: false, error: "No modo manual, selecione pelo menos 4 cursos" }
    }
    if (courseIds.length > 8) {
      return { ok: false, error: "Máximo 8 cursos por seção" }
    }
    // Em manual, count e' efetivamente courseIds.length (mas validamos coerencia)
    if (courseIds.length !== count) {
      return {
        ok: false,
        error: `Quantidade configurada (${count}) não bate com cursos selecionados (${courseIds.length})`,
      }
    }
  } else {
    // random — courseIds e' irrelevante
    courseIds = []
  }

  if (kind === "bestsellers") {
    return {
      ok: true,
      kind,
      config: {
        kind: "bestsellers",
        title,
        subtitle,
        mode,
        count,
        courseIds,
      },
    }
  }

  // kind === "category_courses"
  const categoryId = typeof c.categoryId === "string" ? c.categoryId : ""
  if (!categoryId) {
    return { ok: false, error: "Selecione uma categoria" }
  }
  const showSeeMore = c.showSeeMore !== false // default true
  return {
    ok: true,
    kind,
    config: {
      kind: "category_courses",
      title,
      subtitle,
      categoryId,
      mode,
      count,
      courseIds,
      showSeeMore,
    },
  }
}

// ---------------------------------------------------------------------------
// Loader: busca sections do tenant, fallback para PMB
// ---------------------------------------------------------------------------

export async function loadHomeSections(
  tenantId: string | null,
): Promise<HomeSectionRecord[]> {
  // Tenant tem suas proprias secoes? Senao, herda do PMB.
  if (tenantId) {
    const own = await prisma.homeSection.findMany({
      where: { tenantId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    })
    if (own.length > 0) {
      return own.map(parseRow)
    }
  }
  const pmb = await prisma.homeSection.findMany({
    where: { tenantId: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  })
  return pmb.map(parseRow)
}

function parseRow(r: {
  id: string
  tenantId: string | null
  kind: string
  position: number
  enabled: boolean
  config: unknown
}): HomeSectionRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    kind: r.kind as SectionKind,
    position: r.position,
    enabled: r.enabled,
    config: r.config as AnySectionConfig,
  }
}

// ---------------------------------------------------------------------------
// Expansao: pega uma section + cookie de bestsellers (read-only) e retorna
// a lista de cursos a renderizar.
// ---------------------------------------------------------------------------

export const BESTSELLERS_COOKIE = "pmb_bestsellers_v1"

export interface BestsellersSnapshot {
  ids: string[]
  ts: number
}

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000 // 24h

export function parseBestsellersCookie(raw: string | undefined): BestsellersSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    if (
      parsed &&
      Array.isArray(parsed.ids) &&
      typeof parsed.ts === "number" &&
      Date.now() - parsed.ts < SNAPSHOT_TTL_MS
    ) {
      return parsed as BestsellersSnapshot
    }
  } catch {
    // ignore
  }
  return null
}

export function serializeBestsellersCookie(snapshot: BestsellersSnapshot): string {
  return encodeURIComponent(JSON.stringify(snapshot))
}

/**
 * Resolve qual conjunto de cursos exibir para uma seção e retorna os cards
 * (formato Course da home). Retorna null se a seção for inválida/sem cursos.
 *
 * Para bestsellers em modo random: usa `bestsellersSnapshot` (do cookie) se
 * existir. Caso contrário, sorteia e devolve as IDs novas para o caller
 * gravar no cookie.
 */
export async function resolveSectionCourses(
  section: HomeSectionRecord,
  tenantId: string | null,
  options: {
    bestsellersSnapshot: BestsellersSnapshot | null
    onNewBestsellersSnapshot?: (snap: BestsellersSnapshot) => void
  },
): Promise<{ courses: Course[]; meta: { categorySlug?: string } } | null> {
  const cfg = section.config
  const count = cfg.count

  if (cfg.kind === "bestsellers") {
    let ids: string[]
    if (cfg.mode === "manual") {
      ids = cfg.courseIds.slice(0, count)
    } else {
      // random — preserva snapshot da sessao
      if (options.bestsellersSnapshot && options.bestsellersSnapshot.ids.length === count) {
        ids = options.bestsellersSnapshot.ids
      } else {
        ids = await pickRandomCourseIds({ tenantId, count })
        if (ids.length >= 4) {
          options.onNewBestsellersSnapshot?.({ ids, ts: Date.now() })
        }
      }
    }
    const courses = await fetchCoursesByIds(ids)
    if (courses.length < 4) return null
    return { courses, meta: {} }
  }

  if (cfg.kind === "category_courses") {
    let ids: string[]
    if (cfg.mode === "manual") {
      ids = cfg.courseIds.slice(0, count)
    } else {
      ids = await pickRandomCourseIds({ tenantId, count, categoryId: cfg.categoryId })
    }
    if (ids.length < 4) return null
    const courses = await fetchCoursesByIds(ids)
    if (courses.length < 4) return null
    const category = await prisma.category.findUnique({
      where: { id: cfg.categoryId },
      select: { slug: true },
    })
    return { courses, meta: { categorySlug: category?.slug } }
  }

  return null
}

async function pickRandomCourseIds(args: {
  tenantId: string | null
  count: number
  categoryId?: string
}): Promise<string[]> {
  // Cursos elegiveis: status=ATIVO + nao escondido na main. Para vitrine de
  // revenda poderiamos filtrar tambem por TenantCourse.isVisible — mas como
  // a home atual ja usa cursos globais, mantemos o mesmo escopo nesta fase.
  const rows = await prisma.course.findMany({
    where: {
      status: "ATIVO",
      hiddenMain: false,
      ...(args.categoryId ? { categoryId: args.categoryId } : {}),
    },
    select: { id: true },
  })
  // void tenantId aqui (mesma fonte de dados que a home atual)
  void args.tenantId
  if (rows.length === 0) return []
  // Fisher-Yates parcial
  const ids = rows.map((r) => r.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = ids[i]
    ids[i] = ids[j]
    ids[j] = tmp
  }
  return ids.slice(0, args.count)
}

async function fetchCoursesByIds(ids: string[]): Promise<Course[]> {
  if (ids.length === 0) return []
  const { courseSelect, normalizeCourseRow, toCourse } = await import("./course-mapper")
  const rows = await prisma.course.findMany({
    where: {
      id: { in: ids },
      status: "ATIVO",
      hiddenMain: false,
    },
    select: courseSelect,
  })
  // Mantem a ordem original dos IDs
  const byId = new Map(rows.map((r) => [r.id, r]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
  return ordered.map((r, idx) => toCourse(normalizeCourseRow(r), idx, null))
}

// ---------------------------------------------------------------------------
// Helper: cria default sections para um tenant que ainda nao tem (fallback)
// ---------------------------------------------------------------------------

export async function ensureTenantHomeSections(tenantId: string): Promise<void> {
  const count = await prisma.homeSection.count({ where: { tenantId } })
  if (count > 0) return
  // Copia as secoes do PMB
  const pmbSections = await prisma.homeSection.findMany({
    where: { tenantId: null },
    orderBy: { position: "asc" },
  })
  if (pmbSections.length === 0) return
  await prisma.homeSection.createMany({
    data: pmbSections.map((s) => ({
      tenantId,
      kind: s.kind,
      position: s.position,
      enabled: s.enabled,
      config: s.config as object,
    })),
  })
}
