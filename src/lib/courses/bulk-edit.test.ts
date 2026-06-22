import { describe, expect, it } from "vitest"
import {
  buildBulkItems,
  draftFromRow,
  formatPrice,
  parsePrice,
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
    customParcelas: null,
    customDescription: null,
  }
  // Curso sem preço (price 0) — ex. curso LMS oculto. Aparece na planilha.
  const free: BulkRowInput = {
    id: "b",
    title: "Curso sem preço",
    price: 0,
    customParcelas: null,
    customDescription: null,
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
    drafts.a = { price: "250,00", parcelas: "6", description: "" }

    const res = buildBulkItems(rows, drafts, new Set(["a"]))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toEqual([{ id: "a", price: 250, customParcelas: 6 }])
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
