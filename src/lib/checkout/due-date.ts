/**
 * Data de vencimento (YYYY-MM-DD) daqui a `days` dias. Usada pelas rotas de
 * checkout (Asaas) — antes duplicada verbatim em /api/checkout, /api/admin/vendas
 * e /api/aluno/comprar (R29).
 */
export function dueDateInDays(days: number): string {
  // Aritmética em UTC para casar com `toISOString()` (também UTC). Usar
  // getDate/setDate (timezone local) + toISOString (UTC) causava off-by-one
  // perto da meia-noite em servidores fora de UTC.
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
