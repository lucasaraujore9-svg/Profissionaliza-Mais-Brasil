import { describe, it, expect } from "vitest"
import {
  createSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
} from "./sections"

// API-003: os envelopes de request de home-sections passaram a ter validação
// Zod declarativa no boundary (kind ∈ enum, config = objeto, campos de update
// no tipo certo, order = array de strings). A validação granular por kind
// continua em validateSectionPayload — aqui testamos só o gate de formato.

describe("createSectionSchema", () => {
  it("aceita envelope válido (kind conhecido + config objeto)", () => {
    const r = createSectionSchema.safeParse({
      kind: "bestsellers",
      config: { title: "Mais vendidos" },
    })
    expect(r.success).toBe(true)
  })

  it("rejeita kind desconhecido", () => {
    const r = createSectionSchema.safeParse({
      kind: "kind_que_nao_existe",
      config: {},
    })
    expect(r.success).toBe(false)
  })

  it("rejeita config ausente", () => {
    const r = createSectionSchema.safeParse({ kind: "tecnica" })
    expect(r.success).toBe(false)
  })

  it("rejeita config não-objeto", () => {
    const r = createSectionSchema.safeParse({ kind: "tecnica", config: "x" })
    expect(r.success).toBe(false)
  })

  it("rejeita body não-objeto (null / string)", () => {
    expect(createSectionSchema.safeParse(null).success).toBe(false)
    expect(createSectionSchema.safeParse("nope").success).toBe(false)
  })
})

describe("updateSectionSchema", () => {
  it("aceita patch só de enabled", () => {
    expect(updateSectionSchema.safeParse({ enabled: false }).success).toBe(true)
  })

  it("aceita patch só de position (>= 0)", () => {
    expect(updateSectionSchema.safeParse({ position: 0 }).success).toBe(true)
    expect(updateSectionSchema.safeParse({ position: 3 }).success).toBe(true)
  })

  it("aceita patch de config (objeto)", () => {
    expect(
      updateSectionSchema.safeParse({ config: { title: "x" } }).success,
    ).toBe(true)
  })

  it("rejeita enabled não-boolean", () => {
    expect(updateSectionSchema.safeParse({ enabled: "yes" }).success).toBe(false)
  })

  it("rejeita position negativa", () => {
    expect(updateSectionSchema.safeParse({ position: -1 }).success).toBe(false)
  })

  it("rejeita position não-finita", () => {
    expect(
      updateSectionSchema.safeParse({ position: Number.POSITIVE_INFINITY })
        .success,
    ).toBe(false)
  })

  it("rejeita patch vazio (nenhum campo para atualizar)", () => {
    expect(updateSectionSchema.safeParse({}).success).toBe(false)
  })
})

describe("reorderSectionsSchema", () => {
  it("aceita order = array de strings", () => {
    expect(
      reorderSectionsSchema.safeParse({ order: ["a", "b", "c"] }).success,
    ).toBe(true)
  })

  it("aceita order vazia", () => {
    expect(reorderSectionsSchema.safeParse({ order: [] }).success).toBe(true)
  })

  it("rejeita order não-array", () => {
    expect(reorderSectionsSchema.safeParse({ order: "a,b" }).success).toBe(false)
  })

  it("rejeita order com elemento não-string", () => {
    expect(
      reorderSectionsSchema.safeParse({ order: ["a", 2, "c"] }).success,
    ).toBe(false)
  })

  it("rejeita body sem order", () => {
    expect(reorderSectionsSchema.safeParse({}).success).toBe(false)
  })
})
