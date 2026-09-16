import { describe, it, expect } from "vitest"
import {
  SUBSCRIPTION_CARNE_MAX_COUNT,
  carneDueDate,
  carneDueInDays,
  carnePeriodEnd,
  carneRowsToAppend,
  checkCarneRequest,
  defaultCarneCount,
  noonUtc,
} from "./carne-schedule"

/**
 * Assinatura no boleto (carnê): um boleto por ciclo, renovação automática.
 * O que estes testes travam é o PERÍODO que os boletos pagos compram — é ele
 * que decide o corte de acesso, e um erro aqui corta quem pagou (ou dá acesso
 * de graça a quem não pagou).
 */

const ymd = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null

describe("carneDueDate", () => {
  it("um boleto por ciclo, sempre a partir do 1º vencimento", () => {
    const first = noonUtc("2026-10-10")
    expect(ymd(carneDueDate(first, "MONTHLY", 1))).toBe("2026-10-10")
    expect(ymd(carneDueDate(first, "MONTHLY", 2))).toBe("2026-11-10")
    expect(ymd(carneDueDate(first, "MONTHLY", 13))).toBe("2027-10-10")
    expect(ymd(carneDueDate(first, "QUARTERLY", 2))).toBe("2027-01-10")
    expect(ymd(carneDueDate(first, "ANNUAL", 3))).toBe("2028-10-10")
  })

  it("fim de mês não escorrega: 31/01 volta a ser 31 em março", () => {
    // Encadear no vencimento anterior daria 28/02 → 28/03 → 28/04 para sempre.
    const first = noonUtc("2027-01-31")
    expect(ymd(carneDueDate(first, "MONTHLY", 2))).toBe("2027-02-28")
    expect(ymd(carneDueDate(first, "MONTHLY", 3))).toBe("2027-03-31")
  })
})

describe("carnePeriodEnd", () => {
  const first = noonUtc("2026-10-10")

  it("sem pagamento não há período", () => {
    expect(
      carnePeriodEnd({ firstDueDate: first, firstPaidAt: null, paidCount: 0, interval: "MONTHLY" }),
    ).toBeNull()
  })

  it("1º boleto pago ADIANTADO: o período conta do vencimento, junto com o 2º boleto", () => {
    // Contar de hoje encerraria o acesso semanas antes do 2º boleto vencer, e a
    // carência correria contra uma conta que o aluno nem recebeu.
    const end = carnePeriodEnd({
      firstDueDate: first,
      firstPaidAt: new Date("2026-09-16T15:00:00Z"),
      paidCount: 1,
      interval: "MONTHLY",
    })
    expect(ymd(end)).toBe(ymd(carneDueDate(first, "MONTHLY", 2)))
  })

  it("1º boleto pago ATRASADO: o período começa no pagamento — ninguém perde tempo pago", () => {
    const end = carnePeriodEnd({
      firstDueDate: first,
      firstPaidAt: new Date("2026-10-20T15:00:00Z"),
      paidCount: 1,
      interval: "MONTHLY",
    })
    expect(ymd(end)).toBe("2026-11-20")
  })

  it("o dia do pagamento é o dia civil BRASILEIRO", () => {
    // 01h UTC do dia 21 ainda é dia 20 em Brasília.
    const end = carnePeriodEnd({
      firstDueDate: first,
      firstPaidAt: new Date("2026-10-21T01:00:00Z"),
      paidCount: 1,
      interval: "MONTHLY",
    })
    expect(ymd(end)).toBe("2026-11-20")
  })

  it("cada boleto pago soma um ciclo, inclusive fora de ordem", () => {
    const end = carnePeriodEnd({
      firstDueDate: first,
      firstPaidAt: new Date("2026-10-05T12:00:00Z"),
      paidCount: 3,
      interval: "QUARTERLY",
    })
    expect(ymd(end)).toBe("2027-07-10")
  })

  it("vitalício não tem fim de período", () => {
    expect(
      carnePeriodEnd({
        firstDueDate: first,
        firstPaidAt: new Date("2026-10-05T12:00:00Z"),
        paidCount: 1,
        interval: "LIFETIME",
      }),
    ).toBeNull()
  })
})

describe("carneRowsToAppend (renovação)", () => {
  const first = noonUtc("2026-10-10")

  it("não cria nada enquanto o último boleto está fora da janela de 7 dias", () => {
    expect(
      carneRowsToAppend({
        lastNumber: 2,
        firstDueDate: first,
        interval: "MONTHLY",
        now: new Date("2026-11-01T12:00:00Z"),
      }),
    ).toEqual([])
  })

  it("último boleto entrou na janela: prepara o seguinte", () => {
    const next = carneRowsToAppend({
      lastNumber: 2,
      firstDueDate: first,
      interval: "MONTHLY",
      now: new Date("2026-11-04T12:00:00Z"),
    })
    expect(next.map((n) => [n.number, ymd(n.dueDate)])).toEqual([[3, "2026-12-10"]])
  })

  it("cron parado por meses cria no máximo 3 por passada", () => {
    const next = carneRowsToAppend({
      lastNumber: 1,
      firstDueDate: first,
      interval: "MONTHLY",
      now: new Date("2027-06-01T12:00:00Z"),
    })
    expect(next.map((n) => n.number)).toEqual([2, 3, 4])
  })

  it("vitalício nunca renova", () => {
    expect(
      carneRowsToAppend({
        lastNumber: 1,
        firstDueDate: first,
        interval: "LIFETIME",
        now: new Date("2030-01-01T12:00:00Z"),
      }),
    ).toEqual([])
  })
})

describe("checkCarneRequest", () => {
  const now = new Date("2026-09-16T15:00:00Z")
  const ok = { count: 12, firstDueDate: "2026-09-23", interval: "MONTHLY" as const, amount: 59.9, now }

  it("aceita um pedido válido", () => {
    const r = checkCarneRequest(ok)
    expect(r.ok && ymd(r.firstDueDate)).toBe("2026-09-23")
  })

  it("vitalício não vira carnê", () => {
    expect(checkCarneRequest({ ...ok, interval: "LIFETIME" }).ok).toBe(false)
  })

  it("quantidade fora do intervalo", () => {
    expect(checkCarneRequest({ ...ok, count: 0 }).ok).toBe(false)
    expect(checkCarneRequest({ ...ok, count: SUBSCRIPTION_CARNE_MAX_COUNT + 1 }).ok).toBe(false)
    expect(checkCarneRequest({ ...ok, count: 1 }).ok).toBe(true)
  })

  it("boleto abaixo do mínimo dos gateways", () => {
    expect(checkCarneRequest({ ...ok, amount: 4.99 }).ok).toBe(false)
  })

  it("1º vencimento no passado é recusado — pelo dia BRASILEIRO", () => {
    expect(checkCarneRequest({ ...ok, firstDueDate: "2026-09-15" }).ok).toBe(false)
    expect(checkCarneRequest({ ...ok, firstDueDate: "2026-09-16" }).ok).toBe(true)
    // 23h de Brasília do dia 16 = 02h UTC do dia 17: "hoje" ainda é 16.
    expect(
      checkCarneRequest({
        ...ok,
        firstDueDate: "2026-09-16",
        now: new Date("2026-09-17T02:00:00Z"),
      }).ok,
    ).toBe(true)
  })

  it("1º vencimento distante é recusado (acesso de graça até lá; e o MP só aceita até 30 dias)", () => {
    expect(checkCarneRequest({ ...ok, firstDueDate: "2026-10-14" }).ok).toBe(true)
    expect(checkCarneRequest({ ...ok, firstDueDate: "2026-10-15" }).ok).toBe(false)
  })

  it("data inexistente é recusada", () => {
    expect(checkCarneRequest({ ...ok, firstDueDate: "2026-02-30" }).ok).toBe(false)
    expect(checkCarneRequest({ ...ok, firstDueDate: "23/09/2026" }).ok).toBe(false)
  })
})

describe("helpers", () => {
  it("quantidade sugerida cobre um ano de agenda", () => {
    expect(defaultCarneCount("MONTHLY")).toBe(12)
    expect(defaultCarneCount("QUARTERLY")).toBe(4)
    expect(defaultCarneCount("SEMIANNUAL")).toBe(2)
    expect(defaultCarneCount("ANNUAL")).toBe(1)
    expect(defaultCarneCount("LIFETIME")).toBe(1)
  })

  it("vencimento do autoatendimento conta em dia brasileiro, ao meio-dia UTC", () => {
    expect(carneDueInDays(3, new Date("2026-09-17T02:00:00Z")).toISOString()).toBe(
      "2026-09-19T12:00:00.000Z",
    )
  })
})
