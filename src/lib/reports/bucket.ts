import type { Bucket } from "./period"
import type { SeriesPoint } from "./types"

/**
 * Helpers de bucketing de séries temporais compartilhados pelos dois hubs.
 *
 * O `date_trunc(bucket, ...)` do Postgres só devolve buckets que TÊM dado —
 * dias/meses sem venda somem do resultado. `fillBuckets` + `toSeriesPoints`
 * geram um eixo denso (com zeros) para os gráficos não "pularem" períodos.
 */

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** Chave canônica ordenável de um instante para o bucket dado. */
export function bucketKey(d: Date, bucket: Bucket): string {
  switch (bucket) {
    case "hour":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`
    case "day":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    case "week": {
      // Segunda-feira que ancora a semana (ISO-ish, começa na segunda).
      const c = new Date(d)
      c.setHours(0, 0, 0, 0)
      const day = (c.getDay() + 6) % 7 // 0 = segunda
      c.setDate(c.getDate() - day)
      return `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`
    }
    case "month":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  }
}

/** Rótulo curto de eixo para uma chave de bucket. */
export function bucketLabel(key: string, bucket: Bucket): string {
  switch (bucket) {
    case "hour": {
      const hh = key.slice(11, 13)
      return `${hh}h`
    }
    case "day":
    case "week": {
      const [, mm, dd] = key.split("-")
      return `${dd}/${mm}`
    }
    case "month": {
      const [y, mm] = key.split("-")
      return `${MONTH_LABELS[Number(mm) - 1]}/${y.slice(2)}`
    }
  }
}

function stepBucket(d: Date, bucket: Bucket): Date {
  const c = new Date(d)
  switch (bucket) {
    case "hour":
      c.setHours(c.getHours() + 1)
      break
    case "day":
      c.setDate(c.getDate() + 1)
      break
    case "week":
      c.setDate(c.getDate() + 7)
      break
    case "month":
      c.setMonth(c.getMonth() + 1)
      break
  }
  return c
}

/**
 * Lista densa e ordenada de chaves de bucket no intervalo `[start, end)`.
 * Alinha o cursor ao início do bucket para não perder o primeiro ponto.
 */
export function fillBuckets(start: Date, end: Date, bucket: Bucket): string[] {
  const keys: string[] = []
  const cursor = new Date(start)
  // Alinha o cursor ao começo do bucket.
  switch (bucket) {
    case "hour":
      cursor.setMinutes(0, 0, 0)
      break
    case "day":
      cursor.setHours(0, 0, 0, 0)
      break
    case "week": {
      cursor.setHours(0, 0, 0, 0)
      const day = (cursor.getDay() + 6) % 7
      cursor.setDate(cursor.getDate() - day)
      break
    }
    case "month":
      cursor.setDate(1)
      cursor.setHours(0, 0, 0, 0)
      break
  }
  // Guarda de segurança contra loop infinito (máx. ~1000 buckets).
  let guard = 0
  while (cursor < end && guard < 1000) {
    keys.push(bucketKey(cursor, bucket))
    const next = stepBucket(cursor, bucket)
    cursor.setTime(next.getTime())
    guard += 1
  }
  return keys
}

/**
 * Projeta linhas cruas de `date_trunc` (`{ bucket: Date, value: number }`)
 * sobre um eixo denso, preenchendo zeros e nomeando a coluna com `valueKey`.
 */
export function toSeriesPoints(
  rows: { bucket: Date; value: number }[],
  axis: string[],
  bucket: Bucket,
  valueKey = "value",
): SeriesPoint[] {
  const byKey = new Map<string, number>()
  for (const r of rows) {
    byKey.set(bucketKey(new Date(r.bucket), bucket), Number(r.value))
  }
  return axis.map((key) => ({
    x: bucketLabel(key, bucket),
    [valueKey]: byKey.get(key) ?? 0,
  }))
}
