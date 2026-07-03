/**
 * PERF-012: teto de linhas de qualquer export CSV (comissões/saques/financeiro),
 * espelhando o `MAX_REPORT_ROWS` do hub de BI (`src/lib/reports/definitions.ts`).
 * Evita carregar/serializar um ledger inteiro (que cresce sem fim) em memória.
 * Ao atingir o teto, o export sinaliza truncamento numa linha final.
 */
export const MAX_EXPORT_ROWS = 10_000

/**
 * Linha-comentário de truncamento anexada ao fim do CSV quando o export bate no
 * teto. Prefixada com `#` (convenção de comentário) para não ser confundida com
 * dado por planilhas; instrui o operador a filtrar por período.
 */
export function truncationNotice(): string {
  return `# TRUNCADO: limite de ${MAX_EXPORT_ROWS} linhas atingido — filtre por período para exportar o restante`
}
