import { prisma } from "@/lib/prisma"
import type { Course } from "@/components/main/home/course-card"

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

function toCourse(c: RawCourse, idx: number, selo?: Course["selo"]): Course {
  const parcelas = c.parcelasOverride ?? c.parcelasSugeridas
  return {
    slug: c.slug,
    categoria: c.categoriaLoja ?? "Curso profissionalizante",
    titulo: c.nome,
    horas: c.cargaHoraria ? `${c.cargaHoraria}h` : `${c.qtdAulas} aulas`,
    preco: formatPrice(pickPrice(c)),
    parcelas: parcelas ? `${parcelas}x sem juros` : "12x sem juros",
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
    const featured = await prisma.course.findMany({
      where: { destaque: true, status: "ATIVO", hiddenMain: false },
      orderBy: { nome: "asc" },
      take,
      select: SELECT,
    })

    if (featured.length >= take) {
      return featured.map((c, idx) =>
        toCourse(normalize(c), idx, idx === 0 ? "mais-vendido" : null),
      )
    }

    const fill = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        hiddenMain: false,
        destaque: false,
      },
      orderBy: { nome: "asc" },
      take: take - featured.length,
      select: SELECT,
    })

    return [...featured, ...fill].map((c, idx) =>
      toCourse(normalize(c), idx, idx === 0 ? "mais-vendido" : null),
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

    const rows = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        hiddenMain: false,
        categoryId: category.id,
      },
      orderBy: { nome: "asc" },
      take,
      select: SELECT,
    })
    return rows.map((c, idx) => toCourse(normalize(c), idx))
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

export async function loadCategorias(minCount = 3): Promise<CategoriaInfo[]> {
  try {
    // Fonte canonica: tabela Category curada pelo admin. So lista categorias
    // ativas que possuam pelo menos `minCount` cursos visiveis na vitrine
    // principal. Ordena por displayOrder primeiro, depois alfabetico.
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        name: true,
        slug: true,
        _count: {
          select: {
            courses: {
              where: { status: "ATIVO", hiddenMain: false },
            },
          },
        },
      },
    })

    return categories
      .filter((c) => c._count.courses >= minCount)
      .map((c) => ({
        nome: c.name,
        slug: c.slug,
        count: c._count.courses,
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
      where.categoryId = category.id
    }

    const [rows, total] = await Promise.all([
      prisma.course.findMany({
        where,
        orderBy: [{ destaqueHome: "desc" }, { destaque: "desc" }, { nome: "asc" }],
        ...(take ? { take } : {}),
        select: SELECT,
      }),
      prisma.course.count({ where }),
    ])

    return {
      cursos: rows.map((c, idx) => toCourse(normalize(c), idx)),
      total,
    }
  } catch {
    return { cursos: [], total: 0 }
  }
}

export async function loadShowcase(): Promise<ShowcaseCard[]> {
  try {
    const rows = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        hiddenMain: false,
        destaque: true,
        capaImageUrl: { not: null },
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
