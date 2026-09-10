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

/**
 * Igual a `addMonthsClamped`, mas em UTC.
 *
 * A versao acima usa `getMonth`/`getDate`, que sao do fuso do PROCESSO. Em
 * producao (Vercel roda em UTC) as duas dao o mesmo resultado; num servidor em
 * fuso NEGATIVO, uma data gravada como meia-noite UTC — todo `dueDate` que veio
 * do Asaas e `new Date("YYYY-MM-DD")` — ja e o dia ANTERIOR em horario local, e
 * o clamp erra: 31/12 + 2 meses devolve 01/03 em vez de 28/02.
 *
 * Use esta quando a data de entrada for meia-noite UTC (vencimento, competencia)
 * e o resultado tiver de ser o mesmo em qualquer maquina.
 */
export function addMonthsClampedUtc(base: Date, months: number): Date {
  const targetDay = base.getUTCDate()
  const out = new Date(base)
  out.setUTCDate(1) // evita overflow durante o setUTCMonth
  out.setUTCMonth(out.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
  ).getUTCDate()
  out.setUTCDate(Math.min(targetDay, lastDay))
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

/**
 * Dia civil BRASILEIRO de um INSTANTE, em "YYYY-MM-DD".
 *
 * Use para timestamps de verdade (`createdAt`, `paidAt`, `lastActiveAt`): o
 * servidor roda em UTC, então uma venda das 22h de terça é 01h de quarta em UTC
 * e apareceria no dia errado num relatório.
 */
export function brDayIso(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: BR_TIMEZONE })
}

/** "YYYY-MM-DD HH:mm" no fuso brasileiro. Mesmo motivo de `brDayIso`. */
export function brDateTimeIso(date: Date): string {
  const day = brDayIso(date)
  const time = date.toLocaleTimeString("en-GB", {
    timeZone: BR_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  return `${day} ${time}`
}

/**
 * Dia de uma DATA CIVIL guardada como meia-noite UTC — `TenantPayment.dueDate`
 * é o caso (`new Date("YYYY-MM-DD")` do Asaas).
 *
 * NÃO troque por `brDayIso` aqui: meia-noite UTC é 21h do dia ANTERIOR no
 * Brasil, então converter o fuso de um vencimento o joga um dia para trás.
 */
export function utcDayIso(date: Date): string {
  return date.toISOString().slice(0, 10)
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
