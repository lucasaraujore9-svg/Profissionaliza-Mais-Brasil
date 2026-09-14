import { prisma } from "@/lib/prisma"
import { planCourseWhere } from "./scope"
import { toScopeInput } from "./plans"
import {
  SLOT_OCCUPYING_STATUSES,
  SUBSCRIPTION_MAX_ACTIVE_COURSES,
  canReleaseSubscriptionSlot,
  occupiesSubscriptionSlot,
  type SubscriptionSlots,
} from "./slots"

/**
 * Catalogo que a assinatura libera, para a area do aluno.
 *
 * Paginado porque um plano "catalogo inteiro" cobre 100+ cursos: carregar tudo
 * de uma vez faria a tela pesar e nao ajudaria ninguem a achar curso.
 */

export interface SubscriptionCourseCard {
  id: string
  nome: string
  slug: string
  capaUrl: string | null
  cargaHoraria: string | null
  qtdAulas: number
  /**
   * - `active`: ja tem matricula valendo (inclusive de compra avulsa) — "Continuar".
   * - `released`: o aluno tirou este curso da lista; o progresso esta guardado
   *   — "Retomar".
   * - `none`: nunca abriu — "Comecar".
   */
  state: "active" | "released" | "none"
  /** Progresso guardado, para o "Retomar" dizer de onde o aluno volta. */
  progressPercent: number
}

export interface SubscriptionCatalogPage {
  courses: SubscriptionCourseCard[]
  total: number
  page: number
  pageSize: number
}

export const CATALOG_PAGE_SIZE = 24

export async function loadSubscriptionCatalog(
  subscriptionId: string,
  opts: { page?: number; search?: string } = {},
): Promise<SubscriptionCatalogPage | null> {
  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      studentId: true,
      tenantId: true,
      plan: {
        select: { scope: true, categoryIds: true, courseIds: true, packageId: true },
      },
    },
  })
  if (!sub) return null

  const scope = await toScopeInput(sub.plan)
  const page = Math.max(1, opts.page ?? 1)
  const search = opts.search?.trim()

  // A busca entra em AND com o escopo — nunca por spread, senão o `OR` dela
  // se fundiria com os `OR` dos gates de vitrine e um curso passaria por
  // casar o nome, ignorando visibilidade e preço.
  const where = search
    ? {
        AND: [
          planCourseWhere(scope, sub.tenantId),
          { nome: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : planCourseWhere(scope, sub.tenantId)

  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      select: {
        id: true,
        nome: true,
        slug: true,
        capaImageUrl: true,
        capaOverride: true,
        cargaHoraria: true,
        qtdAulas: true,
      },
      orderBy: [{ destaqueHome: "desc" }, { nome: "asc" }],
      skip: (page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE,
    }),
  ])

  // Matrículas que o aluno já tem entre os cursos DESTA página — inclui as de
  // compra avulsa, para não oferecer "Começar" num curso que ele já cursa — e as
  // que ele tirou da lista, para o card dizer "Retomar" em vez de "Começar".
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: sub.studentId,
      courseId: { in: rows.map((r) => r.id) },
      OR: [
        { status: { in: ["ACTIVE", "COMPLETED"] } },
        { status: "CANCELLED", subscriptionSlotReleasedAt: { not: null } },
      ],
    },
    select: { courseId: true, status: true, progressPercent: true },
    orderBy: { createdAt: "asc" },
  })
  // A mais recente vence (a lista vem em ordem de criação).
  const byCourse = new Map(enrollments.map((e) => [e.courseId, e]))

  return {
    courses: rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      slug: r.slug,
      capaUrl: r.capaOverride ?? r.capaImageUrl,
      cargaHoraria: r.cargaHoraria,
      qtdAulas: r.qtdAulas,
      state: cardState(byCourse.get(r.id)?.status),
      progressPercent: byCourse.get(r.id)?.progressPercent ?? 0,
    })),
    total,
    page,
    pageSize: CATALOG_PAGE_SIZE,
  }
}

function cardState(
  status: string | undefined,
): SubscriptionCourseCard["state"] {
  if (status === "ACTIVE" || status === "COMPLETED") return "active"
  if (status === "CANCELLED") return "released"
  return "none"
}

/**
 * Cursos que ocupam as vagas da assinatura agora, para o painel "X de 10" e
 * para o seletor de troca.
 *
 * Filtra em memória com `occupiesSubscriptionSlot` em cima de um `where` mais
 * largo: a lista é de no máximo algumas dezenas de linhas, e usar o PREDICADO
 * (em vez de repetir a regra na query) é o que mantém a tela e o gate de
 * liberação contando igual.
 */
export async function loadSubscriptionSlots(
  subscriptionId: string,
): Promise<SubscriptionSlots> {
  const rows = await prisma.enrollment.findMany({
    where: {
      studentSubscriptionId: subscriptionId,
      status: { in: SLOT_OCCUPYING_STATUSES },
    },
    select: {
      courseId: true,
      status: true,
      progressStatus: true,
      progressPercent: true,
      course: { select: { nome: true, provider: true } },
    },
    orderBy: { startedAt: "asc" },
  })

  const courses = rows
    .filter((r) => occupiesSubscriptionSlot(r))
    .map((r) => ({
      courseId: r.courseId,
      nome: r.course.nome,
      progressPercent: r.progressPercent ?? 0,
      releasable: canReleaseSubscriptionSlot({
        status: r.status,
        progressStatus: r.progressStatus,
        provider: r.course.provider,
      }),
    }))

  return { max: SUBSCRIPTION_MAX_ACTIVE_COURSES, used: courses.length, courses }
}
