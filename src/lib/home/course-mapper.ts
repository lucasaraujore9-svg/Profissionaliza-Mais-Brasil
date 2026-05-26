import type { Course } from "@/components/main/home/course-card"

/**
 * Mappeia rows do Prisma para o shape `Course` consumido pelos cards da home.
 * Extraído de catalog/home.ts para ser reusado pelo loader de home_sections.
 */

export const courseSelect = {
  id: true,
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

interface RawCourse {
  id: string
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

type DbRow = {
  id: string
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

export function normalizeCourseRow(c: DbRow): RawCourse {
  return {
    id: c.id,
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

function formatPrice(value: number | null): string {
  if (value == null || value <= 0) return "Consulte"
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

function pickPrice(
  c: Pick<RawCourse, "precoVitrineMain" | "precoPromocional" | "precoOriginal">,
): number {
  return (
    Number(c.precoVitrineMain ?? 0) ||
    Number(c.precoPromocional ?? 0) ||
    Number(c.precoOriginal ?? 0)
  )
}

export function toCourse(
  c: RawCourse,
  idx: number,
  selo: Course["selo"] | null,
): Course {
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
