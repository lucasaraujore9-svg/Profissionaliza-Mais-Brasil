import { describe, expect, it } from "vitest"
import { artLayoutSchema, parseArtLayout } from "./layout-schema"

const valid = {
  feed: {
    logo: { cx: 0.8, cy: 0.08, w: 0.28, h: 0.11, bg: true },
    price: { cx: 0.8, cy: 0.85, scale: 1.2 },
    footerBg: true,
  },
  story: {
    logo: { cx: 0.2, cy: 0.06, w: 0.25, h: 0.08, bg: false },
    footerBg: false,
  },
}

describe("artLayoutSchema", () => {
  it("aceita payload válido (roundtrip)", () => {
    const parsed = artLayoutSchema.parse(valid)
    expect(parsed.feed.logo.cx).toBe(0.8)
    expect(parsed.story?.footerBg).toBe(false)
  })

  it("rejeita valores fora dos limites", () => {
    expect(
      artLayoutSchema.safeParse({
        feed: { ...valid.feed, logo: { ...valid.feed.logo, cx: 1.2 } },
      }).success,
    ).toBe(false)
    expect(
      artLayoutSchema.safeParse({
        feed: { ...valid.feed, logo: { ...valid.feed.logo, w: 0.01 } },
      }).success,
    ).toBe(false)
    expect(
      artLayoutSchema.safeParse({
        feed: { ...valid.feed, price: { cx: 0.5, cy: 0.5, scale: 3 } },
      }).success,
    ).toBe(false)
  })

  it("aceita footerColor hex e rejeita formato inválido", () => {
    expect(
      artLayoutSchema.safeParse({
        feed: { ...valid.feed, footerColor: "#a3e635" },
      }).success,
    ).toBe(true)
    expect(
      artLayoutSchema.safeParse({
        feed: { ...valid.feed, footerColor: "verde" },
      }).success,
    ).toBe(false)
    expect(
      artLayoutSchema.safeParse({
        feed: { ...valid.feed, footerColor: "#fff" },
      }).success,
    ).toBe(false)
  })

  it("faz strip de chaves desconhecidas", () => {
    const parsed = artLayoutSchema.parse({
      feed: { ...valid.feed, extra: "x" },
    })
    expect("extra" in parsed.feed).toBe(false)
  })
})

describe("parseArtLayout", () => {
  it("devolve null para lixo", () => {
    expect(parseArtLayout(null)).toBeNull()
    expect(parseArtLayout("string")).toBeNull()
    expect(parseArtLayout(42)).toBeNull()
    expect(parseArtLayout({})).toBeNull()
  })

  it("devolve o layout para JSONB válido", () => {
    expect(parseArtLayout(valid)?.feed.logo.bg).toBe(true)
  })
})
