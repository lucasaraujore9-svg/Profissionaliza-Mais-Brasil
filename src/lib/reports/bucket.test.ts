import { describe, it, expect } from "vitest"
import { bucketKey, bucketLabel, fillBuckets, toSeriesPoints } from "./bucket"

describe("bucketKey", () => {
  it("day", () => {
    expect(bucketKey(new Date(2026, 5, 3, 10), "day")).toBe("2026-06-03")
  })
  it("month", () => {
    expect(bucketKey(new Date(2026, 5, 3), "month")).toBe("2026-06")
  })
  it("week ancora na segunda", () => {
    // 2026-06-03 é uma quarta → segunda da semana = 2026-06-01
    expect(bucketKey(new Date(2026, 5, 3), "week")).toBe("2026-06-01")
  })
})

describe("bucketLabel", () => {
  it("day → dd/mm", () => {
    expect(bucketLabel("2026-06-03", "day")).toBe("03/06")
  })
  it("month → mmm/aa", () => {
    expect(bucketLabel("2026-06", "month")).toBe("jun/26")
  })
})

describe("fillBuckets", () => {
  it("gera eixo denso de dias inclusivo no início e exclusivo no fim", () => {
    const start = new Date(2026, 5, 1)
    const end = new Date(2026, 5, 4) // exclusivo
    expect(fillBuckets(start, end, "day")).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ])
  })
  it("gera eixo de meses", () => {
    const start = new Date(2026, 4, 10)
    const end = new Date(2026, 7, 1)
    expect(fillBuckets(start, end, "month")).toEqual(["2026-05", "2026-06", "2026-07"])
  })
})

describe("toSeriesPoints", () => {
  it("preenche zeros nos buckets sem dado e nomeia a coluna", () => {
    const axis = ["2026-06-01", "2026-06-02", "2026-06-03"]
    const rows = [
      { bucket: new Date(2026, 5, 1), value: 100 },
      { bucket: new Date(2026, 5, 3), value: 250 },
    ]
    expect(toSeriesPoints(rows, axis, "day", "receita")).toEqual([
      { x: "01/06", receita: 100 },
      { x: "02/06", receita: 0 },
      { x: "03/06", receita: 250 },
    ])
  })
})
