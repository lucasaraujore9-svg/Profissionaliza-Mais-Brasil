/**
 * Helper generico para exportar relatorios em CSV.
 *
 * Formato:
 * - BOM UTF-8 (﻿) no inicio — Excel BR abre corretamente com acentos
 * - Separador: ';' (padrao BR Excel)
 * - Quebra de linha entre linhas: '\r\n'
 * - Campos com ';', '"' ou '\n' sao envolvidos em aspas duplas e aspas internas
 *   sao duplicadas ("" — RFC 4180)
 * - null / undefined viram string vazia
 * - Date vira ISO string
 * - number vira string com ponto decimal (formato numerico, nao R$)
 * - boolean vira "true" / "false"
 */
export interface CsvHeader<Row = Record<string, unknown>> {
  key: keyof Row & string
  label: string
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return ""
    return String(value)
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function escapeCell(value: unknown): string {
  const raw = formatCell(value)
  if (raw === "") return ""
  if (
    raw.includes(";") ||
    raw.includes('"') ||
    raw.includes("\n") ||
    raw.includes("\r")
  ) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

export function arrayToCsv<Row extends Record<string, unknown>>(
  rows: Row[],
  headers: CsvHeader<Row>[],
): string {
  const sep = ";"
  const eol = "\r\n"
  const bom = "﻿"
  const headerLine = headers.map((h) => escapeCell(h.label)).join(sep)
  const body = rows
    .map((row) => headers.map((h) => escapeCell(row[h.key])).join(sep))
    .join(eol)
  return body.length > 0 ? bom + headerLine + eol + body + eol : bom + headerLine + eol
}

/**
 * Formata o filename com a data corrente no formato YYYY-MM-DD.
 */
export function csvFilename(prefix: string, date: Date = new Date()): string {
  const iso = date.toISOString().slice(0, 10)
  return `${prefix}-${iso}.csv`
}

/**
 * Headers padrao para responder com CSV.
 */
export function csvResponseHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  }
}
