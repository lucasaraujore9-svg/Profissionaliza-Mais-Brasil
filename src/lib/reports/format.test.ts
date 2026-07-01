import { describe, it, expect } from "vitest"
import {
  formatShortCurrency,
  formatCompactNumber,
  formatPercent,
  formatDelta,
  formatByFormat,
} from "./format"

describe("formatShortCurrency", () => {
  it("mil", () => expect(formatShortCurrency(50200)).toBe("R$ 50,2 mil"))
  it("milhão", () => expect(formatShortCurrency(3_400_000)).toBe("R$ 3,4 mi"))
  it("valores pequenos usam formatCurrency completo", () => {
    const out = formatShortCurrency(150)
    expect(out.startsWith("R$")).toBe(true)
    expect(out).toContain("150,00")
  })
})

describe("formatCompactNumber", () => {
  it("mil", () => expect(formatCompactNumber(1200)).toBe("1,2 mil"))
  it("pequeno", () => expect(formatCompactNumber(42)).toBe("42"))
})

describe("formatPercent", () => {
  it("1 casa por padrão", () => expect(formatPercent(12.34)).toBe("12,3%"))
})

describe("formatDelta", () => {
  it("subida", () => {
    const d = formatDelta(150, 100)
    expect(d.dir).toBe("up")
    expect(d.pct).toBe(50)
    expect(d.label).toBe("+50,0%")
  })
  it("descida", () => {
    const d = formatDelta(80, 100)
    expect(d.dir).toBe("down")
    expect(d.label).toBe("-20,0%")
  })
  it("sem base comparável (previous 0, current 0) → flat/—", () => {
    const d = formatDelta(0, 0)
    expect(d.pct).toBeNull()
    expect(d.label).toBe("—")
  })
  it("base 0 e current positivo → +100%", () => {
    const d = formatDelta(5, 0)
    expect(d.label).toBe("+100%")
    expect(d.dir).toBe("up")
  })
})

describe("formatByFormat", () => {
  it("percent", () => expect(formatByFormat(12.3, "percent")).toBe("12,3%"))
  it("number", () => expect(formatByFormat(1500, "number")).toBe("1.500"))
  it("text passthrough", () => expect(formatByFormat("ABC", "text")).toBe("ABC"))
  it("null → travessão", () => expect(formatByFormat(null, "currency")).toBe("—"))
})
