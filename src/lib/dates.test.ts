import { describe, it, expect } from "vitest"
import {
  addMonthsClamped,
  addMonthsClampedUtc,
  brDayStartUtc,
  daysUntilBrDay,
} from "./dates"

// Protege R7: o cálculo de vencimento da inadimplência não pode usar setMonth
// nativo (overflow), senão o bloqueio atrasa ~1 mês para dias 29-31.
describe("addMonthsClamped", () => {
  it("soma meses preservando o dia quando válido", () => {
    const r = addMonthsClamped(new Date(2026, 0, 15), 1)
    expect(r.getMonth()).toBe(1) // fevereiro
    expect(r.getDate()).toBe(15)
  })

  it("clampa 31/jan + 1 mês para o último dia de fevereiro (não overflow p/ março)", () => {
    const r = addMonthsClamped(new Date(2026, 0, 31), 1)
    expect(r.getMonth()).toBe(1) // fevereiro, NÃO março
    expect(r.getDate()).toBe(28) // 2026 não é bissexto
  })

  it("clampa 31/jan + 1 mês em ano bissexto para 29/fev", () => {
    const r = addMonthsClamped(new Date(2024, 0, 31), 1)
    expect(r.getMonth()).toBe(1)
    expect(r.getDate()).toBe(29)
  })

  it("avança de ano corretamente", () => {
    const r = addMonthsClamped(new Date(2026, 10, 30), 3) // nov -> fev
    expect(r.getFullYear()).toBe(2027)
    expect(r.getMonth()).toBe(1)
    expect(r.getDate()).toBe(28)
  })

  it("months=0 retorna a mesma data", () => {
    const base = new Date(2026, 5, 10)
    expect(addMonthsClamped(base, 0).getTime()).toBe(base.getTime())
  })
})

// O cron roda em UTC, mas o vencimento do boleto é uma data civil brasileira.
// Sem a conversão de fuso, o aviso de "vence hoje" sairia com um dia de erro.
describe("brDayStartUtc", () => {
  it("00:30 UTC ainda é o dia ANTERIOR no Brasil (BRT = UTC-3)", () => {
    // 2026-08-10T00:30Z = 2026-08-09 21:30 em São Paulo
    expect(brDayStartUtc(new Date("2026-08-10T00:30:00.000Z")).toISOString()).toBe(
      "2026-08-09T00:00:00.000Z",
    )
  })

  it("meio-dia UTC já é o mesmo dia no Brasil", () => {
    expect(brDayStartUtc(new Date("2026-08-10T12:00:00.000Z")).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    )
  })

  it("03:00 UTC é exatamente a virada do dia no Brasil", () => {
    expect(brDayStartUtc(new Date("2026-08-10T03:00:00.000Z")).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    )
  })
})

describe("daysUntilBrDay", () => {
  // Horário do cron: 11:00 UTC = 08:00 BRT.
  const now = new Date("2026-08-10T11:00:00.000Z")

  it("vencimento hoje = 0", () => {
    expect(daysUntilBrDay(new Date("2026-08-10T00:00:00.000Z"), now)).toBe(0)
  })

  it("conta as janelas de 5 e 2 dias", () => {
    expect(daysUntilBrDay(new Date("2026-08-15T00:00:00.000Z"), now)).toBe(5)
    expect(daysUntilBrDay(new Date("2026-08-12T00:00:00.000Z"), now)).toBe(2)
  })

  it("vencido devolve negativo", () => {
    expect(daysUntilBrDay(new Date("2026-08-07T00:00:00.000Z"), now)).toBe(-3)
  })

  it("não escorrega de dia às 23h BRT (02:00 UTC do dia seguinte)", () => {
    const lateNight = new Date("2026-08-11T02:00:00.000Z") // 10/08 23:00 BRT
    expect(daysUntilBrDay(new Date("2026-08-10T00:00:00.000Z"), lateNight)).toBe(0)
  })
})

describe("addMonthsClampedUtc", () => {
  it("clampa em UTC, independente do fuso do processo", () => {
    // `new Date("2026-12-31")` é meia-noite UTC — em fuso negativo já é dia 30
    // em horário local, e a versão local devolveria 01/03 aqui.
    const r = addMonthsClampedUtc(new Date("2026-12-31"), 2)
    expect(r.toISOString().slice(0, 10)).toBe("2027-02-28")
  })

  it("preserva o dia quando o mês alvo o tem", () => {
    expect(
      addMonthsClampedUtc(new Date("2026-08-23"), 2).toISOString().slice(0, 10),
    ).toBe("2026-10-23")
  })

  it("ano bissexto: 31/01 + 1 mês = 29/02", () => {
    expect(
      addMonthsClampedUtc(new Date("2028-01-31"), 1).toISOString().slice(0, 10),
    ).toBe("2028-02-29")
  })

  it("zero meses é identidade", () => {
    const base = new Date("2026-09-15")
    expect(addMonthsClampedUtc(base, 0).getTime()).toBe(base.getTime())
  })
})
