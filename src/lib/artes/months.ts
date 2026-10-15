// Organizacao do banco de artes por MES (PURO — usado pelo admin e pelo painel,
// os dois client components). month 1..12 = arte feita para aquele mes (data
// comemorativa, campanha); null = vale o ano todo.

export const ART_MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const

// "all" = todas; "year" = so as que valem o ano todo; 1..12 = pasta do mes.
export type MonthFilter = "all" | "year" | number

export function monthLabel(month: number | null): string {
  return month ? ART_MONTHS[month - 1] : "Ano todo"
}

export function filterByMonth<T extends { month: number | null }>(
  arts: T[],
  filter: MonthFilter,
): T[] {
  if (filter === "all") return arts
  if (filter === "year") return arts.filter((a) => a.month == null)
  return arts.filter((a) => a.month === filter)
}

// Mes corrente no calendario BRASILEIRO (o servidor roda em UTC: na virada do
// mes, as 21h de Brasilia, UTC ja estaria no mes seguinte).
export function currentBrMonth(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(
      now,
    ),
  )
}

// Pasta que o painel abre por padrao: o mes corrente, se tiver arte; senao todas.
export function defaultMonthFilter<T extends { month: number | null }>(
  arts: T[],
  month: number,
): MonthFilter {
  return arts.some((a) => a.month === month) ? month : "all"
}
