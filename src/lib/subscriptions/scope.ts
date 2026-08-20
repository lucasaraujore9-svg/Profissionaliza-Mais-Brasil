import type { Prisma } from "@prisma/client"
import { COURSE_HAS_PRICE } from "@/lib/catalog/visibility"
import { visibilityFilter } from "@/lib/tenant/courses"

/**
 * Quais cursos uma assinatura libera.
 *
 * FONTE UNICA da pergunta "este plano da acesso a este curso?". A vitrine do
 * assinante (listagem) e o gate de liberacao (`planIncludesCourse`) precisam
 * responder identico — se a listagem mostrar um curso que o gate recusa, o
 * aluno clica em "Comecar" e toma 403 num curso que a propria tela ofereceu.
 *
 * ESCOPO E DINAMICO, NUNCA MATERIALIZADO. `ALL` e `CATEGORY` sao resolvidos por
 * query no momento do acesso: curso novo publicado naquela categoria passa a
 * valer para quem ja assina, sem ninguem editar o plano. Guardar a lista de ids
 * na contratacao congelaria o catalogo e quebraria a promessa do produto.
 *
 * Modulo PURO (so monta `where`): quem fala com o banco e o caller.
 */

/** O que a decisao precisa saber do plano. */
export interface PlanScopeInput {
  scope: "ALL" | "CATEGORY" | "PACKAGE" | "COURSES"
  categoryIds: string[]
  courseIds: string[]
  packageId: string | null
  /** Cursos do pacote, quando scope=PACKAGE (o caller resolve os itens). */
  packageCourseIds?: string[]
}

/**
 * `where` que NUNCA casa. Usado quando o plano esta mal configurado (categoria
 * sem id, pacote vazio): melhor a assinatura nao liberar nada e alguem
 * perceber, do que um `where` vazio liberar o catalogo INTEIRO por engano —
 * fail-closed, a mesma politica dos presets de permissao.
 */
const MATCH_NOTHING: Prisma.CourseWhereInput = { id: { in: [] } }

/**
 * Restricao do ESCOPO do plano (sem os gates de vitrine, que `planCourseWhere`
 * aplica por cima). Separada para o teste conseguir olhar so a taxonomia.
 */
export function planScopeWhere(plan: PlanScopeInput): Prisma.CourseWhereInput {
  switch (plan.scope) {
    case "ALL":
      // Sem restricao propria: quem limita e o gate de vitrine.
      return {}

    case "CATEGORY": {
      const ids = plan.categoryIds.filter(Boolean)
      if (ids.length === 0) return MATCH_NOTHING
      // Pelo JOIN (`categoryLinks`), nunca por `categoryId`: aquele campo e so
      // a categoria PRINCIPAL, e um curso que esta na categoria como secundaria
      // ficaria de fora sem motivo visivel para quem montou o plano.
      return { categoryLinks: { some: { categoryId: { in: ids } } } }
    }

    case "PACKAGE": {
      const ids = (plan.packageCourseIds ?? []).filter(Boolean)
      if (ids.length === 0) return MATCH_NOTHING
      return { id: { in: ids } }
    }

    case "COURSES": {
      const ids = plan.courseIds.filter(Boolean)
      if (ids.length === 0) return MATCH_NOTHING
      return { id: { in: ids } }
    }
  }
}

/**
 * Gates da VITRINE onde a assinatura foi vendida. Um plano nao pode dar acesso a
 * curso que aquela vitrine nem vende.
 *
 * - PMB (`tenantId` null): curso ativo, nao oculto na vitrine mae e com preco
 *   efetivo > 0 (`COURSE_HAS_PRICE`).
 * - Revenda: curso ativo, alcancavel pela curadoria (`visibilityFilter`) E
 *   presente no catalogo da unidade com preco proprio > 0. Sem a checagem de
 *   `TenantCourse` a unidade liberaria, via assinatura, curso que ela nao
 *   escolheu vender.
 */
export function vitrineGateWhere(tenantId: string | null): Prisma.CourseWhereInput[] {
  const gates: Prisma.CourseWhereInput[] = [{ status: "ATIVO" }]

  if (tenantId === null) {
    gates.push({ hiddenMain: false }, COURSE_HAS_PRICE)
  } else {
    gates.push(visibilityFilter(tenantId), {
      tenantCourses: {
        some: { tenantId, isVisible: true, price: { gt: 0 } },
      },
    })
  }

  return gates
}

/**
 * `where` completo dos cursos que o plano libera nesta vitrine.
 *
 * Tudo entra em `AND` de proposito: `COURSE_HAS_PRICE` e `visibilityFilter`
 * usam `OR` na raiz, e um spread juntaria os dois num `OR` so — o curso passaria
 * por ter preco OU por ser visivel, em vez das duas coisas.
 */
export function planCourseWhere(
  plan: PlanScopeInput,
  tenantId: string | null,
): Prisma.CourseWhereInput {
  return { AND: [planScopeWhere(plan), ...vitrineGateWhere(tenantId)] }
}

/**
 * `where` para checar UM curso — o gate de liberacao. Deriva de
 * `planCourseWhere` em vez de repetir a regra: era exatamente aqui que uma
 * segunda implementacao divergiria da listagem.
 */
export function planIncludesCourseWhere(
  plan: PlanScopeInput,
  tenantId: string | null,
  courseId: string,
): Prisma.CourseWhereInput {
  return { AND: [{ id: courseId }, planCourseWhere(plan, tenantId)] }
}
