import { describe, it, expect } from "vitest"
import { substituteTrustTokens } from "./trust-tokens"

describe("substituteTrustTokens", () => {
  it("substitui {{semJuros}} pelo texto de parcelas quando presente", () => {
    expect(
      substituteTrustTokens("Pix, cartão ou boleto — {{semJuros}}", {
        semJurosText: "Até 12x sem juros",
      }),
    ).toBe("Pix, cartão ou boleto — Até 12x sem juros")
  })

  it("mantém {{semJuros}} literal quando não há texto (comportamento herdado)", () => {
    expect(substituteTrustTokens("{{semJuros}}", {})).toBe("{{semJuros}}")
  })

  it("substitui {{horarioAtendimento}} pelo horário configurado na unidade", () => {
    expect(
      substituteTrustTokens("{{horarioAtendimento}}", {
        supportHoursText: "Segunda a sexta, 9h às 18h",
      }),
    ).toBe("Segunda a sexta, 9h às 18h")
  })

  it("resolve {{horarioAtendimento}} para vazio quando não configurado (linha some)", () => {
    // Revenda sem supportHours → null/undefined → string vazia; o TrustItem
    // esconde o subtítulo, espelhando o rodapé da vitrine.
    expect(substituteTrustTokens("{{horarioAtendimento}}", {})).toBe("")
    expect(
      substituteTrustTokens("{{horarioAtendimento}}", {
        supportHoursText: null,
      }),
    ).toBe("")
  })

  it("resolve os dois tokens no mesmo texto", () => {
    expect(
      substituteTrustTokens("{{semJuros}} · {{horarioAtendimento}}", {
        semJurosText: "Até 6x sem juros",
        supportHoursText: "Seg a sáb",
      }),
    ).toBe("Até 6x sem juros · Seg a sáb")
  })

  it("não altera textos sem token", () => {
    expect(
      substituteTrustTokens("Certificado incluso", {
        semJurosText: "Até 12x sem juros",
        supportHoursText: "Seg a sex",
      }),
    ).toBe("Certificado incluso")
  })
})
