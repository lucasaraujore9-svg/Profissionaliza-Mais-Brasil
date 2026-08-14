/**
 * Transforma o payload do export num arquivo .xlsx.
 *
 * Roda no NAVEGADOR (o `exceljs` entra por import dinâmico, como no hub de
 * relatórios), mas mora aqui e não dentro do componente para poder ser testado:
 * planilha é um formato binário — "abriu sem erro" não prova que a coluna de
 * vencimento virou data em vez de texto, nem que o link do boleto clica.
 *
 * O módulo é BURRO de propósito: ele não sabe o que é uma unidade. Quais colunas
 * existem e o que cada uma significa é decisão do servidor (`export-rows`).
 */
import {
  sanitizeSheetName,
  type ExportCell,
  type ExportColumn,
  type ExportSheet,
  type ResellerExportPayload,
} from "./export-types"

/** Verde da marca, no ARGB que o Excel usa. */
const HEADER_FILL = "FF025918"
const LINK_COLOR = "FF1D4ED8"

/**
 * Datas chegam como "YYYY-MM-DD" (ou "YYYY-MM-DD HH:mm"), já resolvidas no fuso
 * certo pelo servidor. Montamos em UTC de propósito: a planilha guarda um número
 * de série sem fuso, então passar pelo horário local do navegador faria o MESMO
 * arquivo mostrar dias diferentes em máquinas diferentes.
 */
export function excelDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value.trim())
  if (!m) return null
  return new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
    ),
  )
}

/** URL inteira numa célula empurra a coluna; o texto encurta, o link não. */
export function linkText(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname.length > 1 ? u.pathname : ""}`
  } catch {
    return url
  }
}

type WritableCell = {
  value: unknown
  numFmt?: string
  font?: unknown
}

export function writeCell(
  cell: WritableCell,
  raw: ExportCell,
  kind: ExportColumn["kind"],
): void {
  if (raw === null || raw === undefined || raw === "") {
    cell.value = null
    return
  }

  switch (kind) {
    case "money":
      cell.value = Number(raw)
      cell.numFmt = "R$ #,##0.00"
      return
    case "number":
      cell.value = Number(raw)
      return
    case "date":
    case "datetime": {
      const parsed = typeof raw === "string" ? excelDate(raw) : null
      if (!parsed) {
        // Valor fora do formato vira TEXTO em vez de sumir: célula vazia
        // esconderia o dado, texto errado é visível — e corrigível.
        cell.value = String(raw)
        return
      }
      cell.value = parsed
      cell.numFmt = kind === "date" ? "dd/mm/yyyy" : "dd/mm/yyyy hh:mm"
      return
    }
    case "link":
      cell.value = { text: linkText(String(raw)), hyperlink: String(raw) }
      cell.font = { color: { argb: LINK_COLOR }, underline: true }
      return
    default:
      cell.value = String(raw)
  }
}

function addSheet(
  wb: import("exceljs").Workbook,
  sheet: ExportSheet,
  filtersLabel: string,
): void {
  const ws = wb.addWorksheet(sanitizeSheetName(sheet.name), {
    // Congela o contexto + o cabeçalho: numa planilha de 70 colunas, rolar sem
    // cabeçalho fixo é o mesmo que não ter cabeçalho.
    views: [{ state: "frozen", ySplit: 2 }],
  })

  // Linha 1 é o contexto do arquivo. Sem ela, uma planilha FILTRADA circula por
  // e-mail como se fosse a base inteira.
  const context = ws.addRow([
    `${sheet.name} · ${filtersLabel}${sheet.note ? ` · ${sheet.note}` : ""}`,
  ])
  context.font = { italic: true, size: 9, color: { argb: "FF6B7280" } }

  const header = ws.addRow(sheet.columns.map((c) => c.header))
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.alignment = { vertical: "middle", wrapText: true }
  header.height = 24
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    }
  })

  sheet.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width ?? 18
  })

  for (const row of sheet.rows) {
    const added = ws.addRow(new Array(sheet.columns.length).fill(null))
    sheet.columns.forEach((col, i) => {
      writeCell(added.getCell(i + 1), row[i] ?? null, col.kind)
    })
  }

  if (sheet.rows.length > 0) {
    ws.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2 + sheet.rows.length, column: sheet.columns.length },
    }
  }
}

export async function buildResellerWorkbook(
  payload: ResellerExportPayload,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  wb.created = new Date(payload.generatedAt)

  for (const sheet of payload.sheets) {
    addSheet(wb, sheet, payload.filtersLabel)
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}
