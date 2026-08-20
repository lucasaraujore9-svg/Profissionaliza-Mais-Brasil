import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { contextLogger } from "@/lib/logger"
import { effectivePaymentType, type MonthlyPolicy } from "@/lib/tenant/monthly-policy"
import { displayInterestFreeInstallments } from "@/lib/mercadopago/installments"

/**
 * Politica de exibicao da unidade: parcelado/mensalidade + nº GLOBAL de parcelas
 * sem juros (Tenant.interestFreeInstallments) que governa o texto "Nx sem juros"
 * de pagamento unico em toda a vitrine.
 */
type TenantDisplayPolicy = MonthlyPolicy & { interestFreeInstallments: number }

const DISPLAY_POLICY_BLOCKED: TenantDisplayPolicy = {
  monthlyAllowed: false,
  monthlyEnabled: false,
  monthlyScope: "DIRECT_ONLY",
  interestFreeInstallments: 1,
}

/**
 * Politica de parcelado/mensalidade da unidade. Na vitrine (compra self-service
 * do lead), o MONTHLY so vale quando a unidade tem o parcelado ativo E o escopo
 * inclui a vitrine. Quando ausente, assume bloqueado. Carrega tambem o nº global
 * de parcelas sem juros da unidade (fonte unica do "Nx sem juros" exibido).
 */
async function loadMonthlyPolicy(tenantId: string): Promise<TenantDisplayPolicy> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      monthlyAllowed: true,
      monthlyEnabled: true,
      monthlyScope: true,
      interestFreeInstallments: true,
    },
  })
  return t ?? DISPLAY_POLICY_BLOCKED
}

export interface TenantCourseListItem {
  id: string
  /** Id do Course global (chave de match em Enrollment.courseId). */
  courseId: string
  slug: string
  nome: string
  descricao: string | null
  categoria: string | null
  horas: string | null
  price: number
  originalPrice: number | null
  imageUrl: string | null
  parcelas: number | null
  isFeatured: boolean
  /** ONE_TIME = preco cheio; MONTHLY = mensalidade recorrente. */
  paymentType: "ONE_TIME" | "MONTHLY"
  /** Quantidade total de mensalidades quando paymentType === "MONTHLY". */
  monthlyMonths: number | null
}

interface ListFilters {
  tenantId: string
  category?: string
  search?: string
  limit?: number
  offset?: number
}

/**
 * Filtro aplicado em todas as queries de catalogo do tenant para respeitar
 * a visibilidade granular (`Course.visibilityMode`):
 *   - ALL       → todos podem ver (sem restricao)
 *   - ALLOWLIST → so se o tenant estiver em `allowedTenantIds`
 *   - DENYLIST  → todos exceto se o tenant estiver em `blockedTenantIds`
 */
/**
 * Um curso do catalogo mae so alcanca a vitrine de uma unidade se a curadoria
 * da PMB permitir. Exportado para que a resolucao de escopo das ASSINATURAS
 * (lib/subscriptions/scope.ts) aplique exatamente o mesmo criterio — uma quarta
 * copia desta regra divergiria no primeiro ajuste.
 */
export function visibilityFilter(tenantId: string): Prisma.CourseWhereInput {
  return {
    OR: [
      { visibilityMode: "ALL" },
      { visibilityMode: "ALLOWLIST", allowedTenantIds: { has: tenantId } },
      { visibilityMode: "DENYLIST", NOT: { blockedTenantIds: { has: tenantId } } },
    ],
  }
}

/**
 * Colunas de `Course` efetivamente lidas por `mapTenantCourseItem` (card da
 * vitrine). PERF-003: substitui `include: { course: true }` (que trafegava TODA
 * a linha `Course`, incluindo descricao longa/matriz/campos internos) por um
 * `select` enxuto — só o que o card renderiza.
 */
const CARD_COURSE_SELECT = {
  slug: true,
  nome: true,
  descricao: true,
  descricaoOverride: true,
  categoriaLoja: true,
  categoriaInterna: true,
  cargaHoraria: true,
  precoOriginal: true,
  capaOverride: true,
  capaImageUrl: true,
  parcelasOverride: true,
  parcelasSugeridas: true,
  monthlyMonthsMain: true,
} satisfies Prisma.CourseSelect

type TenantCourseWithCourse = Prisma.TenantCourseGetPayload<{
  include: { course: { select: typeof CARD_COURSE_SELECT } }
}>

/**
 * Mapeia um `TenantCourse` (com `course` incluido) para o item de catalogo
 * exibido na vitrine, aplicando a hierarquia de override tenant > admin >
 * plataforma bruto. Centralizado para que listagem e catalogo sejam consistentes.
 */
function mapTenantCourseItem(
  tc: TenantCourseWithCourse,
  policy: TenantDisplayPolicy,
): TenantCourseListItem {
  // Quantidade de mensalidades (MONTHLY) configurada pela unidade. Para MONTHLY o
  // painel edita customParcelas como "quantidade de mensalidades"; por isso
  // monthlyMonths o respeita, com fallback no override admin/global.
  const effectiveParcelas =
    tc.customParcelas ??
    tc.course.parcelasOverride ??
    tc.course.parcelasSugeridas
  const paymentType = effectivePaymentType(tc.paymentType, policy, "vitrine")
  const monthlyMonths = effectiveParcelas ?? tc.course.monthlyMonthsMain
  return {
    id: tc.id,
    courseId: tc.courseId,
    slug: tc.course.slug,
    nome: tc.course.nome,
    descricao:
      tc.customDescription ??
      tc.course.descricaoOverride ??
      tc.course.descricao,
    categoria: tc.course.categoriaLoja ?? tc.course.categoriaInterna,
    horas: tc.course.cargaHoraria,
    price: Number(tc.price),
    originalPrice: tc.course.precoOriginal
      ? Number(tc.course.precoOriginal)
      : null,
    imageUrl:
      tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
    // Pagamento único: "Nx sem juros" vem do nº GLOBAL da unidade (não por curso).
    // Mensalidade: o número exibido é a quantidade de mensalidades.
    parcelas:
      paymentType === "MONTHLY"
        ? monthlyMonths
        : displayInterestFreeInstallments(policy.interestFreeInstallments),
    isFeatured: tc.isFeatured,
    paymentType,
    monthlyMonths,
  }
}

export async function listTenantCourses(
  filters: ListFilters,
): Promise<{ items: TenantCourseListItem[]; total: number }> {
  const where: Prisma.TenantCourseWhereInput = {
    tenantId: filters.tenantId,
    isVisible: true,
    // Regra: curso sem valor nao aparece (preco da revenda = TenantCourse.price).
    price: { gt: 0 },
    course: {
      status: "ATIVO",
      ...visibilityFilter(filters.tenantId),
      ...(filters.category && filters.category !== "todos"
        ? {
            categoriaLoja: {
              equals: filters.category,
              mode: "insensitive",
            },
          }
        : {}),
      ...(filters.search
        ? { nome: { contains: filters.search, mode: "insensitive" } }
        : {}),
    },
  }

  try {
    const [items, total, monthly] = await Promise.all([
      prisma.tenantCourse.findMany({
        where,
        include: { course: { select: CARD_COURSE_SELECT } },
        orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }],
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
      }),
      prisma.tenantCourse.count({ where }),
      loadMonthlyPolicy(filters.tenantId),
    ])

    return {
      total,
      items: items.map((tc) => mapTenantCourseItem(tc, monthly)),
    }
  } catch (error) {
    contextLogger().error(
      { err: error, event: "tenant.listCourses_failed" },
      "listTenantCourses falhou",
    )
    return { items: [], total: 0 }
  }
}

export interface TenantCatalogCategory {
  nome: string
  slug: string
}

/**
 * Categorias (Category) que possuem ao menos um curso visivel na vitrine deste
 * tenant. Usa slug+name canonicos da Category (mesma fonte do menu), para que os
 * filtros do catalogo da loja casem com os links `/cursos?categoria={slug}`.
 */
async function tenantCatalogCategories(
  tenantId: string,
): Promise<TenantCatalogCategory[]> {
  const cats = await prisma.category.findMany({
    where: {
      isActive: true,
      courseLinks: {
        some: {
          course: {
            status: "ATIVO",
            ...visibilityFilter(tenantId),
            tenantCourses: { some: { tenantId, isVisible: true, price: { gt: 0 } } },
          },
        },
      },
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { name: true, slug: true },
  })
  return cats.map((c) => ({ nome: c.name, slug: c.slug }))
}

/**
 * Catalogo completo da vitrine do revendedor ("todos os cursos"). Diferente de
 * `loadCatalogo` (catalogo global PMB), respeita o tenant: so cursos com
 * `TenantCourse.isVisible` + `visibilityMode`, com preco/capa da unidade. O
 * filtro de categoria recebe o SLUG da Category (resolvido para categoryId),
 * coerente com os links do menu e da home.
 */
export async function listTenantCatalog(args: {
  tenantId: string
  categorySlug?: string
  search?: string
  /** PERF-003: paginacao server-side (default: sem teto para compat, mas a page passa `take`). */
  take?: number
  skip?: number
}): Promise<{
  items: TenantCourseListItem[]
  total: number
  categories: TenantCatalogCategory[]
}> {
  const { tenantId, categorySlug, search, take, skip } = args
  try {
    let categoryId: string | undefined
    if (categorySlug && categorySlug !== "todos") {
      const cat = await prisma.category.findUnique({
        where: { slug: categorySlug },
        select: { id: true, isActive: true },
      })
      // Categoria inexistente/inativa: catalogo vazio, mas ainda mostra os pills.
      if (!cat || !cat.isActive) {
        return { items: [], total: 0, categories: await tenantCatalogCategories(tenantId) }
      }
      categoryId = cat.id
    }

    const where: Prisma.TenantCourseWhereInput = {
      tenantId,
      isVisible: true,
      // Regra: curso sem valor nao aparece (preco da revenda = TenantCourse.price).
      price: { gt: 0 },
      course: {
        status: "ATIVO",
        ...visibilityFilter(tenantId),
        ...(categoryId ? { categoryLinks: { some: { categoryId } } } : {}),
        ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
      },
    }

    const [rows, total, categories, monthly] = await Promise.all([
      prisma.tenantCourse.findMany({
        where,
        include: { course: { select: CARD_COURSE_SELECT } },
        orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }, { course: { nome: "asc" } }],
        ...(take != null ? { take } : {}),
        ...(skip != null ? { skip } : {}),
      }),
      prisma.tenantCourse.count({ where }),
      tenantCatalogCategories(tenantId),
      loadMonthlyPolicy(tenantId),
    ])

    return {
      items: rows.map((tc) => mapTenantCourseItem(tc, monthly)),
      total,
      categories,
    }
  } catch (error) {
    contextLogger().error(
      { err: error, event: "tenant.listCatalog_failed", tenantId },
      "listTenantCatalog falhou",
    )
    return { items: [], total: 0, categories: [] }
  }
}

export interface TenantCourseDetail extends TenantCourseListItem {
  tenantCourseId: string
  qtdAulas: number
  parcelasSugeridas: number | null
  plataformaCourseId: string | null
  lessons: Array<{ id: string; nome: string; ordem: number }>
  /** Matriz curricular oficial (conteúdo global PMB). Vazia => curso sem matriz. */
  matriz: string[]
  /**
   * "O que você vai aprender" já resolvido: override da revenda quando existe,
   * senão o padrão da PMB. Vazio => a página usa o texto genérico.
   */
  aprendizado: string[]
}

export async function getTenantCourseBySlug(
  tenantId: string,
  slug: string,
): Promise<TenantCourseDetail | null> {
  try {
    const tc = await prisma.tenantCourse.findFirst({
      where: {
        tenantId,
        isVisible: true,
        // Regra: curso sem valor nao e exibido — detalhe tambem 404 (page chama notFound).
        price: { gt: 0 },
        course: { status: "ATIVO", slug, ...visibilityFilter(tenantId) },
      },
      include: {
        course: {
          include: {
            courseLessons: { orderBy: { ordem: "asc" } },
          },
        },
      },
    })

    if (!tc) return null

    const monthly = await loadMonthlyPolicy(tenantId)

    // Quantidade de mensalidades (MONTHLY). Em pagamento único o "Nx sem juros"
    // vem do nº global da unidade — ver mapTenantCourseItem.
    const effectiveParcelas =
      tc.customParcelas ??
      tc.course.parcelasOverride ??
      tc.course.parcelasSugeridas
    const paymentType = effectivePaymentType(tc.paymentType, monthly, "vitrine")
    const monthlyMonths = effectiveParcelas ?? tc.course.monthlyMonthsMain
    const displayParcelas =
      paymentType === "MONTHLY"
        ? monthlyMonths
        : displayInterestFreeInstallments(monthly.interestFreeInstallments)

    return {
      id: tc.id,
      courseId: tc.courseId,
      tenantCourseId: tc.id,
      slug: tc.course.slug,
      nome: tc.course.nome,
      descricao:
        tc.customDescription ??
        tc.course.descricaoOverride ??
        tc.course.descricao,
      categoria: tc.course.categoriaLoja ?? tc.course.categoriaInterna,
      horas: tc.course.cargaHoraria,
      price: Number(tc.price),
      originalPrice: tc.course.precoOriginal
        ? Number(tc.course.precoOriginal)
        : null,
      imageUrl:
        tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
      parcelas: displayParcelas,
      isFeatured: tc.isFeatured,
      paymentType,
      monthlyMonths,
      qtdAulas: tc.course.qtdAulas,
      parcelasSugeridas: displayParcelas,
      plataformaCourseId: tc.course.plataformaCourseId,
      lessons: tc.course.courseLessons.map((l) => ({
        id: l.id,
        nome: l.nome,
        ordem: l.ordem,
      })),
      matriz: tc.course.matrizCurricular,
      // Hierarquia: revenda > PMB. Lista vazia da revenda = "herda a da PMB".
      aprendizado:
        tc.customAprendizado.length > 0
          ? tc.customAprendizado
          : tc.course.aprendizado,
    }
  } catch (error) {
    contextLogger().error(
      { err: error, event: "tenant.getCourseBySlug_failed" },
      "getTenantCourseBySlug falhou",
    )
    return null
  }
}

