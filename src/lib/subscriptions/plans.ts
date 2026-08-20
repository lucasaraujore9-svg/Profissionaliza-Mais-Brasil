import { prisma } from "@/lib/prisma"
import type { PlanScopeInput } from "./scope"
import { planCourseWhere, planIncludesCourseWhere } from "./scope"

/**
 * Leitura dos planos de assinatura na vitrine.
 *
 * Escopo de venda segue EXATAMENTE `lib/packages/vitrine.ts`: plano da PMB
 * (`tenantId` null) vale em todas as vitrines, com preco/visibilidade
 * sobrescritiveis pela unidade; plano proprio de OUTRA unidade nunca e vendavel.
 * Divergir daquele arquivo faria pacote e assinatura se comportarem diferente
 * na mesma loja.
 */

export interface PlanCard {
  id: string
  name: string
  slug: string
  description: string | null
  coverImageUrl: string | null
  /** Preco efetivo nesta vitrine (override da unidade ou o do plano). */
  price: number
  featured: boolean
  /** Quantos cursos o plano libera nesta vitrine, agora. */
  courseCount: number
}

const PLAN_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  slug: true,
  description: true,
  coverImageUrl: true,
  price: true,
  enabled: true,
  featured: true,
  position: true,
  scope: true,
  categoryIds: true,
  courseIds: true,
  packageId: true,
} as const

type PlanRow = {
  id: string
  tenantId: string | null
  name: string
  slug: string
  description: string | null
  coverImageUrl: string | null
  price: unknown
  enabled: boolean
  featured: boolean
  position: number
  scope: "ALL" | "CATEGORY" | "PACKAGE" | "COURSES"
  categoryIds: string[]
  courseIds: string[]
  packageId: string | null
}

/**
 * Resolve os cursos de um plano `scope=PACKAGE`. O escopo do plano guarda o
 * PACOTE, nao os cursos: assim, curso adicionado ao pacote depois passa a valer
 * para quem ja assina — mesma promessa do escopo por categoria.
 */
async function packageCourseIds(packageId: string | null): Promise<string[]> {
  if (!packageId) return []
  const items = await prisma.coursePackageItem.findMany({
    where: { packageId },
    select: { courseId: true },
  })
  return items.map((i) => i.courseId)
}

/** Converte a linha do plano na entrada que o resolvedor de escopo entende. */
export async function toScopeInput(row: {
  scope: PlanScopeInput["scope"]
  categoryIds: string[]
  courseIds: string[]
  packageId: string | null
}): Promise<PlanScopeInput> {
  return {
    scope: row.scope,
    categoryIds: row.categoryIds,
    courseIds: row.courseIds,
    packageId: row.packageId,
    packageCourseIds:
      row.scope === "PACKAGE" ? await packageCourseIds(row.packageId) : undefined,
  }
}

/** Conta os cursos que o plano libera nesta vitrine, no estado de agora. */
export async function countPlanCourses(
  row: Pick<PlanRow, "scope" | "categoryIds" | "courseIds" | "packageId">,
  tenantId: string | null,
): Promise<number> {
  const scope = await toScopeInput(row)
  return prisma.course.count({ where: planCourseWhere(scope, tenantId) })
}

/**
 * Planos vendaveis na vitrine, ja com preco efetivo e contagem de cursos.
 *
 * Plano que nao libera curso nenhum NAO e listado: vender acesso a um catalogo
 * vazio e pior do que nao ter o produto na loja. Mesma politica do `toCard` de
 * pacotes, que devolve null sem curso ativo.
 */
export async function resolveVitrinePlans(
  tenantId: string | null,
): Promise<PlanCard[]> {
  const rows = (await prisma.subscriptionPlan.findMany({
    where:
      tenantId === null
        ? { tenantId: null, enabled: true }
        : { enabled: true, OR: [{ tenantId: null }, { tenantId }] },
    select: PLAN_SELECT,
    orderBy: [{ position: "asc" }, { name: "asc" }],
  })) as PlanRow[]

  const overrides = tenantId
    ? await prisma.tenantSubscriptionPlan.findMany({
        where: { tenantId, planId: { in: rows.map((r) => r.id) } },
      })
    : []
  const byPlan = new Map(overrides.map((o) => [o.planId, o]))

  const cards: PlanCard[] = []
  for (const row of rows) {
    const override = byPlan.get(row.id)
    if (override?.isVisible === false) continue

    const price =
      override?.price != null ? Number(override.price) : Number(row.price)
    if (!(price > 0)) continue

    const courseCount = await countPlanCourses(row, tenantId)
    if (courseCount === 0) continue

    cards.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      coverImageUrl: override?.customCoverUrl ?? row.coverImageUrl,
      price,
      featured: override?.isFeatured ?? row.featured,
      courseCount,
    })
  }

  // Próprios primeiro, depois PMB; dentro disso destacados e nome — igual a
  // ordenação de pacotes, para as duas prateleiras não brigarem visualmente.
  const order = new Map(rows.map((r) => [r.id, r.tenantId]))
  return cards.sort((a, b) => {
    const aOwn = order.get(a.id) !== null ? 0 : 1
    const bOwn = order.get(b.id) !== null ? 0 : 1
    if (aOwn !== bOwn) return aOwn - bOwn
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    return a.name.localeCompare(b.name, "pt-BR")
  })
}

/** Um plano pela slug, para a página pública de detalhe. */
export async function getVitrinePlanBySlug(
  tenantId: string | null,
  slug: string,
): Promise<PlanCard | null> {
  const plans = await resolveVitrinePlans(tenantId)
  return plans.find((p) => p.slug === slug) ?? null
}

export interface PlanCheckoutData {
  id: string
  name: string
  slug: string
  price: number
  scope: PlanScopeInput
}

/**
 * Plano pronto para o checkout, com o preco EFETIVO daquela vitrine.
 *
 * O preco vem daqui e nunca do cliente: o corpo do POST diz qual plano, jamais
 * quanto custa — e a mesma trava de `price-guard` nas vendas avulsas.
 */
export async function getPlanForCheckout(
  tenantId: string | null,
  planId: string,
): Promise<PlanCheckoutData | null> {
  const plan = (await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: PLAN_SELECT,
  })) as PlanRow | null

  if (!plan || !plan.enabled) return null

  let price = Number(plan.price)
  if (plan.tenantId === null) {
    if (tenantId) {
      const override = await prisma.tenantSubscriptionPlan.findUnique({
        where: { tenantId_planId: { tenantId, planId: plan.id } },
      })
      if (override?.isVisible === false) return null
      if (override?.price != null) price = Number(override.price)
    }
  } else if (plan.tenantId !== tenantId) {
    // Plano próprio de OUTRA unidade — nunca vendável aqui.
    return null
  }

  if (!(price > 0)) return null

  const scope = await toScopeInput(plan)
  // Plano que não libera curso nenhum não é vendável: a cobrança entraria e o
  // aluno abriria um catálogo vazio.
  const count = await prisma.course.count({
    where: planCourseWhere(scope, tenantId),
  })
  if (count === 0) return null

  return { id: plan.id, name: plan.name, slug: plan.slug, price, scope }
}

/**
 * O plano desta assinatura libera este curso, nesta vitrine, AGORA?
 *
 * Consulta no momento do acesso de proposito — e o que faz curso novo de uma
 * categoria assinada valer sem ninguem mexer no plano.
 */
export async function planIncludesCourse(
  plan: { scope: PlanScopeInput["scope"]; categoryIds: string[]; courseIds: string[]; packageId: string | null },
  tenantId: string | null,
  courseId: string,
): Promise<boolean> {
  const scope = await toScopeInput(plan)
  const found = await prisma.course.count({
    where: planIncludesCourseWhere(scope, tenantId, courseId),
  })
  return found > 0
}
