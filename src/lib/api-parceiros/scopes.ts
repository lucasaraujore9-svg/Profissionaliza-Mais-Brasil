/**
 * Catálogo FECHADO de escopos da API de parceiros (/api/v1).
 *
 * Mesmo princípio dos catálogos de permissão do /admin e do /painel: escopo
 * fora desta lista é ignorado na resolução — uma chave gravada com um escopo
 * que não existe mais não vira acesso amplo por acidente.
 *
 * Regra ao criar escopo novo: um escopo por RECURSO + AÇÃO, nunca um
 * "admin"/"*" que dá tudo. A chave de um parceiro deve poder ser reduzida ao
 * mínimo que aquela integração precisa.
 */

export const API_SCOPES = [
  /**
   * Consultar os dados de uma unidade (revenda) a partir de um identificador
   * único. NÃO inclui dado financeiro (mensalidade, comissão), credencial de
   * gateway nem CPF completo do titular — ver `unidade-payload.ts`.
   */
  "unidades.read",
] as const

export type ApiScope = (typeof API_SCOPES)[number]

const SCOPE_SET = new Set<string>(API_SCOPES)

export function isApiScope(value: string): value is ApiScope {
  return SCOPE_SET.has(value)
}

/** Descarta escopos fora do catálogo (chave antiga com escopo removido). */
export function sanitizeScopes(values: readonly string[]): ApiScope[] {
  return values.filter(isApiScope)
}

/** Rótulos para a tela de criação de chave em /admin/configuracoes. */
export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "unidades.read": "Consultar dados de unidades (revendas)",
}
