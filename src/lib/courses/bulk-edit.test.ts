import { describe, expect, it } from "vitest"
import {
  BULK_EDIT_MAX_ITEMS,
  buildBulkItems,
  chunkBulkItems,
  draftFromRow,
  formatPrice,
  parsePrice,
  type BulkItem,
  type BulkRowInput,
  type RowDraft,
} from "./bulk-edit"

function rowsToDrafts(rows: BulkRowInput[]): Record<string, RowDraft> {
  return Object.fromEntries(rows.map((r) => [r.id, draftFromRow(r)]))
}

describe("parsePrice / formatPrice round-trip", () => {
  it("mantém valores com milhar no formato BR", () => {
    expect(parsePrice(formatPrice(1997))).toBe(1997)
    expect(parsePrice(formatPrice(197.9))).toBe(197.9)
  })
})

describe("buildBulkItems", () => {
  const priced: BulkRowInput = {
    id: "a",
    title: "Curso com preço",
    price: 197.9,
    precoDe: null,
    customParcelas: null,
    customDescription: null,
    customAprendizado: [],
  }
  // Curso sem preço (price 0) — ex. curso LMS oculto. Aparece na planilha.
  const free: BulkRowInput = {
    id: "b",
    title: "Curso sem preço",
    price: 0,
    precoDe: null,
    customParcelas: null,
    customDescription: null,
    customAprendizado: [],
  }

  it("envia somente os campos alterados (parcelas) sem tocar no preço", () => {
    const rows = [priced]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, parcelas: "12" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "a", customParcelas: 12 }])
    // preço não foi incluído porque não mudou
    expect(res.items[0]).not.toHaveProperty("price")
  })

  it("REGRESSÃO: mudar parcelas de um curso sem preço não dispara erro de preço", () => {
    const rows = [free]
    const drafts = rowsToDrafts(rows)
    drafts.b = { ...drafts.b, parcelas: "10" }

    const res = buildBulkItems(rows, drafts, new Set(["b"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "b", customParcelas: 10 }])
  })

  it("limpa parcelas (volta ao padrão) enviando null", () => {
    const rows = [{ ...priced, customParcelas: 12 }]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, parcelas: "" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "a", customParcelas: null }])
  })

  it("valida preço apenas quando o preço foi alterado", () => {
    const rows = [priced]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, price: "0,00" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain("Preço inválido")
  })

  it("rejeita parcelas fora do intervalo 1–24", () => {
    const rows = [priced]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, parcelas: "36" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain("entre 1 e 24")
  })

  it("envia preço e parcelas juntos quando ambos mudaram", () => {
    const rows = [priced]
    const drafts = rowsToDrafts(rows)
    drafts.a = {
      price: "250,00",
      precoDe: "",
      parcelas: "6",
      description: "",
      aprendizado: "",
    }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "a", price: 250, customParcelas: 6 }])
  })

  it("envia o 'vai aprender' como lista, uma linha por item", () => {
    const rows = [priced]
    const drafts = rowsToDrafts(rows)
    drafts.a = {
      ...drafts.a,
      aprendizado: "Corte masculino\n  Barba  \n\nColoração\n",
    }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // Linhas em branco somem e os itens vêm trimados.
    expect(res.items).toEqual([
      {
        id: "a",
        customAprendizado: ["Corte masculino", "Barba", "Coloração"],
      },
    ])
  })

  it("limpar o 'vai aprender' envia lista vazia (volta ao padrão)", () => {
    const rows = [{ ...priced, customAprendizado: ["Item próprio"] }]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, aprendizado: "" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "a", customAprendizado: [] }])
  })

  it("não envia o 'vai aprender' quando só o preço mudou", () => {
    const rows = [{ ...priced, customAprendizado: ["Item próprio"] }]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, price: "250,00" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "a", price: 250 }])
    expect(res.items[0]).not.toHaveProperty("customAprendizado")
  })

  it("envia o preço de tabela quando maior que o preço de venda", () => {
    const rows = [priced]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, precoDe: "397,00" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "a", precoDe: 397 }])
  })

  it("limpar o preço de tabela envia null (vitrine deixa de exibir 'De')", () => {
    const rows = [{ ...priced, precoDe: 397 }]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, precoDe: "" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // null explícito, não `undefined`: "não mexi" e "tire o De" são coisas
    // diferentes e só uma delas grava.
    expect(res.items).toEqual([{ id: "a", precoDe: null }])
  })

  it("rejeita preço de tabela menor ou igual ao preço de venda", () => {
    const rows = [priced]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, precoDe: "197,90" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain("maior que o preço de venda")
  })

  it("compara o 'De' contra o preço NOVO quando os dois mudam na mesma linha", () => {
    const rows = [priced]
    const drafts = rowsToDrafts(rows)
    // 250 seria um "De" válido contra o preço antigo (197,90), mas o preço de
    // venda desta mesma linha subiu para 300 no lote.
    drafts.a = { ...drafts.a, price: "300,00", precoDe: "250,00" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain("maior que o preço de venda")
  })

  it("não valida o 'De' de curso sem preço (price 0)", () => {
    const rows = [free]
    const drafts = rowsToDrafts(rows)
    drafts.b = { ...drafts.b, precoDe: "97,00" }

    const res = buildBulkItems(rows, drafts, new Set(["b"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "b", precoDe: 97 }])
  })

  it("ignora linhas não marcadas como alteradas", () => {
    const rows = [priced, free]
    const drafts = rowsToDrafts(rows)
    drafts.a = { ...drafts.a, parcelas: "12" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toHaveLength(1)
    expect(res.items[0].id).toBe("a")
  })
})

describe("chunkBulkItems", () => {
  const make = (n: number): BulkItem[] =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i}`, price: 39.9 }))

  it("nao fatia quando cabe num envio so", () => {
    const chunks = chunkBulkItems(make(212), BULK_EDIT_MAX_ITEMS)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(212)
  })

  it("fatia no teto e preserva todos os itens, sem repetir nem perder", () => {
    const items = make(1201)
    const chunks = chunkBulkItems(items, BULK_EDIT_MAX_ITEMS)
    expect(chunks).toHaveLength(3)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(BULK_EDIT_MAX_ITEMS)
    }
    const flat = chunks.flat()
    expect(flat).toEqual(items)
    expect(new Set(flat.map((i) => i.id)).size).toBe(items.length)
  })

  it("lista vazia nao gera envio nenhum", () => {
    expect(chunkBulkItems([], BULK_EDIT_MAX_ITEMS)).toEqual([])
  })

  it("recusa tamanho de lote invalido", () => {
    expect(() => chunkBulkItems(make(3), 0)).toThrow()
  })
})
