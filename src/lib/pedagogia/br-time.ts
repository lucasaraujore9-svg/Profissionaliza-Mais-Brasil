/**
 * Dia e hora CIVIS BRASILEIROS para as regras pedagogicas.
 *
 * Por que um modulo proprio em vez de so `lib/dates.ts`: as regras precisam de
 * duas coisas que nao existiam ali — o MINUTO do dia (janela de horario) e o
 * caminho inverso, "que instante UTC e as 18:00 de tal dia no Brasil"
 * (`brInstantAt`, usada para responder ao aluno QUANDO destrava). E este
 * arquivo tem um gemeo no LMS, entao mantê-lo fechado em si mesmo e o que faz
 * os dois lados nao divergirem.
 *
 * `brDayStartUtc` e reexportado de `lib/dates` de proposito: continua havendo
 * UMA definicao de "inicio do dia brasileiro" no PMB.
 */
import { BR_TIMEZONE, brDayStartUtc } from "@/lib/dates"

export { brDayStartUtc }

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BR_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
})

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

interface BrParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

function brParts(at: Date): BrParts {
  const parts = FMT.formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0"
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  }
}

/** Dia da semana no Brasil: 0 = domingo ... 6 = sabado. */
export function brWeekday(at: Date = new Date()): number {
  return brParts(at).weekday
}

/** Minutos desde a meia-noite no Brasil (0..1439). */
export function brMinutesOfDay(at: Date = new Date()): number {
  const p = brParts(at)
  return p.hour * 60 + p.minute
}

/**
 * Deslocamento do fuso brasileiro, em minutos, NAQUELE instante (hoje sempre
 * -180). Derivado do proprio Intl em vez de constante: o Brasil ja teve
 * horario de verao e pode voltar a ter, e uma constante silenciosamente errada
 * deslocaria toda janela de horario em uma hora sem ninguem perceber.
 */
function brOffsetMinutes(at: Date): number {
  const p = brParts(at)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // Zera os milissegundos do instante: `asUtc` nao os tem, e a diferenca deve
  // sair em minutos exatos.
  const truncated = Math.floor(at.getTime() / 1000) * 1000
  return Math.round((asUtc - truncated) / 60_000)
}

/**
 * Instante UTC do minuto `minutes` do dia civil brasileiro que `dayStartUtc`
 * representa (o retorno de `brDayStartUtc`, meia-noite UTC daquele dia).
 *
 * `minutes` pode ser 1440 = meia-noite do dia SEGUINTE, que e como a ponta
 * "ate as 24:00" de uma janela e representada.
 *
 * Duas passadas: a primeira usa o deslocamento do palpite, a segunda o do
 * instante ja corrigido. Isso converge inclusive numa eventual virada de
 * horario de verao, onde as duas pontas do dia tem deslocamentos diferentes.
 */
export function brInstantAt(dayStartUtc: Date, minutes: number): Date {
  // `dayStartUtc` e meia-noite UTC do dia civil — os componentes de data saem
  // dele diretamente, sem passar pelo fuso (converte-lo aqui o jogaria para o
  // dia anterior).
  const base = Date.UTC(
    dayStartUtc.getUTCFullYear(),
    dayStartUtc.getUTCMonth(),
    dayStartUtc.getUTCDate(),
  ) + minutes * 60_000

  let t = base
  for (let i = 0; i < 2; i++) {
    t = base - brOffsetMinutes(new Date(t)) * 60_000
  }
  return new Date(t)
}
