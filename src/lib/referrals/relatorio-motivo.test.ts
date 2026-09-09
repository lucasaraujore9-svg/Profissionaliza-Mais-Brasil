import { describe, it, expect } from "vitest"
import {
  motivoForaDaConta,
  monthIndex,
  periodMonthIndex,
  type UnidadeFatos,
} from "./relatorio-motivo"

const AGOSTO = periodMonthIndex("2026-08") as number

function fatos(over: Partial<UnidadeFatos> = {}): UnidadeFatos {
  return {
    planValue: 239,
    status: "ACTIVE",
    everPaid: true,
    paidInPeriod: true,
    entryMonthIndex: periodMonthIndex("2026-07") as number,
    ...over,
  }
}

describe("motivoForaDaConta", () => {
  it("quem ESTA na conta nao tem motivo — nao se explica presenca", () => {
    expect(motivoForaDaConta(fatos({ planValue: 0 }), AGOSTO, true)).toBeNull()
  })

  it("cortesia vem antes de tudo: o motor exige planValue > 0", () => {
    // Mesmo cancelada e sem pagar, o primeiro gate do motor e o valor do plano.
    expect(
      motivoForaDaConta(
        fatos({ planValue: 0, status: "CANCELLED", everPaid: false }),
        AGOSTO,
        false,
      ),
    ).toBe("CORTESIA")
  })

  it("cancelada vem antes de 'nunca pagou'", () => {
    expect(
      motivoForaDaConta(
        fatos({ status: "CANCELLED", everPaid: false }),
        AGOSTO,
        false,
      ),
    ).toBe("CANCELADA")
  })

  it("nunca pagou — a regra de 09/09/2026", () => {
    expect(motivoForaDaConta(fatos({ everPaid: false }), AGOSTO, false)).toBe(
      "NUNCA_PAGOU",
    )
  })

  it("entrou DEPOIS da competência (venda do mês seguinte não infla o mês passado)", () => {
    expect(
      motivoForaDaConta(
        fatos({ entryMonthIndex: periodMonthIndex("2026-09") as number }),
        AGOSTO,
        false,
      ),
    ).toBe("ENTROU_DEPOIS")
  })

  it("entrou NO mês da competência ainda conta — a borda é '>', não '>='", () => {
    expect(
      motivoForaDaConta(
        fatos({ entryMonthIndex: AGOSTO }),
        AGOSTO,
        false,
      ),
    ).toBe("FORA_DA_BASE")
  })

  it("fora do ar e sem pagamento no mês", () => {
    expect(
      motivoForaDaConta(
        fatos({ status: "SUSPENDED", paidInPeriod: false }),
        AGOSTO,
        false,
      ),
    ).toBe("SEM_PAGAMENTO_NO_MES")
  })

  it("suspensa que PAGOU no mês não é explicada por inadimplência", () => {
    // Ela deveria estar na conta; se não está, o motivo é outro. Nunca dizer
    // "não pagou" de quem pagou — é a frase que faria o financeiro cortar
    // comissão devida.
    expect(
      motivoForaDaConta(
        fatos({ status: "SUSPENDED", paidInPeriod: true }),
        AGOSTO,
        false,
      ),
    ).toBe("FORA_DA_BASE")
  })
})

describe("monthIndex / periodMonthIndex", () => {
  it("competência e data casam no mesmo índice", () => {
    expect(periodMonthIndex("2026-08")).toBe(
      monthIndex(new Date("2026-08-31T23:59:59Z")),
    )
  })

  it("meses consecutivos diferem em 1, inclusive na virada de ano", () => {
    expect(
      (periodMonthIndex("2027-01") as number) -
        (periodMonthIndex("2026-12") as number),
    ).toBe(1)
  })

  it("competência inválida devolve null em vez de NaN", () => {
    expect(periodMonthIndex("2026-13")).toBeNull()
    expect(periodMonthIndex("agosto")).toBeNull()
  })
})
