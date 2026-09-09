import { describe, it, expect } from "vitest"
import {
  anticipationCutoff,
  isAnticipatedPayout,
  latestReleaseDate,
} from "./payout-window"

/**
 * A janela de antecipacao e a REGUA que decide o que entra na lista de
 * pagamento montada no dia 1. Errar para MAIS antecipa uma competencia que
 * ainda nem fechou; errar para MENOS devolve o comportamento antigo (a lista so
 * existir no dia da liberacao) sem nenhum sinal de erro.
 */
describe("anticipationCutoff", () => {
  it("é o primeiro instante do mês seguinte, em UTC", () => {
    expect(anticipationCutoff(new Date("2026-09-01T05:00:00Z")).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    )
  })

  it("vira o ano em dezembro", () => {
    expect(anticipationCutoff(new Date("2026-12-20T05:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    )
  })

  it("deixa passar a competência que vence no dia 20 DESTE mês", () => {
    // Rodando dia 1/09: a comissão de agosto vence 20/09 e tem de entrar na
    // lista — e o ponto da feature.
    const cutoff = anticipationCutoff(new Date("2026-09-01T05:00:00Z"))
    expect(new Date("2026-09-20T00:00:00Z") < cutoff).toBe(true)
  })

  it("NÃO deixa passar o que só vence no mês seguinte", () => {
    // Setembro fecha em 01/10; sua comissão vence 20/10. Antecipá-la no dia
    // 1/09 seria pagar uma competência que ainda nem começou a fechar.
    const cutoff = anticipationCutoff(new Date("2026-09-01T05:00:00Z"))
    expect(new Date("2026-10-20T00:00:00Z") < cutoff).toBe(false)
  })
})

describe("latestReleaseDate", () => {
  it("devolve a MAIOR data — o payout só está inteiro quando a última vence", () => {
    const d = latestReleaseDate([
      new Date("2026-08-20T00:00:00Z"),
      new Date("2026-09-20T00:00:00Z"),
      new Date("2026-07-20T00:00:00Z"),
    ])
    expect(d?.toISOString()).toBe("2026-09-20T00:00:00.000Z")
  })

  it("devolve null sem comissões", () => {
    expect(latestReleaseDate([])).toBeNull()
  })
})

describe("isAnticipatedPayout", () => {
  it("é antecipado quando a liberação ainda não chegou", () => {
    expect(
      isAnticipatedPayout(
        new Date("2026-09-20T00:00:00Z"),
        new Date("2026-09-01T05:00:00Z"),
      ),
    ).toBe(true)
  })

  it("NÃO é antecipado no próprio dia da liberação (comportamento de sempre)", () => {
    expect(
      isAnticipatedPayout(
        new Date("2026-09-20T00:00:00Z"),
        new Date("2026-09-20T05:00:00Z"),
      ),
    ).toBe(false)
  })

  it("sem data prevista, não é antecipado", () => {
    expect(isAnticipatedPayout(null, new Date("2026-09-01T05:00:00Z"))).toBe(false)
  })
})
