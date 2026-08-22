import type { Prisma } from "@prisma/client"
import { minSalePrice, producerNetAt, type AuthorTerms } from "./split"

/**
 * Forma com que um curso de autoria chega ao painel do produtor. Allowlist
 * explicita: `Course` carrega curadoria da PMB e chaves de fornecedora que nao
 * tem por que viajar para a tela da unidade.
 */
export const AUTHORED_COURSE_LIST_SELECT = {
  id: true,
  nome: true,
  slug: true,
  descricao: true,
  cargaHoraria: true,
  qtdAulas: true,
  capaImageUrl: true,
  status: true,
  authorTenantId: true,
  authorUserId: true,
  authoredStatus: true,
  distribution: true,
  pricingMode: true,
  authorAmount: true,
  sellerCommissionPercent: true,
  platformFeePercent: true,
  lmsCourseId: true,
  lmsSlug: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourseSelect

type Row = Prisma.CourseGetPayload<{ select: typeof AUTHORED_COURSE_LIST_SELECT }>

export function authoredCourseTerms(row: Row): AuthorTerms | null {
  if (
    row.authorAmount === null ||
    row.sellerCommissionPercent === null ||
    row.platformFeePercent === null
  ) {
    return null
  }
  return {
    pricingMode: row.pricingMode,
    authorAmount: Number(row.authorAmount),
    sellerCommissionPercent: Number(row.sellerCommissionPercent),
    platformFeePercent: Number(row.platformFeePercent),
  }
}

export function mapAuthoredCourse(row: Row) {
  const terms = authoredCourseTerms(row)
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    descricao: row.descricao,
    cargaHoraria: row.cargaHoraria,
    qtdAulas: row.qtdAulas,
    capaImageUrl: row.capaImageUrl,
    status: row.status,
    authoredStatus: row.authoredStatus,
    distribution: row.distribution,
    pricingMode: row.pricingMode,
    authorAmount: terms?.authorAmount ?? null,
    sellerCommissionPercent: terms?.sellerCommissionPercent ?? null,
    platformFeePercent: terms?.platformFeePercent ?? null,
    // O que a tela precisa para explicar a regra SEM reimplementar a conta.
    minSalePrice: terms ? minSalePrice(terms) : null,
    producerNetAtMin: terms ? producerNetAt(terms, minSalePrice(terms)) : null,
    /** Sem conteudo no LMS o curso nao pode ser publicado. */
    hasContent: row.lmsCourseId !== null,
    lmsSlug: row.lmsSlug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
