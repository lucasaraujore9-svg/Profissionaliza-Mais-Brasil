import { describe, it, expect } from "vitest"
import type { PaymentType } from "@prisma/client"
import {
  computeAllowedPercent,
  hasOpenInstallmentPlan,
  isPaceBlocked,
  isPaceGatedPlan,
  evaluatePace,
  paceBlockedMessage,
  PACE_GATED_WHERE,
  type PacePlanSource,
} from "./pace-gate"

function plan(
  paymentType: PaymentType,
  installmentsPaid: number,
  installmentsTotal: number | null,
) {
  return { paymentType, installmentsPaid, installmentsTotal }
}

describe("isPaceGatedPlan", () => {
  it("cobre carne e mensalidade com mais de uma parcela", () => {
    expect(isPaceGatedPlan(plan("BOLETO_INSTALLMENT", 1, 6))).toBe(true)
    expect(isPaceGatedPlan(plan("MONTHLY", 1, 12))).toBe(true)
  })

  it("ignora pagamento a vista e cartao parcelado", () => {
    expect(isPaceGatedPlan(plan("ONE_TIME", 1, null))).toBe(false)
    // Cartao: o credito ja foi autorizado integralmente na compra.
    expect(isPaceGatedPlan(plan("CARD_INSTALLMENT", 1, 6))).toBe(false)
  })

  it("ignora parcelamento em 1x (na pratica, a vista)", () => {
    expect(isPaceGatedPlan(plan("BOLETO_INSTALLMENT", 1, 1))).toBe(false)
    expect(isPaceGatedPlan(plan("BOLETO_INSTALLMENT", 0, null))).toBe(false)
  })
})

describe("computeAllowedPercent", () => {
  it("2x libera 50% ja na 1a parcela e 100% na 2a", () => {
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 1, 2))).toBe(50)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 2, 2))).toBe(100)
  })

  it("arredonda para BAIXO — nunca entrega mais do que foi pago", () => {
    // 1/3 = 33,33% -> 33 (nao 34)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 1, 3))).toBe(33)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 2, 3))).toBe(66)
    // 1/6 = 16,66% -> 16
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 1, 6))).toBe(16)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 3, 6))).toBe(50)
  })

  it("escala com o plano escolhido (mensalidade 12x)", () => {
    expect(computeAllowedPercent(plan("MONTHLY", 1, 12))).toBe(8)
    expect(computeAllowedPercent(plan("MONTHLY", 6, 12))).toBe(50)
    expect(computeAllowedPercent(plan("MONTHLY", 12, 12))).toBe(100)
  })

  it("devolve 100 fora da regra da cota", () => {
    expect(computeAllowedPercent(plan("ONE_TIME", 0, null))).toBe(100)
    expect(computeAllowedPercent(plan("CARD_INSTALLMENT", 1, 10))).toBe(100)
  })

  it("tolera contagem fora da faixa sem estourar 0-100", () => {
    // Reprocessamento de webhook poderia, em tese, passar de total.
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", 9, 6))).toBe(100)
    expect(computeAllowedPercent(plan("BOLETO_INSTALLMENT", -1, 6))).toBe(0)
  })
})

describe("hasOpenInstallmentPlan", () => {
  it("e verdadeiro enquanto faltar parcela (base da trava de certificado)", () => {
    expect(hasOpenInstallmentPlan(plan("BOLETO_INSTALLMENT", 1, 6))).toBe(true)
    expect(hasOpenInstallmentPlan(plan("BOLETO_INSTALLMENT", 5, 6))).toBe(true)
  })

  it("e falso com o plano quitado ou fora da regra", () => {
    expect(hasOpenInstallmentPlan(plan("BOLETO_INSTALLMENT", 6, 6))).toBe(false)
    expect(hasOpenInstallmentPlan(plan("ONE_TIME", 0, null))).toBe(false)
    expect(hasOpenInstallmentPlan(plan("CARD_INSTALLMENT", 1, 6))).toBe(false)
  })
})

describe("isPaceBlocked", () => {
  it("trava AO ATINGIR a cota, nao depois dela", () => {
    const base = plan("BOLETO_INSTALLMENT", 1, 2) // cota 50%
    expect(isPaceBlocked({ ...base, progressPercent: 49 })).toBe(false)
    expect(isPaceBlocked({ ...base, progressPercent: 50 })).toBe(true)
    expect(isPaceBlocked({ ...base, progressPercent: 51 })).toBe(true)
  })

  it("nunca trava com o plano quitado, mesmo com 100% assistido", () => {
    expect(
      isPaceBlocked({ ...plan("BOLETO_INSTALLMENT", 6, 6), progressPercent: 100 }),
    ).toBe(false)
  })

  it("nunca trava fora da regra da cota", () => {
    expect(
      isPaceBlocked({ ...plan("ONE_TIME", 0, null), progressPercent: 100 }),
    ).toBe(false)
  })

  it("trata progresso nulo como zero", () => {
    // Cota 16% (1/6): quem ainda nao comecou nao esta travado.
    expect(
      isPaceBlocked({ ...plan("BOLETO_INSTALLMENT", 1, 6), progressPercent: null }),
    ).toBe(false)
    // Cota 0% (nada pago): travado ja na largada.
    expect(
      isPaceBlocked({ ...plan("BOLETO_INSTALLMENT", 0, 6), progressPercent: null }),
    ).toBe(true)
  })
})

describe("evaluatePace", () => {
  it("resume o estado para motor/API/UI", () => {
    expect(
      evaluatePace({ ...plan("BOLETO_INSTALLMENT", 2, 6), progressPercent: 40 }),
    ).toEqual({
      gated: true,
      allowedPercent: 33,
      blocked: true,
      installmentsPaid: 2,
      installmentsTotal: 6,
      remaining: 4,
    })
  })

  it("nao reporta parcelas faltantes fora da regra", () => {
    const state = evaluatePace({
      ...plan("ONE_TIME", 0, null),
      progressPercent: 90,
    })
    expect(state.gated).toBe(false)
    expect(state.blocked).toBe(false)
    expect(state.remaining).toBe(0)
  })
})

describe("paceBlockedMessage", () => {
  it("fala 'parcela' no carne e 'mensalidade' no mensal", () => {
    const carne = evaluatePace({
      ...plan("BOLETO_INSTALLMENT", 1, 2),
      progressPercent: 50,
    })
    expect(paceBlockedMessage(carne, "BOLETO_INSTALLMENT")).toContain(
      "Você liberou 50% do curso",
    )
    expect(paceBlockedMessage(carne, "BOLETO_INSTALLMENT")).toContain(
      "1 de 2 parcelas pagas",
    )

    const mensal = evaluatePace({
      ...plan("MONTHLY", 1, 12),
      progressPercent: 10,
    })
    expect(paceBlockedMessage(mensal, "MONTHLY")).toContain(
      "1 de 12 mensalidades pagas",
    )
    expect(paceBlockedMessage(mensal, "MONTHLY")).toContain(
      "próxima mensalidade",
    )
  })
})

// ── Satelite de compra com varios cursos ────────────────────────────────────
// Uma compra de pacote/venda multi-curso gera UMA cobranca (a primaria) e N
// matriculas satelite ONE_TIME de valor 0. Sem herdar o plano da primaria, o
// curso 2 de um carne 6x sairia 100% liberado ja na 1a parcela — enquanto o
// curso 1 ficava racionado em 16%.
describe("plano herdado da matricula que pagou (satelite)", () => {
  /** Satelite: linha ONE_TIME sem parcelas, apontando para um carne 6x. */
  function satellite(paid: number, total: number | null = 6) {
    return {
      ...plan("ONE_TIME", 0, null),
      primaryEnrollment: plan("BOLETO_INSTALLMENT", paid, total),
    }
  }

  it("entra na regra da cota pelo plano da primaria", () => {
    expect(isPaceGatedPlan(satellite(1))).toBe(true)
    // A propria linha, isolada, nao seria travavel.
    expect(isPaceGatedPlan(plan("ONE_TIME", 0, null))).toBe(false)
  })

  it("libera a MESMA fatia da primaria, nao 100%", () => {
    expect(computeAllowedPercent(satellite(1))).toBe(16)
    expect(computeAllowedPercent(satellite(3))).toBe(50)
    expect(computeAllowedPercent(satellite(6))).toBe(100)
  })

  it("trava pelo progresso DO PROPRIO curso contra a cota da compra", () => {
    // Cada curso avanca no seu ritmo; o teto e que e compartilhado.
    expect(isPaceBlocked({ ...satellite(1), progressPercent: 10 })).toBe(false)
    expect(isPaceBlocked({ ...satellite(1), progressPercent: 16 })).toBe(true)
  })

  it("segura o certificado enquanto a compra nao esta quitada", () => {
    expect(hasOpenInstallmentPlan(satellite(1))).toBe(true)
    expect(hasOpenInstallmentPlan(satellite(6))).toBe(false)
  })

  it("reporta a contagem da COMPRA, nao os zeros da propria linha", () => {
    expect(evaluatePace({ ...satellite(2), progressPercent: 40 })).toEqual({
      gated: true,
      allowedPercent: 33,
      blocked: true,
      installmentsPaid: 2,
      installmentsTotal: 6,
      remaining: 4,
    })
  })

  it("primaria a vista nao vira travavel por ter satelites", () => {
    // Compra a vista: a satelite herda ONE_TIME e segue livre.
    const aVista = {
      ...plan("ONE_TIME", 0, null),
      primaryEnrollment: plan("ONE_TIME", 0, null),
    }
    expect(isPaceGatedPlan(aVista)).toBe(false)
    expect(computeAllowedPercent(aVista)).toBe(100)
  })

  it("matricula sem primaria (compra de curso avulso) nao muda de comportamento", () => {
    expect(computeAllowedPercent({ ...plan("BOLETO_INSTALLMENT", 1, 6) })).toBe(16)
    expect(
      computeAllowedPercent({
        ...plan("BOLETO_INSTALLMENT", 1, 6),
        primaryEnrollment: null,
      }),
    ).toBe(16)
  })
})

// ── Paridade: filtro SQL da varredura x funcao pura ─────────────────────────
// `PACE_GATED_WHERE` (usado no pre-filtro da varredura diaria, installments/
// sweep.ts) e `isPaceGatedPlan` sao DUAS escritas da mesma regra. Se divergirem,
// uma matricula sob a cota deixa de ser candidata e ninguem a reavalia — foi
// exatamente assim que a satelite escapava. Aqui elas sao confrontadas linha a
// linha.

/** Operadores que o filtro usa hoje. Qualquer outro faz o avaliador LANCAR. */
function matchesCondition(row: Record<string, unknown>, cond: Record<string, unknown>): boolean {
  return Object.entries(cond).every(([field, expected]) => {
    if (field === "OR") {
      if (!Array.isArray(expected)) throw new Error("OR precisa de array")
      return expected.some((c) => matchesCondition(row, c as Record<string, unknown>))
    }

    const actual = row[field]

    // Relacao: `{ is: <cond> }`. Relacao nula nunca casa (igual ao SQL).
    if (isPlainObject(expected) && "is" in expected) {
      if (actual == null) return false
      return matchesCondition(
        actual as Record<string, unknown>,
        expected.is as Record<string, unknown>,
      )
    }

    if (isPlainObject(expected)) {
      const ops = Object.keys(expected)
      const unknown = ops.filter((op) => op !== "in" && op !== "gt")
      // Avaliador desatualizado NAO pode passar calado: seria um teste verde
      // sobre um filtro que ele nao entende mais.
      if (unknown.length > 0) {
        throw new Error(`operador nao suportado pelo avaliador do teste: ${unknown.join(", ")}`)
      }
      if ("in" in expected) {
        if (!(expected.in as unknown[]).includes(actual)) return false
      }
      if ("gt" in expected) {
        // NULL > n e NULL no SQL => nao casa.
        if (typeof actual !== "number") return false
        if (!(actual > (expected.gt as number))) return false
      }
      return true
    }

    return actual === expected
  })
}

/** A linha do banco vista como objeto generico, para o avaliador acima. */
function asRow(row: PacePlanSource): Record<string, unknown> {
  return row as unknown as Record<string, unknown>
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

describe("PACE_GATED_WHERE — paridade com isPaceGatedPlan", () => {
  const casos: Array<{ nome: string; row: PacePlanSource }> = [
    { nome: "carnê 6x", row: plan("BOLETO_INSTALLMENT", 1, 6) },
    { nome: "mensalidade 12x", row: plan("MONTHLY", 1, 12) },
    { nome: "carnê quitado", row: plan("BOLETO_INSTALLMENT", 6, 6) },
    { nome: "curso à vista", row: plan("ONE_TIME", 0, null) },
    { nome: "cartão parcelado (crédito já autorizado)", row: plan("CARD_INSTALLMENT", 1, 6) },
    { nome: "parcelado em 1x (na prática à vista)", row: plan("BOLETO_INSTALLMENT", 0, 1) },
    { nome: "carnê sem total gravado", row: plan("BOLETO_INSTALLMENT", 0, null) },
    {
      nome: "satélite de compra em carnê 6x",
      row: {
        ...plan("ONE_TIME", 0, null),
        primaryEnrollment: plan("BOLETO_INSTALLMENT", 1, 6),
      },
    },
    {
      nome: "satélite de compra mensal",
      row: {
        ...plan("ONE_TIME", 0, null),
        primaryEnrollment: plan("MONTHLY", 2, 12),
      },
    },
    {
      nome: "satélite de compra à vista",
      row: {
        ...plan("ONE_TIME", 0, null),
        primaryEnrollment: plan("ONE_TIME", 0, null),
      },
    },
    {
      nome: "matrícula sem primária (relação nula)",
      row: { ...plan("BOLETO_INSTALLMENT", 1, 6), primaryEnrollment: null },
    },
  ]

  for (const { nome, row } of casos) {
    it(`${nome}: SQL e função pura decidem igual`, () => {
      expect(matchesCondition(asRow(row), PACE_GATED_WHERE as Record<string, unknown>)).toBe(
        isPaceGatedPlan(row),
      )
    })
  }

  it("cobre os dois ramos — próprio e herdado", () => {
    // Guarda contra um caso de teste que, sozinho, passaria com o filtro
    // mutilado: exige que a lista acima tenha ao menos um TRUE de cada origem.
    const porPlanoProprio = casos.find((c) => c.nome === "carnê 6x")!
    const porPlanoHerdado = casos.find((c) => c.nome === "satélite de compra em carnê 6x")!
    const w = PACE_GATED_WHERE as Record<string, unknown>
    expect(matchesCondition(asRow(porPlanoProprio.row), w)).toBe(true)
    expect(matchesCondition(asRow(porPlanoHerdado.row), w)).toBe(true)
  })

  it("o avaliador do teste recusa operador que não conhece", () => {
    expect(() =>
      matchesCondition({ installmentsTotal: 6 }, { installmentsTotal: { lte: 3 } }),
    ).toThrow(/nao suportado/)
  })
})
