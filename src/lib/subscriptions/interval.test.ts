import { describe, it, expect } from "vitest"
import {
  SUBSCRIPTION_INTERVALS,
  INTERVAL_MONTHS,
  INTERVAL_LABEL,
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
  INTERVAL_PERIOD_LABEL,
  addInterval,
  addMonths,
  asaasCycleFor,
  mpRecurrenceFor,
  isRecurringInterval,
} from "./interval"

describe("catalogo de periodicidades", () => {
  it("toda periodicidade tem rotulo, sufixo e traducao para os dois gateways", () => {
    // Uma periodicidade nova que entre no enum do Prisma sem passar por aqui
    // renderizaria `undefined` na vitrine e criaria assinatura sem ciclo.
    for (const i of SUBSCRIPTION_INTERVALS) {
      expect(INTERVAL_MONTHS).toHaveProperty(i)
      expect(INTERVAL_LABEL[i]).toBeTruthy()
      expect(INTERVAL_PRICE_SUFFIX).toHaveProperty(i)
      expect(INTERVAL_CHARGE_LABEL[i]).toBeTruthy()
      expect(INTERVAL_PERIOD_LABEL[i]).toBeTruthy()
      // `null` é resposta válida (vitalício); `undefined` não.
      expect(asaasCycleFor(i)).not.toBeUndefined()
      expect(mpRecurrenceFor(i)).not.toBeUndefined()
    }
  })

  it("so o vitalicio nao e recorrencia", () => {
    expect(isRecurringInterval("MONTHLY")).toBe(true)
    expect(isRecurringInterval("QUARTERLY")).toBe(true)
    expect(isRecurringInterval("SEMIANNUAL")).toBe(true)
    expect(isRecurringInterval("ANNUAL")).toBe(true)
    expect(isRecurringInterval("LIFETIME")).toBe(false)
  })
})

describe("addInterval", () => {
  const base = new Date("2026-01-15T12:00:00Z")

  it("avanca o numero de meses do ciclo", () => {
    expect(addInterval(base, "MONTHLY")?.toISOString()).toBe(
      "2026-02-15T12:00:00.000Z",
    )
    expect(addInterval(base, "QUARTERLY")?.toISOString()).toBe(
      "2026-04-15T12:00:00.000Z",
    )
    expect(addInterval(base, "SEMIANNUAL")?.toISOString()).toBe(
      "2026-07-15T12:00:00.000Z",
    )
    expect(addInterval(base, "ANNUAL")?.toISOString()).toBe(
      "2027-01-15T12:00:00.000Z",
    )
  })

  it("VITALICIO nao tem proximo ciclo", () => {
    // É este `null` que vira `currentPeriodEnd` null — o sinal que mantém a
    // assinatura permanente fora da varredura de carência.
    expect(addInterval(base, "LIFETIME")).toBeNull()
  })

  it("fim de mes satura em vez de transbordar", () => {
    // 31/01 + 1 mês tem que virar 28/02, não 03/03. O transbordo do JavaScript
    // daria dias de acesso a mais a cada ciclo.
    expect(
      addMonths(new Date("2027-01-31T12:00:00Z"), 1).toISOString(),
    ).toBe("2027-02-28T12:00:00.000Z")
    // Ano bissexto: 29/02 existe em 2028.
    expect(
      addMonths(new Date("2028-01-31T12:00:00Z"), 1).toISOString(),
    ).toBe("2028-02-29T12:00:00.000Z")
    // Semestral a partir de 31/08 cai em 28/02 do ano seguinte.
    expect(
      addMonths(new Date("2026-08-31T12:00:00Z"), 6).toISOString(),
    ).toBe("2027-02-28T12:00:00.000Z")
  })
})

describe("traducao para os gateways", () => {
  it("usa os nomes DO ASAAS, que nao batem com os nossos", () => {
    // `SEMIANNUAL` lá é `SEMIANNUALLY` e `ANNUAL` é `YEARLY`. Mandar o nosso
    // nome faria o Asaas recusar a assinatura.
    expect(asaasCycleFor("MONTHLY")).toBe("MONTHLY")
    expect(asaasCycleFor("QUARTERLY")).toBe("QUARTERLY")
    expect(asaasCycleFor("SEMIANNUAL")).toBe("SEMIANNUALLY")
    expect(asaasCycleFor("ANNUAL")).toBe("YEARLY")
  })

  it("vitalicio nao tem ciclo em gateway nenhum", () => {
    // `null` é o que faz o checkout desviar para cobrança avulsa. Um valor
    // qualquer aqui criaria uma assinatura que voltaria a cobrar o aluno.
    expect(asaasCycleFor("LIFETIME")).toBeNull()
    expect(mpRecurrenceFor("LIFETIME")).toBeNull()
  })

  it("MP conta em MESES, nunca em dias", () => {
    // 90 dias não é um trimestre: a data deslizaria a cada ciclo.
    expect(mpRecurrenceFor("QUARTERLY")).toEqual({
      frequency: 3,
      frequency_type: "months",
    })
    expect(mpRecurrenceFor("ANNUAL")).toEqual({
      frequency: 12,
      frequency_type: "months",
    })
  })
})
