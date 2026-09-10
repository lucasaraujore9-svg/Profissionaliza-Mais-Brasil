import { describe, it, expect } from "vitest"
import {
  buildManualPaymentLines,
  competenceKey,
  existeNoGateway,
  isManualPayment,
  ManualPaymentError,
  MANUAL_PAYMENT_PREFIX,
  MAX_MANUAL_MONTHS,
  newManualPaymentId,
} from "./manual-payment"

const dia = (d: Date) => d.toISOString().slice(0, 10)

describe("buildManualPaymentLines", () => {
  it("três mensalidades adiantadas viram TRÊS linhas, uma por mês", () => {
    // O caso real: `desenvolve tamarana` pagou 3 meses por fora em 20/08. Um
    // lançamento somado de R$ 717 daria comissão de UM mês (o teto por fatura
    // limita a proporção a 1) e deixaria set/out descobertos na varredura de
    // inadimplência.
    const linhas = buildManualPaymentLines({
      amount: 239,
      months: 3,
      firstDueDate: new Date("2026-08-23"),
      paidAt: new Date("2026-08-20"),
    })

    expect(linhas.map((l) => dia(l.dueDate))).toEqual([
      "2026-08-23",
      "2026-09-23",
      "2026-10-23",
    ])
    expect(linhas.map((l) => l.amount)).toEqual([239, 239, 239])
  })

  it("cada linha cai na competência do próprio vencimento (pagamento antecipado)", () => {
    // `max(vencimento, pagamento)`: pagou tudo em agosto, mas a 2ª e a 3ª
    // mensalidades pertencem a setembro e outubro — é o que faz a comissão do
    // indicador sair mês a mês em vez de tudo no mês do pagamento.
    const linhas = buildManualPaymentLines({
      amount: 239,
      months: 3,
      firstDueDate: new Date("2026-08-23"),
      paidAt: new Date("2026-08-20"),
    })

    expect(linhas.map((l) => competenceKey(l.competenceAt))).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ])
  })

  it("pagamento ATRASADO empurra só a competência da mensalidade atrasada", () => {
    // Venceu 05/07 e só pagou 20/08: a 1ª vira competência de agosto; a 2ª,
    // cujo vencimento (05/08) também já passou, idem; a 3ª segue em setembro.
    const linhas = buildManualPaymentLines({
      amount: 239,
      months: 3,
      firstDueDate: new Date("2026-07-05"),
      paidAt: new Date("2026-08-20"),
    })

    expect(linhas.map((l) => competenceKey(l.competenceAt))).toEqual([
      "2026-08",
      "2026-08",
      "2026-09",
    ])
  })

  it("vencimento no dia 31 não escorrega ao atravessar fevereiro", () => {
    const linhas = buildManualPaymentLines({
      amount: 239,
      months: 3,
      firstDueDate: new Date("2026-12-31"),
      paidAt: new Date("2026-12-20"),
    })

    expect(linhas.map((l) => dia(l.dueDate))).toEqual([
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
    ])
  })

  it("uma mensalidade só é o caso comum e gera uma linha", () => {
    const linhas = buildManualPaymentLines({
      amount: 209,
      months: 1,
      firstDueDate: new Date("2026-09-10"),
      paidAt: new Date("2026-09-12"),
    })
    expect(linhas).toHaveLength(1)
    expect(competenceKey(linhas[0].competenceAt)).toBe("2026-09")
  })

  it("recusa valor zero ou negativo", () => {
    for (const amount of [0, -239]) {
      expect(() =>
        buildManualPaymentLines({
          amount,
          months: 1,
          firstDueDate: new Date("2026-09-10"),
          paidAt: new Date("2026-09-10"),
        }),
      ).toThrow(ManualPaymentError)
    }
  })

  it("recusa quantidade de meses fora de 1..12", () => {
    // Erro de digitação ("36") não pode virar 36 linhas de mensalidade.
    for (const months of [0, 13, 36, 1.5]) {
      expect(() =>
        buildManualPaymentLines({
          amount: 239,
          months,
          firstDueDate: new Date("2026-09-10"),
          paidAt: new Date("2026-09-10"),
        }),
      ).toThrow(ManualPaymentError)
    }
    expect(MAX_MANUAL_MONTHS).toBe(12)
  })

  it("recusa data inválida em vez de gerar Invalid Date no banco", () => {
    expect(() =>
      buildManualPaymentLines({
        amount: 239,
        months: 1,
        firstDueDate: new Date("nao-e-data"),
        paidAt: new Date("2026-09-10"),
      }),
    ).toThrow(ManualPaymentError)
  })
})

describe("isManualPayment", () => {
  it("reconhece o id sintético e ignora os do Asaas", () => {
    expect(isManualPayment(newManualPaymentId())).toBe(true)
    expect(isManualPayment("pay_yg730etvfse33ltb")).toBe(false)
    expect(isManualPayment("ins_abc123")).toBe(false)
    expect(isManualPayment(null)).toBe(false)
    expect(isManualPayment(undefined)).toBe(false)
  })

  it("cada id é único — a coluna é @unique", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newManualPaymentId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id.startsWith(MANUAL_PAYMENT_PREFIX)).toBe(true)
  })
})

describe("existeNoGateway", () => {
  it("cobrança do Asaas pode ser cancelada lá", () => {
    expect(existeNoGateway("pay_yg730etvfse33ltb")).toBe(true)
  })

  it("lançamento manual nunca existiu no gateway", () => {
    expect(existeNoGateway(newManualPaymentId())).toBe(false)
  })

  it("PARCELAMENTO não é cobrança: `DELETE /payments/{id}` não resolve `ins_`", () => {
    // Chamar o gateway aqui devolve 404 e faz a baixa parecer que falhou quando
    // não há nada a cancelar.
    expect(existeNoGateway("ins_000005638104")).toBe(false)
  })
})
