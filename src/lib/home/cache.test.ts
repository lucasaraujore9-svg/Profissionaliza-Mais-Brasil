import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-002: cache de DADOS cross-request da home/vitrine. Estes testes provam:
//  - HIT no Redis não toca o Postgres (loadHomeSections/loadShowcase não são chamados)
//  - MISS lê do banco e popula o cache com a chave namespaceada por tenant
//  - vazio não é cacheado (não fixa estado transitório)
//  - invalidação apaga as DUAS chaves do escopo (seções + showcase)
vi.mock("@/lib/redis/cache", () => ({
  getJson: vi.fn(),
  setJson: vi.fn(),
  invalidateMany: vi.fn(),
}))
vi.mock("./sections", () => ({ loadHomeSections: vi.fn() }))
vi.mock("@/lib/catalog/home", () => ({ loadShowcase: vi.fn() }))

import { getJson, setJson, invalidateMany } from "@/lib/redis/cache"
import { loadHomeSections } from "./sections"
import { loadShowcase } from "@/lib/catalog/home"
import {
  loadHomeSectionsCached,
  loadShowcaseCached,
  invalidateHomeCache,
} from "./cache"

const getJsonMock = getJson as unknown as ReturnType<typeof vi.fn>
const setJsonMock = setJson as unknown as ReturnType<typeof vi.fn>
const invalidateManyMock = invalidateMany as unknown as ReturnType<typeof vi.fn>
const loadSectionsMock = loadHomeSections as unknown as ReturnType<typeof vi.fn>
const loadShowcaseMock = loadShowcase as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  setJsonMock.mockResolvedValue(undefined)
  invalidateManyMock.mockResolvedValue(undefined)
})

describe("loadHomeSectionsCached (PERF-002)", () => {
  it("HIT: retorna do cache sem tocar o Postgres", async () => {
    const cached = [{ id: "s1", tenantId: null, kind: "bestsellers", position: 0, enabled: true, config: {} }]
    getJsonMock.mockResolvedValue(cached)

    const out = await loadHomeSectionsCached(null)

    expect(out).toEqual(cached)
    expect(getJsonMock).toHaveBeenCalledWith("home:sections:pmb")
    expect(loadSectionsMock).not.toHaveBeenCalled()
    expect(setJsonMock).not.toHaveBeenCalled()
  })

  it("MISS: lê do banco e popula o cache (chave por tenant)", async () => {
    getJsonMock.mockResolvedValue(null)
    const fresh = [{ id: "s2", tenantId: "t1", kind: "eja", position: 1, enabled: true, config: {} }]
    loadSectionsMock.mockResolvedValue(fresh)

    const out = await loadHomeSectionsCached("t1")

    expect(out).toEqual(fresh)
    expect(loadSectionsMock).toHaveBeenCalledWith("t1")
    expect(setJsonMock).toHaveBeenCalledWith("home:sections:t1", fresh, 60)
  })

  it("MISS vazio: não cacheia []", async () => {
    getJsonMock.mockResolvedValue(null)
    loadSectionsMock.mockResolvedValue([])

    const out = await loadHomeSectionsCached(null)

    expect(out).toEqual([])
    expect(setJsonMock).not.toHaveBeenCalled()
  })
})

describe("loadShowcaseCached (PERF-002)", () => {
  it("HIT: retorna do cache sem tocar o Postgres", async () => {
    const cached = [{ slug: "c1", titulo: "Curso", categoria: "X", preco: "R$ 1,00", imageUrl: "u", selo: "novo", accent: "gold", interestFree: 1 }]
    getJsonMock.mockResolvedValue(cached)

    const out = await loadShowcaseCached("t9")

    expect(out).toEqual(cached)
    expect(getJsonMock).toHaveBeenCalledWith("home:showcase:t9")
    expect(loadShowcaseMock).not.toHaveBeenCalled()
  })

  it("MISS: chama loadShowcase(undefined) para o escopo PMB e cacheia", async () => {
    getJsonMock.mockResolvedValue(null)
    const fresh = [{ slug: "c2", titulo: "T", categoria: "Y", preco: "R$ 2,00", imageUrl: "u2", selo: null, accent: "cyan", interestFree: 3 }]
    loadShowcaseMock.mockResolvedValue(fresh)

    const out = await loadShowcaseCached(null)

    expect(out).toEqual(fresh)
    // escopo PMB => loadShowcase() sem tenantId
    expect(loadShowcaseMock).toHaveBeenCalledWith(undefined)
    expect(setJsonMock).toHaveBeenCalledWith("home:showcase:pmb", fresh, 60)
  })

  it("MISS vazio: não cacheia [] (loadShowcase devolve [] em erro)", async () => {
    getJsonMock.mockResolvedValue(null)
    loadShowcaseMock.mockResolvedValue([])

    const out = await loadShowcaseCached("t1")

    expect(out).toEqual([])
    expect(setJsonMock).not.toHaveBeenCalled()
  })
})

describe("invalidateHomeCache (PERF-002)", () => {
  it("apaga as duas chaves do escopo PMB", async () => {
    await invalidateHomeCache(null)
    expect(invalidateManyMock).toHaveBeenCalledWith([
      "home:sections:pmb",
      "home:showcase:pmb",
    ])
  })

  it("apaga as duas chaves de um tenant (namespaced)", async () => {
    await invalidateHomeCache("t42")
    expect(invalidateManyMock).toHaveBeenCalledWith([
      "home:sections:t42",
      "home:showcase:t42",
    ])
  })
})
