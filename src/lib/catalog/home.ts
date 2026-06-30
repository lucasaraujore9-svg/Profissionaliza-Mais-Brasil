import { prisma } from "@/lib/prisma"
import type { Course } from "@/components/main/home/course-card"
import { COURSE_HAS_PRICE } from "./visibility"
import { interestFreeLabel } from "@/lib/mercadopago/installments"
import { getSystemSettings } from "@/lib/system-settings"

interface RawCourse {
  slug: string
  nome: string
  categoriaLoja: string | null
  qtdAulas: number
  cargaHoraria: string | null
  precoVitrineMain: number | null
  precoPromocional: number | null
  precoOriginal: number | null
  capaImageUrl: string | null
  capaOverride: string | null
  parcelasSugeridas: number | null
  parcelasOverride: number | null
}

function formatPrice(value: number | null): string {
  if (value == null || value <= 0) return "Consulte"
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

function pickPrice(c: Pick<RawCourse, "precoVitrineMain" | "precoPromocional" | "precoOriginal">): number {
  return (
    Number(c.precoVitrineMain ?? 0) ||
    Number(c.precoPromocional ?? 0) ||
    Number(c.precoOriginal ?? 0)
  )
}

function toCourse(
  c: RawCourse,
  idx: number,
  selo?: Course["selo"],
  /** Nº global de parcelas sem juros da PMB (SystemSettings). Fonte do "Nx sem juros". */
  interestFree?: number | null,
): Course {
  return {
    slug: c.slug,
    categoria: c.categoriaLoja ?? "Curso profissionalizante",
    titulo: c.nome,
    horas: c.cargaHoraria ? `${c.cargaHoraria}h` : `${c.qtdAulas} aulas`,
    preco: formatPrice(pickPrice(c)),
    parcelas: interestFreeLabel(interestFree) ?? "",
    selo: selo ?? null,
    accent: idx % 2 === 0 ? "gold" : "green",
    imageUrl: c.capaOverride ?? c.capaImageUrl,
  }
}

const SELECT = {
  slug: true,
  nome: true,
  categoriaLoja: true,
  qtdAulas: true,
  cargaHoraria: true,
  precoVitrineMain: true,
  precoPromocional: true,
  precoOriginal: true,
  capaImageUrl: true,
  capaOverride: true,
  parcelasSugeridas: true,
  parcelasOverride: true,
} as const

type DbRow = {
  slug: string
  nome: string
  categoriaLoja: string | null
  qtdAulas: number
  cargaHoraria: string | null
  precoVitrineMain: unknown
  precoPromocional: unknown
  precoOriginal: unknown
  capaImageUrl: string | null
  capaOverride: string | null
  parcelasSugeridas: number | null
  parcelasOverride: number | null
}

function normalize(c: DbRow): RawCourse {
  return {
    slug: c.slug,
    nome: c.nome,
    categoriaLoja: c.categoriaLoja,
    qtdAulas: c.qtdAulas,
    cargaHoraria: c.cargaHoraria,
    capaImageUrl: c.capaImageUrl,
    capaOverride: c.capaOverride,
    parcelasSugeridas: c.parcelasSugeridas,
    parcelasOverride: c.parcelasOverride,
    precoVitrineMain: c.precoVitrineMain ? Number(c.precoVitrineMain) : null,
    precoPromocional: c.precoPromocional ? Number(c.precoPromocional) : null,
    precoOriginal: c.precoOriginal ? Number(c.precoOriginal) : null,
  }
}

export async function loadCurated(take = 8): Promise<Course[]> {
  try {
    const [featured, settings] = await Promise.all([
      prisma.course.findMany({
        where: { destaque: true, status: "ATIVO", hiddenMain: false, AND: [COURSE_HAS_PRICE] },
        orderBy: { nome: "asc" },
        take,
        select: SELECT,
      }),
      getSystemSettings(),
    ])
    const ifree = settings.pmbInterestFreeInstallments

    if (featured.length >= take) {
      return featured.map((c, idx) =>
        toCourse(normalize(c), idx, idx === 0 ? "mais-vendido" : null, ifree),
      )
    }

    const fill = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        hiddenMain: false,
        destaque: false,
        AND: [COURSE_HAS_PRICE],
      },
      orderBy: { nome: "asc" },
      take: take - featured.length,
      select: SELECT,
    })

    return [...featured, ...fill].map((c, idx) =>
      toCourse(normalize(c), idx, idx === 0 ? "mais-vendido" : null, ifree),
    )
  } catch {
    return []
  }
}

export async function loadByCategoria(
  slugOrName: string,
  take = 8,
): Promise<Course[]> {
  try {
    // Resolve para Category preferindo slug; fallback para name (insensitive).
    const category = await prisma.category.findFirst({
      where: {
        OR: [
          { slug: slugOrName },
          { name: { equals: slugOrName, mode: "insensitive" } },
        ],
        isActive: true,
      },
      select: { id: true },
    })
    if (!category) return []

    const [rows, settings] = await Promise.all([
      prisma.course.findMany({
        where: {
          status: "ATIVO",
          hiddenMain: false,
          categoryLinks: { some: { categoryId: category.id } },
          AND: [COURSE_HAS_PRICE],
        },
        orderBy: { nome: "asc" },
        take,
        select: SELECT,
      }),
      getSystemSettings(),
    ])
    return rows.map((c, idx) =>
      toCourse(normalize(c), idx, undefined, settings.pmbInterestFreeInstallments),
    )
  } catch {
    return []
  }
}

export interface CategoriaInfo {
  nome: string
  slug: string
  count: number
}

// Overrides para deixar URLs amigaveis em categorias com nomes longos vindos
// da plataforma parceira. Qualquer categoria nao listada cai no slugify
// generico (NFD + lower + a-z0-9-) abaixo.
const CATEGORIA_SLUG_OVERRIDES: Record<string, string> = {
  "INFORMÁTICA E TECNOLOGIA": "informatica",
  "DIVERSAS ÁREAS": "diversas",
  ADMINISTRATIVO: "administrativo",
  PREPARATÓRIOS: "preparatorios",
  IDIOMAS: "idiomas",
}

export function slugifyCategoria(nome: string): string {
  const override = CATEGORIA_SLUG_OVERRIDES[nome.toUpperCase()]
  if (override) return override
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function loadCategorias(minCount = 0): Promise<CategoriaInfo[]> {
  try {
    // Fonte canonica: tabela Category curada pelo admin. Por padrao lista
    // TODAS as categorias ativas no menu (sistema mae e revendas), inclusive
    // as que ainda nao tem cursos. `minCount` opcional permite filtrar por um
    // numero minimo de cursos visiveis quando o contexto exigir. Ordena por
    // displayOrder primeiro, depois alfabetico.
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        name: true,
        slug: true,
        _count: {
          select: {
            courseLinks: {
              where: {
                course: { status: "ATIVO", hiddenMain: false, AND: [COURSE_HAS_PRICE] },
              },
            },
          },
        },
      },
    })

    return categories
      .filter((c) => c._count.courseLinks >= minCount)
      .map((c) => ({
        nome: c.name,
        slug: c.slug,
        count: c._count.courseLinks,
      }))
  } catch {
    return []
  }
}

export interface ShowcaseCard {
  slug: string
  titulo: string
  categoria: string
  preco: string
  imageUrl: string | null
  selo: "novo" | "mais-vendido"
  accent: "gold" | "cyan" | "lime"
  /** MONTHLY exibe o preco como mensalidade recorrente (sufixo "/mês"). */
  paymentType?: "ONE_TIME" | "MONTHLY"
}

export async function loadCatalogo({
  q,
  categoriaSlug,
  take,
}: {
  q?: string
  categoriaSlug?: string
  take?: number
}): Promise<{ cursos: Course[]; total: number }> {
  try {
    const where: Record<string, unknown> = {
      status: "ATIVO",
      hiddenMain: false,
      // Regra: curso sem valor nao aparece. AND para nao colidir com o OR da busca.
      AND: [COURSE_HAS_PRICE],
    }

    if (q && q.trim()) {
      where.OR = [
        { nome: { contains: q.trim(), mode: "insensitive" } },
        { descricao: { contains: q.trim(), mode: "insensitive" } },
      ]
    }

    if (categoriaSlug) {
      // Resolve slug → Category. Categoria inativa nao filtra (retorna vazio).
      const category = await prisma.category.findUnique({
        where: { slug: categoriaSlug },
        select: { id: true, isActive: true },
      })
      if (!category || !category.isActive) return { cursos: [], total: 0 }
      where.categoryLinks = { some: { categoryId: category.id } }
    }

    const [rows, total, settings] = await Promise.all([
      prisma.course.findMany({
        where,
        orderBy: [{ destaqueHome: "desc" }, { destaque: "desc" }, { nome: "asc" }],
        ...(take ? { take } : {}),
        select: SELECT,
      }),
      prisma.course.count({ where }),
      getSystemSettings(),
    ])

    return {
      cursos: rows.map((c, idx) =>
        toCourse(normalize(c), idx, undefined, settings.pmbInterestFreeInstallments),
      ),
      total,
    }
  } catch {
    return { cursos: [], total: 0 }
  }
}

/**
 * Filtro de visibilidade granular do catalogo de um tenant (espelha
 * `visibilityFilter` de src/lib/tenant/courses.ts). Mantido inline aqui para
 * evitar dependencia cruzada entre os modulos de catalogo.
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

/**
 * Showcase do hero.
 *
 * - Sem `tenantId` (site principal PMB): destaques globais do catalogo
 *   institucional (`Course` com `hiddenMain: false`).
 * - Com `tenantId` (vitrine de revendedor): SOMENTE cursos habilitados para
 *   aquele tenant (`TenantCourse.isVisible` + `visibilityMode`), com o preco
 *   e a capa configurados pela loja. Sem isso, a vitrine do revendedor exibia
 *   o catalogo global PMB com preco PMB (vazamento/inconsistencia cross-tenant).
 */
export async function loadShowcase(tenantId?: string): Promise<ShowcaseCard[]> {
  if (tenantId) return loadTenantShowcase(tenantId)
  try {
    const rows = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        hiddenMain: false,
        destaque: true,
        capaImageUrl: { not: null },
        AND: [COURSE_HAS_PRICE],
      },
      orderBy: { nome: "asc" },
      take: 6,
      select: SELECT,
    })

    if (rows.length < 3) {
      const fill = await prisma.course.findMany({
        where: {
          status: "ATIVO",
          hiddenMain: false,
          capaImageUrl: { not: null },
          AND: [COURSE_HAS_PRICE],
        },
        orderBy: { nome: "asc" },
        take: 3 - rows.length,
        select: SELECT,
      })
      rows.push(...fill)
    }

    const accents: ShowcaseCard["accent"][] = ["gold", "cyan", "lime"]
    const selos: ShowcaseCard["selo"][] = ["mais-vendido", "mais-vendido", "novo"]

    return rows.slice(0, 3).map((c, idx) => {
      const n = normalize(c)
      return {
        slug: n.slug,
        titulo: n.nome,
        categoria: n.categoriaLoja ?? "Curso profissionalizante",
        preco: formatPrice(pickPrice(n)),
        imageUrl: n.capaImageUrl,
        selo: selos[idx],
        accent: accents[idx],
      }
    })
  } catch {
    return []
  }
}

async function loadTenantShowcase(tenantId: string): Promise<ShowcaseCard[]> {
  try {
    const visibility = tenantVisibilityFilter(tenantId)
    const rows = await prisma.tenantCourse.findMany({
      where: {
        tenantId,
        isVisible: true,
        // Regra: curso sem valor nao aparece — na revenda o preco e tc.price.
        price: { gt: 0 },
        course: { status: "ATIVO", capaImageUrl: { not: null }, ...visibility },
      },
      orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }],
      take: 3,
      include: {
        course: {
          select: { slug: true, nome: true, categoriaLoja: true, capaImageUrl: true, capaOverride: true },
        },
      },
    })

    const accents: ShowcaseCard["accent"][] = ["gold", "cyan", "lime"]
    const selos: ShowcaseCard["selo"][] = ["mais-vendido", "mais-vendido", "novo"]

    return rows.map((tc, idx) => ({
      slug: tc.course.slug,
      titulo: tc.course.nome,
      categoria: tc.course.categoriaLoja ?? "Curso profissionalizante",
      preco: formatPrice(Number(tc.price)),
      imageUrl: tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
      selo: selos[idx] ?? "novo",
      accent: accents[idx] ?? "gold",
      paymentType: tc.paymentType,
    }))
  } catch {
    return []
  }
}
