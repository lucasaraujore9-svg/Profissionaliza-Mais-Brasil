/**
 * Soma `months` meses à data preservando o dia. Se o mês alvo não tiver o dia
 * (ex: 31/jan + 1 mês = 28/fev), clampa para o último dia do mês alvo.
 * `Date.setMonth` nativo faz overflow para o mês seguinte (3/mar), o que
 * subestima a idade do vencimento e atrasa o bloqueio de inadimplência (R7).
 */
export function addMonthsClamped(base: Date, months: number): Date {
  const out = new Date(base)
  const targetMonth = out.getMonth() + months
  const targetDay = out.getDate()
  out.setDate(1) // evita overflow durante o setMonth
  out.setMonth(targetMonth)
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate()
  out.setDate(Math.min(targetDay, lastDay))
  return out
}
