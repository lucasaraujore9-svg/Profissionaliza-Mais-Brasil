import { describe, it, expect } from "vitest"
import { currentBrMonth, defaultMonthFilter, filterByMonth, monthLabel } from "./months"

const arts = [
  { id: "a", month: 10 },
  { id: "b", month: null },
  { id: "c", month: 12 },
]

describe("artes por mês", () => {
  it("filtra pela pasta do mês, pelo ano todo e por todas", () => {
    expect(filterByMonth(arts, 10).map((a) => a.id)).toEqual(["a"])
    expect(filterByMonth(arts, "year").map((a) => a.id)).toEqual(["b"])
    expect(filterByMonth(arts, "all")).toHaveLength(3)
  })

  it("mês corrente no fuso de Brasília, não em UTC", () => {
    // 31/10 22:00 em Brasília = 01/11 01:00 UTC
    expect(currentBrMonth(new Date("2026-11-01T01:00:00Z"))).toBe(10)
    expect(currentBrMonth(new Date("2026-11-01T03:30:00Z"))).toBe(11)
  })

  it("abre no mês corrente só quando ele tem arte", () => {
    expect(defaultMonthFilter(arts, 10)).toBe(10)
    expect(defaultMonthFilter(arts, 3)).toBe("all")
  })

  it("rótulo", () => {
    expect(monthLabel(12)).toBe("Dezembro")
    expect(monthLabel(null)).toBe("Ano todo")
  })
})
