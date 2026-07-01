import { describe, it, expect } from "vitest"
import { resolvePeriod, pctChange } from "./period"

// Referência fixa: 2026-06-15 14:30 local.
const NOW = new Date(2026, 5, 15, 14, 30, 0, 0)

describe("resolvePeriod", () => {
  it("default 30d quando preset ausente/ inválido", () => {
    const p = resolvePeriod({ now: NOW })
    expect(p.preset).toBe("30d")
    expect(p.bucket).toBe("day")
    // 30 dias: início 29 dias antes (00:00).
    expect(p.start.getDate()).toBe(17)
    expect(p.start.getMonth()).toBe(4) // maio
    expect(p.start.getHours()).toBe(0)
  })

  it("today usa bucket hour e começa à meia-noite", () => {
    const p = resolvePeriod({ preset: "today", now: NOW })
    expect(p.bucket).toBe("hour")
    expect(p.start.getHours()).toBe(0)
    expect(p.start.getDate()).toBe(15)
  })

  it("12m alinha ao 1º dia do mês e usa bucket month", () => {
    const p = resolvePeriod({ preset: "12m", now: NOW })
    expect(p.bucket).toBe("month")
    expect(p.start.getDate()).toBe(1)
    // 11 meses antes de jun/2026 = jul/2025 (dá 12 buckets: jul..jun).
    expect(p.start.getMonth()).toBe(6)
    expect(p.start.getFullYear()).toBe(2025)
  })

  it("janela anterior tem o mesmo tamanho e termina no início da atual", () => {
    const p = resolvePeriod({ preset: "7d", now: NOW })
    const span = p.end.getTime() - p.start.getTime()
    const prevSpan = p.previous.end.getTime() - p.previous.start.getTime()
    expect(prevSpan).toBe(span)
    expect(p.previous.end.getTime()).toBe(p.start.getTime())
  })

  it("custom from/to tem prioridade e fim exclusivo (to + 1 dia)", () => {
    const p = resolvePeriod({ from: "2026-06-01", to: "2026-06-30", now: NOW })
    expect(p.preset).toBe("custom")
    expect(p.start.getDate()).toBe(1)
    expect(p.start.getMonth()).toBe(5)
    // fim exclusivo = 01/07
    expect(p.end.getDate()).toBe(1)
    expect(p.end.getMonth()).toBe(6)
    expect(p.bucket).toBe("day")
  })

  it("custom com intervalo grande usa bucket month", () => {
    const p = resolvePeriod({ from: "2025-01-01", to: "2026-01-01", now: NOW })
    expect(p.bucket).toBe("month")
  })

  it("custom inverte from/to quando vierem trocados", () => {
    const p = resolvePeriod({ from: "2026-06-30", to: "2026-06-01", now: NOW })
    expect(p.start.getDate()).toBe(1)
  })
})

describe("pctChange", () => {
  it("calcula variação percentual normal", () => {
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(50, 100)).toBe(-50)
  })
  it("retorna 100 quando base 0 e atual positivo", () => {
    expect(pctChange(10, 0)).toBe(100)
  })
  it("retorna null quando base 0 e atual 0", () => {
    expect(pctChange(0, 0)).toBeNull()
  })
})
