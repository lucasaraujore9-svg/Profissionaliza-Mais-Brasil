/**
 * Data de vencimento (YYYY-MM-DD) daqui a `days` dias. Usada pelas rotas de
 * checkout (Asaas) — antes duplicada verbatim em /api/checkout, /api/admin/vendas
 * e /api/aluno/comprar (R29).
 */
export function dueDateInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
