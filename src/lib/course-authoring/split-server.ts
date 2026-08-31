import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { AsaasSplit } from "@/lib/asaas/types"
import { getPlatformWalletId } from "./wallet"
import {
  computeSplit,
  splitLinesForPayment,
  validateSalePrice,
  type AuthorTerms,
  type SplitResult,
  type SplitSnapshot,
} from "./split"

/**
 * Lado SERVIDOR do rateio: carrega curso, carteiras e monta o snapshot que vai
 * congelado na matricula. O calculo em si mora em `./split.ts`, que e puro e
 * viaja para o browser no simulador do painel.
 */

/**
 * Colunas de autoria que TODA leitura de curso no caminho de venda precisa
 * espalhar. Um `select` mais estreito faz o curso de autoria se apresentar como
 * curso comum da PMB, e a venda sai sem rateio — o produtor nunca recebe e
 * ninguem percebe. Mesmo papel do PACE_PRIMARY_SELECT da cota de aulas.
 */
export const AUTHORED_COURSE_SELECT = {
  id: true,
  nome: true,
  // Identificadores da fornecedora: `authoredSaleGate` recusa a venda de um
  // curso que a plataforma de aulas nao conseguiria matricular. Ficam no select
  // COMPARTILHADO de proposito — as oito portas de venda ja o espalham, entao
  // porta nova herda o gate sem ter que lembrar dele.
  provider: true,
  plataformaCourseId: true,
  lmsCourseId: true,
  authorTenantId: true,
  authoredStatus: true,
  distribution: true,
  pricingMode: true,
  authorAmount: true,
  sellerCommissionPercent: true,
  platformFeePercent: true,
} satisfies Prisma.CourseSelect

export type AuthoredCourseSource = Prisma.CourseGetPayload<{
  select: typeof AUTHORED_COURSE_SELECT
}>

/** O curso e produzido por alguma unidade (vs. catalogo da PMB)? */
export function isAuthoredCourse(course: {
  authorTenantId: string | null
}): boolean {
  return course.authorTenantId !== null
}

/**
 * A venda deste curso NESTA vitrine exige rateio?
 *
 * Falso para todo o catalogo da PMB e tambem para o autor vendendo na propria
 * loja — nos dois casos o dinheiro e inteiro de quem emitiu a cobranca.
 */
export function saleRequiresSplit(
  course: { authorTenantId: string | null },
  sellerTenantId: string | null,
): boolean {
  return isAuthoredCourse(course) && course.authorTenantId !== sellerTenantId
}

export function termsFromCourse(course: AuthoredCourseSource): AuthorTerms | null {
  if (
    course.authorAmount === null ||
    course.sellerCommissionPercent === null ||
    course.platformFeePercent === null
  ) {
    return null
  }
  return {
    pricingMode: course.pricingMode,
    authorAmount: Number(course.authorAmount),
    sellerCommissionPercent: Number(course.sellerCommissionPercent),
    platformFeePercent: Number(course.platformFeePercent),
  }
}

export interface ResolveSaleSplitInput {
  course: AuthoredCourseSource
  /** null = a PMB e a vendedora (vitrine principal). */
  sellerTenantId: string | null
  listPrice: number
  discount?: number
}

/**
 * Devolve o snapshot de rateio da venda, ou `null` quando nao ha rateio
 * (catalogo da PMB, ou o autor vendendo na loja dele).
 *
 * Falha explicitamente quando o curso E de autoria mas nao esta vendavel — um
 * curso pausado pelo /admin ou com termos incompletos nao pode virar cobranca.
 */
export async function resolveSaleSplit(
  input: ResolveSaleSplitInput,
): Promise<SplitResult<SplitSnapshot | null>> {
  const { course, sellerTenantId } = input

  if (!saleRequiresSplit(course, sellerTenantId)) return { ok: true, value: null }

  const producerTenantId = course.authorTenantId as string

  if (course.authoredStatus !== "PUBLISHED") {
    return {
      ok: false,
      error: "PRICE_INVALID",
      message: "Este curso nao esta disponivel para venda no momento.",
    }
  }

  const terms = termsFromCourse(course)
  if (!terms) {
    return {
      ok: false,
      error: "AUTHOR_AMOUNT_INVALID",
      message: "Este curso esta com os termos comerciais incompletos.",
    }
  }

  const [producer, platformWalletId] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: producerTenantId },
      select: { asaasWalletId: true },
    }),
    getPlatformWalletId(),
  ])

  return computeSplit({
    courseId: course.id,
    terms,
    listPrice: input.listPrice,
    discount: input.discount,
    producerTenantId,
    producerWalletId: producer?.asaasWalletId ?? null,
    sellerTenantId,
    platformWalletId,
  })
}

/**
 * Traduz o snapshot no array `splits` do Asaas.
 *
 * So as linhas que VIAJAM entram: a fatia de quem emitiu a cobranca fica como
 * resto liquido na conta dele, e mandar a propria carteira faz a API do Asaas
 * recusar a cobranca inteira.
 */
export function buildAsaasSplits(
  snapshot: SplitSnapshot | null,
): AsaasSplit[] | undefined {
  if (!snapshot || snapshot.lines.length === 0) return undefined
  const splits = snapshot.lines
    .filter((line) => line.travels && line.walletId && line.percentOfSale > 0)
    .map((line) => ({
      walletId: line.walletId as string,
      percentualValue: line.percentOfSale,
    }))
  return splits.length > 0 ? splits : undefined
}

/**
 * Le o snapshot gravado em `Enrollment.authorSplitSnapshot`.
 *
 * Tolerante por design: matricula antiga nao tem snapshot, e uma linha
 * corrompida nao pode derrubar o fulfill de um pagamento ja recebido — sem
 * snapshot, a venda simplesmente nao gera linhas de rateio e o alerta fica no
 * log. Prender o acesso do aluno por causa do extrato seria o trade errado.
 */
export function parseSplitSnapshot(value: Prisma.JsonValue | null): SplitSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.version !== 1) return null
  if (!Array.isArray(raw.lines)) return null
  if (typeof raw.producerTenantId !== "string") return null
  return value as unknown as SplitSnapshot
}

/**
 * Array `splits` do Asaas para uma matricula, lido do snapshot congelado nela.
 *
 * Existe para que NENHUM ponto de criacao de cobranca precise LEMBRAR de passar
 * o rateio: quem monta a cobranca chama isto com o id da matricula e recebe o
 * que precisa mandar. Esquecer o split e o pior defeito possivel desta feature —
 * a venda acontece, o aluno recebe o curso, e o produtor simplesmente nunca e
 * pago, sem erro em lugar nenhum.
 *
 * Devolve `undefined` (nao `[]`) quando nao ha rateio: mandar `[]` ao Asaas
 * DESATIVA o split de uma cobranca existente.
 */
export async function asaasSplitsForEnrollment(
  enrollmentId: string,
): Promise<AsaasSplit[] | undefined> {
  const row = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { authorSplitSnapshot: true },
  })
  return buildAsaasSplits(parseSplitSnapshot(row?.authorSplitSnapshot ?? null))
}

/**
 * Grava as linhas de rateio de UM pagamento.
 *
 * Roda na MESMA transacao do `Payment` (src/lib/enrollment/fulfill.ts): extrato
 * sem pagamento, ou pagamento sem extrato, sao os dois estados que nao podem
 * existir. Herda de graca as tres camadas de idempotencia do fulfill (advisory
 * lock + chave natural do gateway + guard de tenant); `skipDuplicates` sobre
 * `@@unique([paymentId, role])` e o cinto de seguranca da re-entrega.
 *
 * A linha do VENDEDOR e gravada com status RETAINED: ela nao viaja por split
 * (ele e o emissor e fica com o resto liquido), mas existe no extrato para que
 * a soma feche em 100% sem o leitor ter que fazer a subtracao de cabeca.
 */
export async function writeSplitLines(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string
    enrollmentId: string
    courseId: string
    snapshot: SplitSnapshot
    paidAmount: number
  },
): Promise<number> {
  const lines = splitLinesForPayment(input.snapshot, input.paidAmount)
  if (lines.length === 0) return 0

  const res = await tx.courseSaleSplit.createMany({
    data: lines.map((line) => ({
      paymentId: input.paymentId,
      enrollmentId: input.enrollmentId,
      courseId: input.courseId,
      role: line.role,
      beneficiaryTenantId: line.beneficiaryTenantId,
      walletId: line.walletId,
      amount: line.amount,
      percentApplied: line.percentOfSale,
      status: line.travels ? ("PENDING" as const) : ("RETAINED" as const),
    })),
    skipDuplicates: true,
  })
  return res.count
}

/**
 * Valida o preco que a unidade quer praticar num curso da vitrine dela.
 *
 * Chamada na escrita do `TenantCourse` — nao so no checkout. Sem ela, a unidade
 * salva R$ 1 num curso de terceiro, o curso fica listado na loja e o checkout e
 * quem recusa, com o aluno na tela: a loja parece funcionar e nao vende.
 *
 * Devolve `null` quando o preco esta OK (ou quando o curso nao e de autoria de
 * terceiro, que e a esmagadora maioria dos casos) e a mensagem quando nao esta.
 */
export function validateSalePriceForCourse(
  course: AuthoredCourseSource,
  sellerTenantId: string | null,
  price: number,
): { error: string; code: string } | null {
  if (!isAuthoredCourse(course)) return null

  const terms = termsFromCourse(course)
  if (!terms) return null

  const check = validateSalePrice(terms, price, {
    sellerIsProducer: course.authorTenantId === sellerTenantId,
  })
  return check.ok ? null : { error: check.message, code: check.error }
}

/**
 * Versao que carrega o curso. Aceita `null` em `sellerTenantId` (vitrine da
 * PMB): o preco de `Course.precoVitrineMain` de um curso de autoria passa pela
 * MESMA regra do preco de uma unidade — quem edita o catalogo no /admin nao tem
 * mais direito de furar o piso do produtor do que quem edita a propria loja.
 *
 * Em lote, prefira `validateSalePriceForCourse` sobre uma leitura unica: esta
 * funcao faz um `findUnique` por chamada.
 */
export async function validateTenantCoursePrice(
  courseId: string,
  sellerTenantId: string | null,
  price: number,
): Promise<{ error: string; code: string } | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: AUTHORED_COURSE_SELECT,
  })
  if (!course) return null
  return validateSalePriceForCourse(course, sellerTenantId, price)
}
