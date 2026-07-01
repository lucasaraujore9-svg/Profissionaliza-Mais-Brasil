import { addMonthsClamped } from "@/lib/dates"

/**
 * Presets de período dos hubs de BI. `custom` usa `from`/`to` explícitos.
 * Espelha os presets já usados nos dashboards (admin: 7d/30d/90d/12m;
 * painel: today/7d/30d/90d/12m), unificando-os numa fonte só.
 */
export type PeriodPreset = "today" | "7d" | "30d" | "90d" | "12m" | "custom"

/** Granularidade do bucket das séries temporais (eixo X + date_trunc). */
export type Bucket = "hour" | "day" | "week" | "month"

export interface ResolvedPeriod {
  preset: PeriodPreset
  /** Início inclusivo. */
  start: Date
  /** Fim EXCLUSIVO (use `< end` nas queries). */
  end: Date
  /** Janela imediatamente anterior, de mesmo tamanho (alimenta os deltas dos KPIs). */
  previous: { start: Date; end: Date }
  bucket: Bucket
  /** Rótulo legível para exibição ("Últimos 30 dias" | "01/06 → 30/06"). */
  label: string
}

const PRESET_LABELS: Record<Exclude<PeriodPreset, "custom">, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "12m": "Últimos 12 meses",
}

const VALID_PRESETS: PeriodPreset[] = ["today", "7d", "30d", "90d", "12m", "custom"]

export function isPeriodPreset(value: unknown): value is PeriodPreset {
  return typeof value === "string" && VALID_PRESETS.includes(value as PeriodPreset)
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null
  // Aceita "YYYY-MM-DD"; interpreta em horário local (00:00) para casar com os
  // inputs type=date da barra de filtros.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

function ddmm(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/**
 * Resolve um preset (ou um intervalo custom `from`/`to`) para uma janela
 * concreta `[start, end)`, a janela anterior de mesmo tamanho e o bucket ideal.
 *
 * Regras:
 * - `today` → do início do dia até agora; bucket "hour".
 * - `7d/30d` → N dias até o início do dia de hoje +1; bucket "day".
 * - `90d` → bucket "week".
 * - `12m` → alinhado ao 1º dia do mês, 12 buckets; bucket "month".
 * - `custom` → usa `from`/`to`; bucket "day" se o intervalo ≤ ~92 dias, senão "month".
 */
export function resolvePeriod(input: {
  preset?: string | null
  from?: string | null
  to?: string | null
  now?: Date
}): ResolvedPeriod {
  const now = input.now ?? new Date()
  const customFrom = parseIsoDate(input.from ?? undefined)
  const customTo = parseIsoDate(input.to ?? undefined)

  // Intervalo custom tem prioridade quando ambos os limites são válidos.
  if (customFrom && customTo) {
    const start = startOfDay(customFrom <= customTo ? customFrom : customTo)
    // `to` é inclusivo na UI → somamos 1 dia para virar fim exclusivo.
    const endInclusive = startOfDay(customFrom <= customTo ? customTo : customFrom)
    const end = new Date(endInclusive)
    end.setDate(end.getDate() + 1)
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
    const bucket: Bucket = spanDays <= 92 ? "day" : "month"
    const spanMs = end.getTime() - start.getTime()
    return {
      preset: "custom",
      start,
      end,
      previous: { start: new Date(start.getTime() - spanMs), end: new Date(start.getTime()) },
      bucket,
      label: `${ddmm(start)} → ${ddmm(endInclusive)}`,
    }
  }

  const preset: Exclude<PeriodPreset, "custom"> = isPeriodPreset(input.preset) && input.preset !== "custom"
    ? (input.preset as Exclude<PeriodPreset, "custom">)
    : "30d"

  const end = new Date(now)
  let start: Date
  let bucket: Bucket

  switch (preset) {
    case "today":
      start = startOfDay(now)
      bucket = "hour"
      break
    case "7d":
      start = startOfDay(now)
      start.setDate(start.getDate() - 6)
      bucket = "day"
      break
    case "30d":
      start = startOfDay(now)
      start.setDate(start.getDate() - 29)
      bucket = "day"
      break
    case "90d":
      start = startOfDay(now)
      start.setDate(start.getDate() - 89)
      bucket = "week"
      break
    case "12m":
      start = addMonthsClamped(startOfDay(now), -11)
      start.setDate(1)
      bucket = "month"
      break
  }

  const spanMs = end.getTime() - start.getTime()
  return {
    preset,
    start,
    end,
    previous: { start: new Date(start.getTime() - spanMs), end: new Date(start.getTime()) },
    bucket,
    label: PRESET_LABELS[preset],
  }
}

/** Variação percentual entre dois valores (null quando não há base comparável). */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}
