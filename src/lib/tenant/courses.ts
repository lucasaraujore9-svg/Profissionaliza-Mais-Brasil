import { prisma } from "@/lib/prisma"
import type { ContentType, Prisma } from "@prisma/client"
import { contextLogger } from "@/lib/logger"
import { effectivePaymentType, type MonthlyPolicy } from "@/lib/tenant/monthly-policy"
import {
  ADVERTISED_INSTALLMENTS_SELECT,
  tenantAdvertisedInterestFree,
  tenantCheckoutMode,
  type CheckoutMode,
} from "@/lib/tenant/checkout-mode"
import { COURSE_PROVISIONABLE, courseCuratedForTenant } from "@/lib/catalog/visibility"

/**
 * Politica de exibicao da unidade: parcelado/mensalidade + quantas parcelas sem
 * juros a vitrine anuncia no pagamento unico ("10x de R$ 10,00 sem juros").
 */
export type TenantDisplayPolicy = MonthlyPolicy & {
  /**
   * Ja resolvido por `tenantAdvertisedInterestFree`: o nº GLOBAL da unidade
   * (Configuracoes → Pagamento) quando o checkout dela parcela o cartao; null
   * quando nao ha parcela a anunciar.
   */
  advertisedInterestFree: number | null
  /** Gateway efetivo da vitrine (MP | ASAAS | NONE). */
  checkoutMode: CheckoutMode
}

const DISPLAY_POLICY_BLOCKED: TenantDisplayPolicy = {
  monthlyAllowed: false,
  monthlyEnabled: false,
  monthlyScope: "DIRECT_ONLY",
  advertisedInterestFree: null,
  checkoutMode: "NONE",
}

/**
 * Politica de exibicao da unidade. Na vitrine (compra self-service do lead), o
 * MONTHLY so vale quando a unidade tem o parcelado ativo E o escopo inclui a
 * vitrine. Quando ausente, assume bloqueado.
 *
 * Exportada para os cards da home e do hero (lib/home/sections.ts,
 * lib/catalog/home.ts): uma copia local desta leitura foi o que deixou esses
 * cards mostrando "/mes" em curso que a vitrine cobra a vista.
 */
export async function loadTenantDisplayPolicy(
  tenantId: string,
): Promise<TenantDisplayPolicy> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      monthlyAllowed: true,
      monthlyEnabled: true,
      monthlyScope: true,
      ...ADVERTISED_INSTALLMENTS_SELECT,
    },
  })
  if (!t) return DISPLAY_POLICY_BLOCKED
  return {
    monthlyAllowed: t.monthlyAllowed,
    monthlyEnabled: t.monthlyEnabled,
    monthlyScope: t.monthlyScope,
    advertisedInterestFree: tenantAdvertisedInterestFree(t),
    checkoutMode: tenantCheckoutMode(t),
  }
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
  /** COURSE (aulas em video) | EBOOK (arquivo para ler). */
  contentType: ContentType
  /** Paginas do e-book. null = nao informado (ou nao e e-book). */
  ebookPages: number | null
}

interface ListFilters {
  tenantId: string
  category?: string
  search?: string
  limit?: number
  offset?: number
}

/**
 * Um curso do catalogo mae so alcanca a vitrine de uma unidade se a curadoria
 * da PMB permitir E se ele for matriculavel. Exportado para que a resolucao de
 * escopo das ASSINATURAS (lib/subscriptions/scope.ts) aplique exatamente o mesmo
 * criterio — uma quarta copia desta regra divergiria no primeiro ajuste.
 *
 * `COURSE_PROVISIONABLE` entra AQUI, no ponto por onde as tres consultas da
 * vitrine ja passam, e nao em cada uma delas: gate que precisa ser lembrado a
 * cada query nova e gate que uma hora fica de fora. Os dois vao em `AND`
 * porque cada um ocupa um `OR` na raiz. A curadoria (`visibilityMode`) mora em
 * `courseCuratedForTenant`, que o painel e a venda direta tambem usam.
 */
export function visibilityFilter(tenantId: string): Prisma.CourseWhereInput {
  return { AND: [COURSE_PROVISIONABLE, courseCuratedForTenant(tenantId)] }
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
  // O TIPO entra no card: quem vê uma prateleira mista precisa distinguir um
  // e-book de um curso antes de clicar — e o card do e-book troca "N aulas" por
  // "N páginas", que "0 aulas" nunca conseguiria dizer.
  contentType: true,
  ebookPages: true,
  descricao: true,
  descricaoOverride: true,
  categoriaLoja: true,
  categoriaInterna: true,
  cargaHoraria: true,
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
    // "De R$ X" da vitrine DESTA unidade. Vem de `tc.precoDe` (editavel em
    // /painel/cursos), nao do `precoOriginal` do catalogo mae — aquele e o
    // preco-base do fornecedor, reescrito pelo sync e nunca escolhido por quem
    // vende. Vazio ou <= price => sem "De".
    originalPrice:
      tc.precoDe && Number(tc.precoDe) > Number(tc.price)
        ? Number(tc.precoDe)
        : null,
    imageUrl:
      tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
    // Pagamento único: parcelas sem juros da unidade (não por curso), só quando
    // o checkout dela parcela. Mensalidade: a quantidade de mensalidades.
    parcelas:
      paymentType === "MONTHLY" ? monthlyMonths : policy.advertisedInterestFree,
    isFeatured: tc.isFeatured,
    paymentType,
    monthlyMonths,
    contentType: tc.course.contentType,
    ebookPages: tc.course.ebookPages,
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
      loadTenantDisplayPolicy(filters.tenantId),
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
      loadTenantDisplayPolicy(tenantId),
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
  /** Tempo estimado de leitura do e-book — a mesma coluna que no curso e carga horaria. */
  ebookDownloadable: boolean
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
  /**
   * Unidade que PRODUZIU o curso (`Course.authorTenantId`). null = catalogo da
   * PMB, que e a esmagadora maioria. Alimenta a nota de responsabilidade pelo
   * conteudo na pagina do curso.
   */
  authorTenantName: string | null
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
            authorTenant: { select: { name: true } },
          },
        },
      },
    })

    if (!tc) return null

    const monthly = await loadTenantDisplayPolicy(tenantId)

    // Quantidade de mensalidades (MONTHLY). Em pagamento único o "Nx sem juros"
    // vem do nº global da unidade — ver mapTenantCourseItem.
    const effectiveParcelas =
      tc.customParcelas ??
      tc.course.parcelasOverride ??
      tc.course.parcelasSugeridas
    const paymentType = effectivePaymentType(tc.paymentType, monthly, "vitrine")
    const monthlyMonths = effectiveParcelas ?? tc.course.monthlyMonthsMain
    const displayParcelas =
      paymentType === "MONTHLY" ? monthlyMonths : monthly.advertisedInterestFree

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
      originalPrice:
        tc.precoDe && Number(tc.precoDe) > Number(tc.price)
          ? Number(tc.precoDe)
          : null,
      imageUrl:
        tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
      parcelas: displayParcelas,
      isFeatured: tc.isFeatured,
      paymentType,
      monthlyMonths,
      qtdAulas: tc.course.qtdAulas,
      contentType: tc.course.contentType,
      ebookPages: tc.course.ebookPages,
      ebookDownloadable: tc.course.ebookDownloadable,
      parcelasSugeridas: displayParcelas,
      plataformaCourseId: tc.course.plataformaCourseId,
      lessons: tc.course.courseLessons.map((l) => ({
        id: l.id,
        nome: l.nome,
        ordem: l.ordem,
      })),
      matriz: tc.course.matrizCurricular,
      authorTenantName: tc.course.authorTenant?.name ?? null,
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

