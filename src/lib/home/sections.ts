import { prisma } from "@/lib/prisma"
import type { Course } from "@/components/main/home/course-card"

/**
 * Filtro de visibilidade granular do catalogo para um tenant (espelha
 * `visibilityFilter` de src/lib/tenant/courses.ts):
 *   - ALL       → todos veem
 *   - ALLOWLIST → so se o tenant estiver em `allowedTenantIds`
 *   - DENYLIST  → todos exceto se estiver em `blockedTenantIds`
 */
function tenantVisibilityFilter(tenantId: string) {
  return {
    OR: [
      { visibilityMode: "ALL" as const },
      { visibilityMode: "ALLOWLIST" as const, allowedTenantIds: { has: tenantId } },
      {
        visibilityMode: "DENYLIST" as const,
        NOT: { blockedTenantIds: { has: tenantId } },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tipos das configs por kind (gravados em home_sections.config como JSON)
// ---------------------------------------------------------------------------

export type SectionMode = "manual" | "random"
export type SectionCount = 4 | 8

/**
 * "Mais vendidos da semana" é padronizada para exibir SEMPRE 4 cursos
 * (regra de negócio — vitrine institucional). Diferente das seções de
 * categoria, que seguem o padrão de 8. Forçado na validação e na renderização
 * para que configs antigas (count=8) ou edições no painel não quebrem o padrão.
 */
export const BESTSELLERS_COUNT = 4 as const

export interface BestsellersConfig {
  kind: "bestsellers"
  title: string
  subtitle: string
  mode: SectionMode
  count: SectionCount
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
  showSeeMore: boolean
}

export interface CategoriesGridConfig {
  kind: "categories_grid"
  title: string
  subtitle: string
  /** Vazio = mostra todas as categorias ativas (ordem do banco). Não-vazio = só essas, na ordem dada. */
  categoryIds: string[]
}

export type InstitutionalVariant =
  | "trust_bar"
  | "learn_anywhere"
  | "testimonials"
  | "final_cta"
  | "benefits"
  | "custom"

export interface InstitutionalItem {
  title: string
  body: string
  iconName: string | null
  imageUrl: string | null
  meta: string | null
}

export interface InstitutionalConfig {
  kind: "institutional"
  variant: InstitutionalVariant
  title: string
  subtitle: string
  body: string
  imageUrl: string | null
  buttonText: string | null
  buttonHref: string | null
  secondaryButtonText: string | null
  secondaryButtonHref: string | null
  items: InstitutionalItem[]
}

export type AnySectionConfig =
  | BestsellersConfig
  | CategoryCoursesConfig
  | CategoriesGridConfig
  | InstitutionalConfig

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

export const SECTION_KINDS = [
  "bestsellers",
  "category_courses",
  "categories_grid",
  "institutional",
] as const
export type SectionKind = (typeof SECTION_KINDS)[number]

const INSTITUTIONAL_VARIANTS: InstitutionalVariant[] = [
  "trust_bar",
  "learn_anywhere",
  "testimonials",
  "final_cta",
  "benefits",
  "custom",
]

const MAX_ITEMS = 16

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

function strOrEmpty(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}
function strOrNull(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length === 0 ? null : t.slice(0, max)
}

function validateInstitutionalItems(raw: unknown): InstitutionalItem[] | string {
  if (raw == null) return []
  if (!Array.isArray(raw)) return "items deve ser uma lista"
  if (raw.length > MAX_ITEMS) return `Máximo ${MAX_ITEMS} itens por bloco`
  const out: InstitutionalItem[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    if (!r || typeof r !== "object") return `Item #${i + 1}: formato inválido`
    const o = r as Record<string, unknown>
    out.push({
      title: strOrEmpty(o.title, 120),
      body: strOrEmpty(o.body, 600),
      iconName: strOrNull(o.iconName, 40),
      imageUrl: strOrNull(o.imageUrl, 500),
      meta: strOrNull(o.meta, 120),
    })
  }
  return out
}

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

  // ---------- categories_grid ----------
  if (kind === "categories_grid") {
    const title = strOrEmpty(c.title, 120) || "Qual profissão você quer aprender?"
    const subtitle = strOrEmpty(c.subtitle, 200)
    let categoryIds: string[] = []
    if (Array.isArray(c.categoryIds)) {
      categoryIds = c.categoryIds.filter((x): x is string => typeof x === "string")
    }
    return {
      ok: true,
      kind,
      config: { kind: "categories_grid", title, subtitle, categoryIds },
    }
  }

  // ---------- institutional ----------
  if (kind === "institutional") {
    const variant =
      typeof c.variant === "string" && INSTITUTIONAL_VARIANTS.includes(c.variant as InstitutionalVariant)
        ? (c.variant as InstitutionalVariant)
        : "custom"
    const title = strOrEmpty(c.title, 120)
    const subtitle = strOrEmpty(c.subtitle, 200)
    const body = strOrEmpty(c.body, 2000)
    const imageUrl = strOrNull(c.imageUrl)
    const buttonText = strOrNull(c.buttonText, 60)
    const buttonHref = strOrNull(c.buttonHref)
    const secondaryButtonText = strOrNull(c.secondaryButtonText, 60)
    const secondaryButtonHref = strOrNull(c.secondaryButtonHref)
    const itemsRes = validateInstitutionalItems(c.items)
    if (typeof itemsRes === "string") return { ok: false, error: itemsRes }
    return {
      ok: true,
      kind,
      config: {
        kind: "institutional",
        variant,
        title,
        subtitle,
        body,
        imageUrl,
        buttonText,
        buttonHref,
        secondaryButtonText,
        secondaryButtonHref,
        items: itemsRes,
      },
    }
  }

  // ---------- bestsellers / category_courses ----------
  const title = strOrEmpty(c.title, 120)
  if (!title) return { ok: false, error: "Título obrigatório" }
  const subtitle = strOrEmpty(c.subtitle, 200)

  const mode = c.mode === "manual" || c.mode === "random" ? c.mode : null
  if (!mode) return { ok: false, error: "Modo deve ser 'manual' ou 'random'" }

  const rawCount = c.count === 4 || c.count === 8 ? c.count : null
  if (!rawCount) return { ok: false, error: "Quantidade deve ser 4 ou 8" }
  // Bestsellers é fixo em 4; categorias seguem 4 ou 8 conforme escolha.
  const count: SectionCount = kind === "bestsellers" ? BESTSELLERS_COUNT : rawCount

  let courseIds: string[] = []
  if (Array.isArray(c.courseIds)) {
    courseIds = c.courseIds.filter((x): x is string => typeof x === "string")
  }

  if (mode === "manual") {
    if (courseIds.length < 4) return { ok: false, error: "No modo manual, selecione pelo menos 4 cursos" }
    if (courseIds.length > 8) return { ok: false, error: "Máximo 8 cursos por seção" }
    if (courseIds.length !== count) {
      return {
        ok: false,
        error: `Quantidade configurada (${count}) não bate com cursos selecionados (${courseIds.length})`,
      }
    }
  } else {
    courseIds = []
  }

  if (kind === "bestsellers") {
    return {
      ok: true,
      kind,
      config: { kind: "bestsellers", title, subtitle, mode, count, courseIds },
    }
  }

  const categoryId = typeof c.categoryId === "string" ? c.categoryId : ""
  if (!categoryId) return { ok: false, error: "Selecione uma categoria" }
  const showSeeMore = c.showSeeMore !== false
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
  // Configs antigas (seed inicial) podem não trazer o campo `kind` dentro do
  // JSON — injetamos a partir da coluna do DB para que resolveSectionCourses
  // e os renderers possam fazer narrowing com `cfg.kind`.
  let config = r.config as AnySectionConfig
  if (config && typeof config === "object") {
    const obj = config as unknown as Record<string, unknown>
    if (!obj.kind) {
      obj.kind = r.kind
      config = obj as unknown as AnySectionConfig
    }
  }
  return {
    id: r.id,
    tenantId: r.tenantId,
    kind: r.kind as SectionKind,
    position: r.position,
    enabled: r.enabled,
    config,
  }
}

// ---------------------------------------------------------------------------
// Bestsellers cache via cookie
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

// ---------------------------------------------------------------------------
// Expansao de courses (apenas para kinds que tem cursos)
// ---------------------------------------------------------------------------

export async function resolveSectionCourses(
  section: HomeSectionRecord,
  tenantId: string | null,
  options: {
    bestsellersSnapshot: BestsellersSnapshot | null
    onNewBestsellersSnapshot?: (snap: BestsellersSnapshot) => void
  },
): Promise<{ courses: Course[]; meta: { categorySlug?: string } } | null> {
  const cfg = section.config
  if (cfg.kind !== "bestsellers" && cfg.kind !== "category_courses") return null
  // Bestsellers sempre 4, independentemente do que estiver salvo no config.
  const count = cfg.kind === "bestsellers" ? BESTSELLERS_COUNT : cfg.count

  if (cfg.kind === "bestsellers") {
    let ids: string[]
    if (cfg.mode === "manual") {
      ids = cfg.courseIds.slice(0, count)
    } else {
      if (options.bestsellersSnapshot && options.bestsellersSnapshot.ids.length === count) {
        ids = options.bestsellersSnapshot.ids
      } else {
        ids = await pickRandomCourseIds({ tenantId, count })
        if (ids.length >= 4) {
          options.onNewBestsellersSnapshot?.({ ids, ts: Date.now() })
        }
      }
    }
    const courses = await fetchCoursesByIds(ids, tenantId)
    if (courses.length < 4) return null
    return { courses, meta: {} }
  }

  // category_courses
  let ids: string[]
  if (cfg.mode === "manual") {
    ids = cfg.courseIds.slice(0, count)
  } else {
    ids = await pickRandomCourseIds({ tenantId, count, categoryId: cfg.categoryId })
  }
  if (ids.length < 4) return null
  const courses = await fetchCoursesByIds(ids, tenantId)
  if (courses.length < 4) return null
  const category = await prisma.category.findUnique({
    where: { id: cfg.categoryId },
    select: { slug: true },
  })
  return { courses, meta: { categorySlug: category?.slug } }
}

async function pickRandomCourseIds(args: {
  tenantId: string | null
  count: number
  categoryId?: string
}): Promise<string[]> {
  let ids: string[]
  if (args.tenantId) {
    // Vitrine de revendedor: sorteia somente entre os cursos habilitados para
    // o tenant (TenantCourse.isVisible + visibilityMode), nao o catalogo global.
    const rows = await prisma.tenantCourse.findMany({
      where: {
        tenantId: args.tenantId,
        isVisible: true,
        course: {
          status: "ATIVO",
          ...tenantVisibilityFilter(args.tenantId),
          ...(args.categoryId ? { categoryId: args.categoryId } : {}),
        },
      },
      select: { courseId: true },
    })
    ids = rows.map((r) => r.courseId)
  } else {
    const rows = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        hiddenMain: false,
        ...(args.categoryId ? { categoryId: args.categoryId } : {}),
      },
      select: { id: true },
    })
    ids = rows.map((r) => r.id)
  }
  if (ids.length === 0) return []
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = ids[i]
    ids[i] = ids[j]
    ids[j] = tmp
  }
  return ids.slice(0, args.count)
}

function formatTenantPrice(value: number): string {
  if (value <= 0) return "Consulte"
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

/**
 * Carrega os cursos das secoes da home aplicando as customizacoes do tenant.
 *
 * Sem `tenantId` (site PMB): le o catalogo global (`Course`) com preco/capa
 * institucionais. Com `tenantId` (vitrine do revendedor): le `TenantCourse`,
 * exibindo o preco, a capa e as parcelas configurados pela unidade — sem isso
 * os cards da home mostravam os dados do sistema mae mesmo apos o revendedor
 * editar o curso.
 */
async function fetchCoursesByIds(
  ids: string[],
  tenantId: string | null,
): Promise<Course[]> {
  if (ids.length === 0) return []
  if (tenantId) return fetchTenantCoursesByIds(ids, tenantId)
  const { courseSelect, normalizeCourseRow, toCourse } = await import("./course-mapper")
  const rows = await prisma.course.findMany({
    where: {
      id: { in: ids },
      status: "ATIVO",
      hiddenMain: false,
    },
    select: courseSelect,
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
  return ordered.map((r, idx) => toCourse(normalizeCourseRow(r), idx, null))
}

async function fetchTenantCoursesByIds(
  ids: string[],
  tenantId: string,
): Promise<Course[]> {
  const rows = await prisma.tenantCourse.findMany({
    where: {
      tenantId,
      isVisible: true,
      courseId: { in: ids },
      course: { status: "ATIVO", ...tenantVisibilityFilter(tenantId) },
    },
    select: {
      courseId: true,
      price: true,
      paymentType: true,
      customCapaUrl: true,
      customParcelas: true,
      course: {
        select: {
          slug: true,
          nome: true,
          categoriaLoja: true,
          qtdAulas: true,
          cargaHoraria: true,
          capaImageUrl: true,
          capaOverride: true,
          parcelasSugeridas: true,
          parcelasOverride: true,
          monthlyMonthsMain: true,
        },
      },
    },
  })
  const byId = new Map(rows.map((r) => [r.courseId, r]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
  return ordered.map((tc, idx) => {
    const c = tc.course
    const isMonthly = tc.paymentType === "MONTHLY"
    const parcelas =
      tc.customParcelas ?? c.parcelasOverride ?? c.parcelasSugeridas
    const monthlyMonths = c.monthlyMonthsMain
    return {
      slug: c.slug,
      categoria: c.categoriaLoja ?? "Curso profissionalizante",
      titulo: c.nome,
      horas: c.cargaHoraria ? `${c.cargaHoraria}h` : `${c.qtdAulas} aulas`,
      preco: formatTenantPrice(Number(tc.price)),
      parcelas: isMonthly
        ? monthlyMonths
          ? `${monthlyMonths} mensalidades`
          : "mensalidade"
        : parcelas
          ? `${parcelas}x sem juros`
          : "12x sem juros",
      paymentType: tc.paymentType,
      selo: null,
      accent: idx % 2 === 0 ? "gold" : "green",
      imageUrl: tc.customCapaUrl ?? c.capaOverride ?? c.capaImageUrl,
    }
  })
}

/**
 * Resolve a lista de categorias a renderizar para uma seção `categories_grid`.
 * Vazio = todas ativas; senão, na ordem configurada (e só ativas).
 */
export async function resolveCategoriesForSection(
  section: HomeSectionRecord<CategoriesGridConfig>,
): Promise<Array<{ id: string; nome: string; slug: string; iconName?: string | null }>> {
  if (section.kind !== "categories_grid") return []
  const ids = section.config.categoryIds
  if (ids.length === 0) {
    const rows = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    })
    return rows.map((r) => ({ id: r.id, nome: r.name, slug: r.slug }))
  }
  const rows = await prisma.category.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, name: true, slug: true },
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => ({ id: r.id, nome: r.name, slug: r.slug }))
}

// ---------------------------------------------------------------------------
// Fallback: clona PMB para tenant que ainda nao tem secoes proprias
// ---------------------------------------------------------------------------

export async function ensureTenantHomeSections(tenantId: string): Promise<void> {
  const count = await prisma.homeSection.count({ where: { tenantId } })
  if (count > 0) return
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
