// CSV/Excel: celulas que comecam com `=`, `+`, `-`, `@` ou TAB sao
// interpretadas como formula pelo Excel/LibreOffice e podem executar
// codigo (CVE conhecido como "CSV injection" / "Formula injection").
// Prefixamos com `'` para neutralizar — o caractere e descartado na exibicao.
export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ""
  let str = String(value)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str
  }
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
  // Sanitiza filename para impedir CRLF injection em response headers e
  // quebrar o parsing do Content-Disposition. Inclui filename*=UTF-8''...
  // (RFC 5987/6266) para preservar acentos/símbolos.
  const safeAscii = filename
    .replace(/[\r\n"\\;]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_")
  const encoded = encodeURIComponent(filename)
  return new Response("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
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
