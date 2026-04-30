export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n")
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}

export function brl(value: number | null | undefined): string {
  if (value === null || value === undefined) return ""
  return Number(value).toFixed(2).replace(".", ",")
}

export function isoDate(date: Date | null | undefined): string {
  if (!date) return ""
  return date.toISOString().slice(0, 10)
}

export function isoDateTime(date: Date | null | undefined): string {
  if (!date) return ""
  return date.toISOString().replace("T", " ").slice(0, 19)
}
