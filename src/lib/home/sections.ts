import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { Course } from "@/components/main/home/course-card"
import { COURSE_HAS_PRICE } from "@/lib/catalog/visibility"
import { interestFreeLabel } from "@/lib/mercadopago/installments"
import { coursePaymentType } from "@/lib/tenant/monthly-policy"

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

/**
 * Mínimo de cursos ativos/visíveis que uma categoria precisa ter para que a
 * seção "Cursos de {categoria}" (category_courses) possa ser ATIVADA na home.
 * A seção é criada automaticamente ao criar a categoria, mas só liga quando a
 * categoria atinge esse limiar. Vale para o sistema mãe e para as revendas.
 */
export const CATEGORY_SECTION_MIN_COURSES = 8 as const

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

/**
 * Seção "Cursos Técnicos". O conteúdo (cursos, imagens, URL, rótulo) vive em
 * `SystemSettings.tecnica*` — fonte única, editada pelo admin (sistema mãe). A
 * linha do HomeSection controla só posição + enabled, então a config é apenas
 * um marcador. As unidades reordenam/ligam-desligam, mas não editam o conteúdo.
 */
export interface TecnicaSectionConfig {
  kind: "tecnica"
}

/**
 * Seção "EJA" — banner com link para a página personalizada de EJA. Espelha a
 * Técnica: sem campos editáveis na config (apenas marcador de posição/enabled).
 * O conteúdo (imagem do banner, link, rótulo) vive em `SystemSettings.eja*`
 * (PMB) e `Tenant.eja*` (link por unidade). A imagem é padronizada pela PMB; o
 * link é o da própria unidade. Sem link configurado, o banner é omitido.
 */
export interface EjaSectionConfig {
  kind: "eja"
}

/**
 * Padrão da seção "Idiomas": exatamente 4 cursos (1 linha). O conteúdo é
 * padronizado pela PMB (igual à Técnica): a config dos `courseIds` vive na seção
 * idiomas do PMB e as unidades só exibem/reordenam — nunca editam a lista.
 */
export const IDIOMAS_SECTION_COUNT = 4 as const

export interface IdiomasSectionConfig {
  kind: "idiomas"
  title: string
  subtitle: string
  courseIds: string[]
}

/**
 * Seção "Pacotes de cursos" — exibe uma linha de cards de pacote. O conteúdo
 * (quais pacotes, preço) é resolvido em runtime pela vitrine: pacotes da PMB
 * (auto-distribuídos) + pacotes próprios da unidade, descontando os que a
 * unidade ocultou (TenantPackage.isVisible=false). A config carrega só
 * título/subtítulo — não há lista fixa de ids (igual à Técnica/EJA, o conteúdo
 * é derivado). Ver src/lib/packages/vitrine.ts.
 */
export interface PackagesSectionConfig {
  kind: "packages"
  title: string
  subtitle: string
}

export type AnySectionConfig =
  | BestsellersConfig
  | CategoryCoursesConfig
  | CategoriesGridConfig
  | InstitutionalConfig
  | TecnicaSectionConfig
  | EjaSectionConfig
  | IdiomasSectionConfig
  | PackagesSectionConfig

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
  "tecnica",
  "eja",
  "idiomas",
  "packages",
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

// ---------------------------------------------------------------------------
// Schemas Zod dos ENVELOPES de request (API-003)
//
// A validação granular por `kind` continua em `validateSectionPayload` (tem
// regras de negócio: contagem de cursos, singletons, mínimos por categoria).
// Estes schemas gateiam o FORMATO do request no boundary (kind ∈ enum, config
// é objeto, campos de update no tipo certo, order = array de strings) de forma
// declarativa — alinhando home-sections ao padrão Zod do resto da API.
// ---------------------------------------------------------------------------

export const sectionKindSchema = z.enum(SECTION_KINDS)

/** POST /home-sections — cria uma seção. config validada a fundo depois. */
export const createSectionSchema = z.object({
  kind: sectionKindSchema,
  config: z.record(z.string(), z.unknown()),
})
export type CreateSectionInput = z.infer<typeof createSectionSchema>

/** PATCH /home-sections/[id] — campos parciais. Pelo menos um deve vir. */
export const updateSectionSchema = z
  .object({
    config: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
    position: z.number().finite().min(0).optional(),
  })
  .refine(
    (b) =>
      b.config !== undefined ||
      b.enabled !== undefined ||
      b.position !== undefined,
    { message: "Nenhum campo para atualizar" },
  )
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>

/** PUT /home-sections/reorder — nova ordem por ids. */
export const reorderSectionsSchema = z.object({
  order: z.array(z.string()),
})
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>

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

  // ---------- tecnica ----------
  // Sem campos editáveis na config: o conteúdo (cursos/URL/rótulo) vive em
  // SystemSettings.tecnica*. A config é apenas um marcador para o renderer.
  if (kind === "tecnica") {
    return { ok: true, kind, config: { kind: "tecnica" } }
  }

  // ---------- eja ----------
  // Igual à técnica: marcador. Conteúdo (banner/URL/rótulo) em SystemSettings.eja*
  // (PMB) e Tenant.eja* (link por unidade).
  if (kind === "eja") {
    return { ok: true, kind, config: { kind: "eja" } }
  }

  // ---------- idiomas ----------
  // Seção fixa de até 4 cursos, padronizada pela PMB. title/subtitle opcionais
  // (default "Idiomas"); courseIds limitado a 4 (UI guia para exatamente 4).
  if (kind === "idiomas") {
    const title = strOrEmpty(c.title, 120) || "Idiomas"
    const subtitle = strOrEmpty(c.subtitle, 200)
    let courseIds: string[] = []
    if (Array.isArray(c.courseIds)) {
      courseIds = c.courseIds.filter((x): x is string => typeof x === "string")
    }
    // Dedup preservando ordem + cap em 4.
    courseIds = Array.from(new Set(courseIds)).slice(0, IDIOMAS_SECTION_COUNT)
    // Padrão fixo: 0 cursos (seção configurada mas oculta) ou exatamente 4.
    // Espelha validateTecnicaCoursesInput — a invariante "exatamente N" vive no
    // servidor, não só na UI.
    if (courseIds.length !== 0 && courseIds.length !== IDIOMAS_SECTION_COUNT) {
      return {
        ok: false,
        error: `A seção Idiomas exige exatamente ${IDIOMAS_SECTION_COUNT} cursos (ou nenhum). Você enviou ${courseIds.length}.`,
      }
    }
    return { ok: true, kind, config: { kind: "idiomas", title, subtitle, courseIds } }
  }

  // ---------- packages ----------
  // Marcador com título/subtítulo editáveis; o conteúdo (pacotes) é derivado
  // em runtime (PMB + próprios da unidade, menos os ocultos).
  if (kind === "packages") {
    const title = strOrEmpty(c.title, 120) || "Pacotes de cursos"
    const subtitle = strOrEmpty(c.subtitle, 200)
    return { ok: true, kind, config: { kind: "packages", title, subtitle } }
  }

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

  // idiomas: lista fixa padronizada pela PMB. Para tenants, lê os courseIds da
  // seção idiomas do PMB (fonte única, como a Técnica); na PMB usa a própria
  // config. Os preços/capas saem de TenantCourse quando há tenant (fetchCoursesByIds).
  if (cfg.kind === "idiomas") {
    let ids = cfg.courseIds
    if (tenantId) {
      ids = await loadPmbIdiomasCourseIds()
    }
    ids = ids.slice(0, IDIOMAS_SECTION_COUNT)
    if (ids.length === 0) return null
    const courses = await fetchCoursesByIds(ids, tenantId)
    if (courses.length === 0) return null
    return { courses, meta: {} }
  }

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

/**
 * Lê os `courseIds` da seção idiomas do PMB (tenantId=null) — fonte única do
 * conteúdo de Idiomas para toda a rede. As vitrines de revendedor herdam estes
 * cursos (com preço/capa próprios via TenantCourse), não a config clonada.
 */
async function loadPmbIdiomasCourseIds(): Promise<string[]> {
  const row = await prisma.homeSection.findFirst({
    where: { tenantId: null, kind: "idiomas" },
    orderBy: { position: "asc" },
    select: { config: true },
  })
  const cfg = row?.config as { courseIds?: unknown } | null
  if (cfg && Array.isArray(cfg.courseIds)) {
    return cfg.courseIds.filter((x): x is string => typeof x === "string")
  }
  return []
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
          ...(args.categoryId
            ? { categoryLinks: { some: { categoryId: args.categoryId } } }
            : {}),
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
        ...(args.categoryId
          ? { categoryLinks: { some: { categoryId: args.categoryId } } }
          : {}),
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
  const { getSystemSettings } = await import("@/lib/system-settings")
  const [rows, settings] = await Promise.all([
    prisma.course.findMany({
      where: {
        id: { in: ids },
        status: "ATIVO",
        hiddenMain: false,
        AND: [COURSE_HAS_PRICE],
      },
      select: courseSelect,
    }),
    getSystemSettings(),
  ])
  const byId = new Map(rows.map((r) => [r.id, r]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
  return ordered.map((r, idx) =>
    toCourse(
      normalizeCourseRow(r),
      idx,
      null,
      settings.pmbInterestFreeInstallments,
    ),
  )
}

async function fetchTenantCoursesByIds(
  ids: string[],
  tenantId: string,
): Promise<Course[]> {
  const [rows, tenant] = await Promise.all([
    prisma.tenantCourse.findMany({
      where: {
        tenantId,
        isVisible: true,
        price: { gt: 0 },
        courseId: { in: ids },
        course: { status: "ATIVO", ...tenantVisibilityFilter(tenantId) },
      },
      select: {
        courseId: true,
        price: true,
        paymentType: true,
        customCapaUrl: true,
        course: {
          select: {
            slug: true,
            nome: true,
            categoriaLoja: true,
            qtdAulas: true,
            cargaHoraria: true,
            capaImageUrl: true,
            capaOverride: true,
            monthlyMonthsMain: true,
          },
        },
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { interestFreeInstallments: true },
    }),
  ])
  const interestFree = tenant?.interestFreeInstallments ?? 1
  const byId = new Map(rows.map((r) => [r.courseId, r]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
  return ordered.map((tc, idx) => {
    const c = tc.course
    const isMonthly = tc.paymentType === "MONTHLY"
    const monthlyMonths = c.monthlyMonthsMain
    return {
      slug: c.slug,
      categoria: c.categoriaLoja ?? "Curso profissionalizante",
      titulo: c.nome,
      horas: c.cargaHoraria ? `${c.cargaHoraria}h` : `${c.qtdAulas} aulas`,
      preco: formatTenantPrice(Number(tc.price)),
      // Pagamento único: "Nx sem juros" vem do nº GLOBAL da unidade.
      parcelas: isMonthly
        ? monthlyMonths
          ? `${monthlyMonths} mensalidades`
          : "mensalidade"
        : interestFreeLabel(interestFree) ?? "",
      paymentType: coursePaymentType(tc.paymentType),
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
  if (count > 0) {
    // Tenant já tem seções próprias (clonadas antes destas seções existirem
    // como HomeSection). Garante que as linhas singleton estejam presentes para
    // tenants antigos — caso contrário não apareceriam no painel nem na home.
    await ensureTecnicaSection(tenantId)
    await ensureEjaSection(tenantId)
    await ensureIdiomasSection(tenantId)
    await ensurePackagesSection(tenantId)
    return
  }
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

/**
 * Garante (idempotente) a existência da linha singleton kind="tecnica" para um
 * escopo (PMB quando tenantId=null, ou um revendedor). Usado como backfill nos
 * GET dos painéis e para escopos criados antes da Técnica virar HomeSection.
 * Posiciona no slot canônico: imediatamente antes de "Depoimentos"
 * (institutional/testimonials); sem âncora, cai no fim. `enabled` espelha o flag
 * tecnica_enabled correspondente (SystemSettings para PMB; Tenant para revendedor).
 */
export async function ensureTecnicaSection(
  tenantId: string | null,
): Promise<void> {
  const existing = await prisma.homeSection.findFirst({
    where: { tenantId, kind: "tecnica" },
    select: { id: true },
  })
  if (existing) return

  let enabled = false
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tecnicaEnabled: true },
    })
    enabled = tenant?.tecnicaEnabled ?? false
  } else {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { tecnicaEnabled: true },
    })
    enabled = settings?.tecnicaEnabled ?? false
  }

  const position =
    (await testimonialsPosition(tenantId)) ?? (await lastPosition(tenantId)) + 1
  await createSectionAt(tenantId, position, {
    kind: "tecnica",
    enabled,
    config: { kind: "tecnica" },
  })
}

/**
 * Garante (idempotente) a linha singleton kind="packages" para um escopo (PMB
 * quando tenantId=null, ou uma revenda). Posiciona logo após "Mais vendidos"
 * (bestsellers) quando existe; senão no fim. Habilitada por padrão — a seção só
 * renderiza de fato quando há pacotes disponíveis (ver resolveVitrinePackages).
 */
export async function ensurePackagesSection(
  tenantId: string | null,
): Promise<void> {
  const existing = await prisma.homeSection.findFirst({
    where: { tenantId, kind: "packages" },
    select: { id: true },
  })
  if (existing) return

  const bestsellers = await prisma.homeSection.findFirst({
    where: { tenantId, kind: "bestsellers" },
    select: { position: true },
  })
  const position =
    bestsellers != null
      ? bestsellers.position + 1
      : (await lastPosition(tenantId)) + 1
  await createSectionAt(tenantId, position, {
    kind: "packages",
    enabled: true,
    config: { kind: "packages", title: "Pacotes de cursos", subtitle: "Leve vários cursos por um valor único" },
  })
}

/**
 * Insere (idempotente do lado do chamador) uma linha singleton em `position`,
 * abrindo espaço — incrementa a `position` de todas as seções do escopo que
 * estejam em `position` ou depois. Transacional para que a renumeração e o
 * insert não corram entre si.
 */
async function createSectionAt(
  tenantId: string | null,
  position: number,
  data: { kind: SectionKind; enabled: boolean; config: object },
): Promise<void> {
  await prisma.$transaction([
    prisma.homeSection.updateMany({
      where: { tenantId, position: { gte: position } },
      data: { position: { increment: 1 } },
    }),
    prisma.homeSection.create({
      data: { tenantId, position, ...data },
    }),
  ])
}

/**
 * Resolve a posição da âncora canônica "Sua escola no bolso"
 * (institutional/learn_anywhere) de um escopo — EJA e Idiomas nascem
 * imediatamente antes dela (ordem pedida: ... Administrativo → EJA → Idiomas →
 * Sua escola no bolso → ...). Retorna `null` quando a âncora não existe.
 */
async function learnAnywherePosition(
  tenantId: string | null,
): Promise<number | null> {
  const rows = await prisma.homeSection.findMany({
    where: { tenantId, kind: "institutional" },
    orderBy: { position: "asc" },
    select: { position: true, config: true },
  })
  const anchor = rows.find(
    (r) => (r.config as { variant?: string } | null)?.variant === "learn_anywhere",
  )
  return anchor?.position ?? null
}

async function lastPosition(tenantId: string | null): Promise<number> {
  const last = await prisma.homeSection.findFirst({
    where: { tenantId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  return last?.position ?? -1
}

/**
 * Resolve a posição da âncora "Depoimentos" (institutional/testimonials) — a
 * Técnica nasce imediatamente antes dela na ordem canônica (... final_cta →
 * Técnica → Depoimentos). Retorna `null` quando a âncora não existe.
 */
async function testimonialsPosition(
  tenantId: string | null,
): Promise<number | null> {
  const rows = await prisma.homeSection.findMany({
    where: { tenantId, kind: "institutional" },
    orderBy: { position: "asc" },
    select: { position: true, config: true },
  })
  const anchor = rows.find(
    (r) => (r.config as { variant?: string } | null)?.variant === "testimonials",
  )
  return anchor?.position ?? null
}

// ---------------------------------------------------------------------------
// Ordem canônica da home (espelha a migration 20260620_eja_idiomas_reposition)
// ---------------------------------------------------------------------------

/** ids estáveis das 3 seções de categoria que entram na ordem canônica. */
const CANONICAL_CATEGORY_PMB_IDS = {
  informatica: "pmb-cat-informatica",
  administrativo: "pmb-cat-administrativo",
  diversas: "pmb-cat-diversas",
} as const

interface CanonicalCategoryIds {
  inf: string | null
  adm: string | null
  div: string | null
}

async function canonicalCategoryIds(): Promise<CanonicalCategoryIds> {
  const rows = await prisma.homeSection.findMany({
    where: { id: { in: Object.values(CANONICAL_CATEGORY_PMB_IDS) } },
    select: { id: true, config: true },
  })
  const categoryId = (id: string) => {
    const r = rows.find((x) => x.id === id)
    return (r?.config as { categoryId?: string } | null)?.categoryId ?? null
  }
  return {
    inf: categoryId(CANONICAL_CATEGORY_PMB_IDS.informatica),
    adm: categoryId(CANONICAL_CATEGORY_PMB_IDS.administrativo),
    div: categoryId(CANONICAL_CATEGORY_PMB_IDS.diversas),
  }
}

/**
 * "Faixa" canônica de uma seção (menor = mais acima na home). Reproduz a ordem
 * pedida: Benefícios → Mais vendidos → Informática → Qual profissão →
 * Administrativo → EJA → Idiomas → Sua escola no bolso → Diversas → Sua nova
 * profissão → Técnica → Depoimentos. Seções fora da ordem (ex.: categorias
 * extras) caem na faixa 1000 e mantêm a ordem relativa entre si.
 */
function canonicalRank(
  section: { kind: string; config: unknown },
  cats: CanonicalCategoryIds,
): number {
  const cfg = (section.config ?? {}) as { variant?: string; categoryId?: string }
  switch (section.kind) {
    case "institutional":
      if (cfg.variant === "trust_bar") return 0
      if (cfg.variant === "learn_anywhere") return 7
      if (cfg.variant === "final_cta") return 9
      if (cfg.variant === "testimonials") return 11
      return 1000
    case "bestsellers":
      return 1
    case "packages":
      return 1.5
    case "category_courses":
      if (cats.inf && cfg.categoryId === cats.inf) return 2
      if (cats.adm && cfg.categoryId === cats.adm) return 4
      if (cats.div && cfg.categoryId === cats.div) return 8
      return 1000
    case "categories_grid":
      return 3
    case "eja":
      return 5
    case "idiomas":
      return 6
    case "tecnica":
      return 10
    default:
      return 1000
  }
}

/**
 * Renumera um escopo para a ordem canônica (estável: empates preservam a ordem
 * relativa atual). Usado como fonte única em código (seed/admin); o estado de
 * prod já é normalizado pela migration. Idempotente.
 */
export async function reorderScopeToCanonical(
  tenantId: string | null,
): Promise<void> {
  const cats = await canonicalCategoryIds()
  const sections = await prisma.homeSection.findMany({
    where: { tenantId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, config: true, position: true },
  })
  const sorted = sections
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const diff = canonicalRank(a.s, cats) - canonicalRank(b.s, cats)
      return diff !== 0 ? diff : a.i - b.i
    })
    .map((x) => x.s)
  const updates = sorted
    .map((s, idx) => ({ id: s.id, pos: idx, oldPos: s.position }))
    .filter((u) => u.oldPos !== u.pos)
  if (updates.length === 0) return
  await prisma.$transaction(
    updates.map((u) =>
      prisma.homeSection.update({
        where: { id: u.id },
        data: { position: u.pos },
      }),
    ),
  )
}

/**
 * Garante (idempotente) a linha singleton kind="eja" para um escopo. Posiciona
 * no slot canônico: imediatamente ANTES de "Idiomas" (se existir) ou da âncora
 * "Sua escola no bolso"; sem âncora, cai no fim. `enabled` espelha o flag
 * eja_enabled correspondente (SystemSettings para PMB; Tenant para revendedor).
 */
export async function ensureEjaSection(
  tenantId: string | null,
): Promise<void> {
  const existing = await prisma.homeSection.findFirst({
    where: { tenantId, kind: "eja" },
    select: { id: true },
  })
  if (existing) return

  let enabled = false
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ejaEnabled: true },
    })
    enabled = tenant?.ejaEnabled ?? false
  } else {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { ejaEnabled: true },
    })
    enabled = settings?.ejaEnabled ?? false
  }

  // EJA fica logo antes de Idiomas (se já existir) — garante EJA→Idiomas
  // independente da ordem de criação. Senão, antes da âncora; senão, no fim.
  const idiomas = await prisma.homeSection.findFirst({
    where: { tenantId, kind: "idiomas" },
    select: { position: true },
  })
  const position =
    idiomas?.position ??
    (await learnAnywherePosition(tenantId)) ??
    (await lastPosition(tenantId)) + 1
  await createSectionAt(tenantId, position, {
    kind: "eja",
    enabled,
    config: { kind: "eja" },
  })
}

/**
 * Sincroniza o flag de exibição da seção EJA na home com o estado configurado
 * (admin/painel). Garante que a linha singleton kind="eja" exista e seta seu
 * `enabled` — a fonte de verdade da renderização é o `HomeSection.enabled`
 * (ver `dynamic-home-sections`), NÃO o `Tenant.ejaEnabled`. Sem isto, ligar o
 * EJA no admin (que grava só `Tenant.ejaEnabled/ejaUrl`) não surtia efeito em
 * unidades cuja linha já existia com enabled=false (criada pela migration ou
 * por clone do PMB). Idempotente.
 */
export async function setEjaSectionEnabled(
  tenantId: string | null,
  enabled: boolean,
): Promise<void> {
  await ensureEjaSection(tenantId)
  await prisma.homeSection.updateMany({
    where: { tenantId, kind: "eja" },
    data: { enabled },
  })
}

/**
 * Garante (idempotente) a linha singleton kind="idiomas" para um escopo.
 * Posiciona no slot canônico: imediatamente antes da âncora "Sua escola no
 * bolso" (logo após EJA); sem âncora, logo após o EJA se existir; senão, no
 * fim. Nasce ativada. Conteúdo (courseIds) é padronizado pela PMB; a linha do
 * tenant é só posição + enabled e lê os cursos do PMB no render.
 */
export async function ensureIdiomasSection(
  tenantId: string | null,
): Promise<void> {
  const existing = await prisma.homeSection.findFirst({
    where: { tenantId, kind: "idiomas" },
    select: { id: true },
  })
  if (existing) return

  const anchor = await learnAnywherePosition(tenantId)
  let position: number
  if (anchor != null) {
    position = anchor
  } else {
    const eja = await prisma.homeSection.findFirst({
      where: { tenantId, kind: "eja" },
      select: { position: true },
    })
    position =
      eja != null ? eja.position + 1 : (await lastPosition(tenantId)) + 1
  }
  await createSectionAt(tenantId, position, {
    kind: "idiomas",
    enabled: true,
    config: { kind: "idiomas", title: "Idiomas", subtitle: "", courseIds: [] },
  })
}
