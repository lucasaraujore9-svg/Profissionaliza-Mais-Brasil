import type { Prisma } from "@prisma/client"
import {
  COURSE_CURATION_SELECT,
  isCourseCuratedForTenant,
} from "@/lib/catalog/visibility"

/**
 * Quais cursos podem compor um pacote PRÓPRIO da unidade.
 *
 * Fonte única para o salvamento (POST/PUT) e para a tela de edição. A tela
 * precisa da MESMA resposta que o salvamento: um pacote criado quando o curso
 * estava ativo guarda o curso depois que ele é desativado. Ele some da lista de
 * seleção (que só traz o que pode entrar), mas continuava no estado do
 * formulário — invisível, impossível de desmarcar — e todo salvamento era
 * recusado com "um ou mais cursos são inválidos", qualquer que fosse a edição.
 */
export const TENANT_PACKAGE_COURSE_SELECT = {
  id: true,
  nome: true,
  status: true,
  authorTenantId: true,
  ...COURSE_CURATION_SELECT,
} satisfies Prisma.CourseSelect

export type TenantPackageCourse = Prisma.CourseGetPayload<{
  select: typeof TENANT_PACKAGE_COURSE_SELECT
}>

export type TenantPackageCourseIssue =
  | "COURSE_INACTIVE"
  | "COURSE_NOT_AVAILABLE_FOR_TENANT"
  | "AUTHORED_COURSE_ALONE"

/** `null` = o curso pode entrar no pacote desta unidade. */
export function tenantPackageCourseIssue(
  course: TenantPackageCourse,
  tenantId: string,
): TenantPackageCourseIssue | null {
  // Curso inativo não é vendido nem matriculado — a vitrine e o checkout do
  // pacote já o descartam.
  if (course.status !== "ATIVO") return "COURSE_INACTIVE"
  // Curso que a PMB restringiu a outras unidades ("ocultar para todas EXCETO")
  // não entra no pacote desta: seria vendê-lo por dentro do pacote.
  if (!isCourseCuratedForTenant(course, tenantId)) return "COURSE_NOT_AVAILABLE_FOR_TENANT"
  // Curso produzido por OUTRA unidade não entra em pacote. O rateio é da
  // cobrança inteira: num pacote, o percentual do produtor incidiria também
  // sobre os cursos que não são dele — e um preço de pacote abaixo do piso dele
  // contornaria em silêncio o valor que ele definiu. Mesma trava do checkout,
  // onde curso de terceiro vende sozinho.
  if (course.authorTenantId !== null && course.authorTenantId !== tenantId) {
    return "AUTHORED_COURSE_ALONE"
  }
  return null
}

/** Motivo curto, para a lista de cursos indisponíveis da tela de edição. */
export const TENANT_PACKAGE_COURSE_ISSUE_LABEL: Record<TenantPackageCourseIssue, string> = {
  COURSE_INACTIVE: "curso inativo",
  COURSE_NOT_AVAILABLE_FOR_TENANT: "não liberado para esta unidade",
  AUTHORED_COURSE_ALONE: "produzido por outra unidade",
}

function issueMessage(nome: string, issue: TenantPackageCourseIssue): string {
  switch (issue) {
    case "COURSE_INACTIVE":
      return `O curso "${nome}" está inativo e não pode fazer parte de um pacote. Remova-o para salvar.`
    case "COURSE_NOT_AVAILABLE_FOR_TENANT":
      return `O curso "${nome}" não está liberado para esta unidade.`
    case "AUTHORED_COURSE_ALONE":
      return `O curso "${nome}" é produzido por outra unidade e não pode entrar em um pacote.`
  }
}

export type TenantPackageCoursesCheck =
  | { ok: true }
  | { ok: false; code: TenantPackageCourseIssue | "INVALID_COURSES"; error: string }

/**
 * Valida a lista de cursos de um salvamento. `loaded` vem de uma consulta SEM
 * filtro de status: filtrar lá faria o curso inativo cair em "não encontrado"
 * e a mensagem voltaria a não dizer qual curso barra o salvamento.
 */
export function checkTenantPackageCourses(
  courseIds: string[],
  loaded: TenantPackageCourse[],
  tenantId: string,
): TenantPackageCoursesCheck {
  const byId = new Map(loaded.map((c) => [c.id, c]))
  if (courseIds.some((id) => !byId.has(id))) {
    return {
      ok: false,
      code: "INVALID_COURSES",
      error: "Um ou mais cursos não foram encontrados.",
    }
  }
  for (const id of courseIds) {
    const course = byId.get(id)!
    const issue = tenantPackageCourseIssue(course, tenantId)
    if (issue) return { ok: false, code: issue, error: issueMessage(course.nome, issue) }
  }
  return { ok: true }
}
