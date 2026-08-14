import { describe, it, expect } from "vitest"
import ExcelJS from "exceljs"
import type { ResellerExportPayload } from "./export-types"
import { buildResellerWorkbook, excelDate, linkText } from "./workbook"

/*
 * Aqui geramos o .xlsx DE VERDADE e lemos de volta.
 *
 * Planilha é formato binário: "abriu sem erro" não prova nada. O que importa é
 * o TIPO da célula — vencimento gravado como texto não ordena (10/02 vem antes
 * de 09/03), valor como texto não soma, e link como string não clica. Esses três
 * são justamente o motivo de alguém pedir a planilha.
 */

function payload(): ResellerExportPayload {
  return {
    filename: "revendedores-2026-08-14",
    generatedAt: "2026-08-14T12:00:00.000Z",
    filtersLabel: "apenas Nunca ativou",
    sheets: [
      {
        name: "Unidades",
        columns: [
          { header: "Unidade", kind: "text", width: 30 },
          { header: "Mensalidade (R$)", kind: "money" },
          { header: "Próximo vencimento", kind: "date" },
          { header: "Último acesso", kind: "datetime" },
          { header: "Alunos", kind: "number" },
          { header: "Link do boleto", kind: "link" },
        ],
        rows: [
          [
            "Unidade Um",
            209.9,
            "2026-08-20",
            "2026-08-13 22:30",
            42,
            "https://asaas.com/b/abc.pdf",
          ],
          ["Unidade Dois", 0, null, null, 0, null],
        ],
        note: "cortado em 10000",
      },
      {
        // Barra e colchete são proibidos no nome da aba: o arquivo abre
        // corrompido, e só na máquina de quem baixou.
        name: "Cobranças / [em aberto] muito longa para o Excel aceitar",
        columns: [{ header: "Unidade", kind: "text" }],
        rows: [["Unidade Um"]],
        note: null,
      },
    ],
  }
}

async function reopen(): Promise<ExcelJS.Workbook> {
  const buffer = await buildResellerWorkbook(payload())
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

describe("planilha .xlsx de revendedores", () => {
  it("cria uma aba por conjunto, com nome que o Excel aceita", async () => {
    const wb = await reopen()
    expect(wb.worksheets).toHaveLength(2)
    expect(wb.worksheets[0].name).toBe("Unidades")
    const segunda = wb.worksheets[1].name
    expect(segunda.length).toBeLessThanOrEqual(31)
    expect(segunda).not.toMatch(/[\\/?*[\]:]/)
  })

  it("linha 1 é o contexto e linha 2 é o cabeçalho", async () => {
    const ws = (await reopen()).getWorksheet("Unidades")!
    expect(String(ws.getCell("A1").value)).toContain("apenas Nunca ativou")
    // Sem o aviso de corte, a planilha truncada lê como se fosse tudo.
    expect(String(ws.getCell("A1").value)).toContain("cortado em 10000")
    expect(ws.getCell("A2").value).toBe("Unidade")
    expect(ws.getCell("F2").value).toBe("Link do boleto")
  })

  it("valor vira número (somável), não texto", async () => {
    const ws = (await reopen()).getWorksheet("Unidades")!
    expect(ws.getCell("B3").value).toBe(209.9)
    expect(ws.getCell("B3").numFmt).toContain("R$")
    expect(ws.getCell("E3").value).toBe(42)
  })

  it("vencimento vira DATA no dia certo, não texto", async () => {
    const ws = (await reopen()).getWorksheet("Unidades")!
    const cell = ws.getCell("C3")
    expect(cell.value).toBeInstanceOf(Date)
    // Guardado em UTC: o mesmo arquivo tem que mostrar 20/08 em qualquer fuso.
    expect((cell.value as Date).toISOString()).toBe("2026-08-20T00:00:00.000Z")
    expect(cell.numFmt).toBe("dd/mm/yyyy")

    const dataHora = ws.getCell("D3")
    expect((dataHora.value as Date).toISOString()).toBe("2026-08-13T22:30:00.000Z")
    expect(dataHora.numFmt).toBe("dd/mm/yyyy hh:mm")
  })

  it("link do boleto sai clicável, com texto curto", async () => {
    const ws = (await reopen()).getWorksheet("Unidades")!
    const cell = ws.getCell("F3")
    const value = cell.value as { text: string; hyperlink: string }
    expect(value.hyperlink).toBe("https://asaas.com/b/abc.pdf")
    expect(value.text).toBe("asaas.com/b/abc.pdf")
  })

  it("célula vazia continua vazia — não vira 'null' escrito", async () => {
    const ws = (await reopen()).getWorksheet("Unidades")!
    for (const ref of ["C4", "D4", "F4"]) {
      expect(ws.getCell(ref).value, ref).toBeNull()
    }
    // Zero é um valor, não uma ausência: tem que sobreviver.
    expect(ws.getCell("B4").value).toBe(0)
    expect(ws.getCell("E4").value).toBe(0)
  })

  it("liga o filtro do Excel sobre a linha de cabeçalho", async () => {
    const ws = (await reopen()).getWorksheet("Unidades")!
    expect(ws.autoFilter).toBeTruthy()
  })

  it("data fora do formato vira texto visível em vez de sumir", () => {
    expect(excelDate("14/08/2026")).toBeNull()
    expect(excelDate("2026-08-20")?.toISOString()).toBe("2026-08-20T00:00:00.000Z")
  })

  it("encurta a URL sem inventar quando ela não é URL", () => {
    expect(linkText("https://x.com/a/b?q=1")).toBe("x.com/a/b")
    expect(linkText("https://x.com")).toBe("x.com")
    expect(linkText("nem-url")).toBe("nem-url")
  })
})
