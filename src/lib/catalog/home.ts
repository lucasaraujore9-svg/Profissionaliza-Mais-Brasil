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
    instrutor: "Equipe PMB",
    rating: "4.9",
    alunos: "—",
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
      where: { destaque: true, status: "ATIVO" },
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

export async function loadByCategoria(categoria: string, take = 8): Promise<Course[]> {
  try {
    const rows = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        categoriaLoja: { equals: categoria, mode: "insensitive" },
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

const CATEGORIA_SLUG_OVERRIDES: Record<string, string> = {
  "INFORMÁTICA E TECNOLOGIA": "informatica",
  "DIVERSAS ÁREAS": "diversas",
  ADMINISTRATIVO: "administrativo",
  PREPARATÓRIOS: "preparatorios",
  IDIOMAS: "idiomas",
}

function slugifyCategoria(nome: string): string {
  const override = CATEGORIA_SLUG_OVERRIDES[nome.toUpperCase()]
  if (override) return override
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const LOWER_WORDS = new Set([
  "e",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "para",
  "com",
  "em",
])

function titleCaseCategoria(nome: string): string {
  // EA retorna "INFORMÁTICA E TECNOLOGIA" em caps; converte para Title Case
  // mantendo conectores (e, de, da, do…) em minúsculo no meio do texto.
  const words = nome.toLowerCase().split(/\s+/)
  return words
    .map((w, i) => {
      if (i > 0 && LOWER_WORDS.has(w)) return w
      return w.replace(/^\p{L}/u, (m) => m.toUpperCase())
    })
    .join(" ")
}

export async function loadCategorias(minCount = 3): Promise<CategoriaInfo[]> {
  try {
    const grouped = await prisma.course.groupBy({
      by: ["categoriaLoja"],
      where: { status: "ATIVO", categoriaLoja: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { categoriaLoja: "desc" } },
    })

    return grouped
      .filter((g) => g.categoriaLoja && g._count._all >= minCount)
      .map((g) => ({
        nome: titleCaseCategoria(g.categoriaLoja!),
        slug: slugifyCategoria(g.categoriaLoja!),
        count: g._count._all,
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
  rating: string
}

export async function loadShowcase(): Promise<ShowcaseCard[]> {
  try {
    const rows = await prisma.course.findMany({
      where: {
        status: "ATIVO",
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
        rating: "4.9",
      }
    })
  } catch {
    return []
  }
}
