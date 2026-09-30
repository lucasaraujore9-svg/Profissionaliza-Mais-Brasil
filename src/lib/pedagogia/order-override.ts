import { parsePolicy, resolvePolicy, type PedagogyPolicy } from "./policy"

/**
 * ORDEM DE LIBERACAO POR MATRICULA — a unidade troca livre / sequencial /
 * gotejamento de UM aluno depois da venda.
 *
 * So a ORDEM e sobrescrita (`releaseMode`, `dripDays`, `dripUnit`). Ritmo e
 * horario continuam vindo do curso/unidade: guardar a politica inteira na
 * matricula congelaria a cota e a janela da epoca, e a unidade editaria o
 * proprio padrao sem alcancar este aluno.
 *
 * Precedencia: matricula (so a ordem) > curso na vitrine > unidade.
 *
 * Nao tem gemeo no LMS: o LMS recebe a politica JA RESOLVIDA por matricula
 * (`PATCH /enrollments/:id/policy`) e nao conhece esta camada.
 */

export type OrderOverride = Pick<PedagogyPolicy, "releaseMode" | "dripDays" | "dripUnit">

/** Normaliza o que veio do banco. `null` = sem override (segue curso/unidade). */
export function parseOrderOverride(raw: unknown): OrderOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const { releaseMode, dripDays, dripUnit } = parsePolicy(raw)
  return { releaseMode, dripDays, dripUnit }
}

/** Politica efetiva de uma matricula. */
export function resolveEnrollmentPolicy(
  tenantPolicy: unknown,
  coursePolicy: unknown,
  orderRaw: unknown,
): PedagogyPolicy {
  const base = resolvePolicy(tenantPolicy, coursePolicy)
  const order = parseOrderOverride(orderRaw)
  return order ? { ...base, ...order } : base
}

/**
 * Corpo que viaja ao LMS para UMA matricula.
 *
 * `null` = herda o padrao da unidade, que o LMS ja tem (so quando nem o curso
 * nem a matricula tem regra propria). Com override de ordem vai a politica
 * RESOLVIDA inteira, porque o LMS guarda um bloco so por matricula — e por isso
 * mudar o padrao da unidade precisa re-empurrar essas matriculas
 * (`syncTenantPedagogyToLms`).
 */
export function lmsEnrollmentPolicyBody(
  tenantPolicy: unknown,
  coursePolicy: unknown,
  orderRaw: unknown,
): Record<string, unknown> | null {
  if (coursePolicy == null && parseOrderOverride(orderRaw) === null) return null
  return { ...resolveEnrollmentPolicy(tenantPolicy, coursePolicy, orderRaw) }
}
