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

export const BR_TIMEZONE = "America/Sao_Paulo"

/**
 * Meia-noite UTC do dia de calendario que esta correndo no Brasil.
 *
 * POR QUE ISSO IMPORTA: o servidor (Vercel) e o pg_cron rodam em UTC, mas o
 * vencimento do boleto e uma DATA civil brasileira. Sem esta conversao, um cron
 * das 00:30 UTC (21:30 BRT do dia anterior) contaria um dia a mais e o aviso de
 * "vence hoje" chegaria com o boleto ja vencido. `en-CA` formata YYYY-MM-DD.
 *
 * O retorno casa com o formato em que gravamos `TenantPayment.dueDate`
 * (`new Date("YYYY-MM-DD")` do Asaas = meia-noite UTC), entao a subtracao entre
 * os dois e exata em dias, sem residuo de hora.
 */
export function brDayStartUtc(now: Date = new Date()): Date {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: BR_TIMEZONE })
  return new Date(`${ymd}T00:00:00.000Z`)
}

const MS_PER_DAY = 86_400_000

/**
 * Dias inteiros entre hoje (no Brasil) e o vencimento. Positivo = ainda vai
 * vencer, 0 = vence hoje, negativo = venceu ha N dias.
 */
export function daysUntilBrDay(dueDate: Date, now: Date = new Date()): number {
  const today = brDayStartUtc(now)
  const due = new Date(
    Date.UTC(
      dueDate.getUTCFullYear(),
      dueDate.getUTCMonth(),
      dueDate.getUTCDate(),
    ),
  )
  return Math.round((due.getTime() - today.getTime()) / MS_PER_DAY)
}
