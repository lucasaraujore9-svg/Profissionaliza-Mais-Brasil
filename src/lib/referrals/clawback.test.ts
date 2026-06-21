import { describe, it, expect } from "vitest"
import {
  CLAWBACK_MARKER_PREFIX,
  isClawbackMarked,
  hasClawbackBlock,
} from "./clawback"

// SAAS-005: refund parcial CONGELA a comissão (marca [CLAWBACK_PENDING] sem
// cancelar) e os gates de saque (requestPayout + processMonthlyPayouts) passam
// a bloquear qualquer comissão marcada, INDEPENDENTE do status (antes o gate
// legado só olhava status=PAID). Estes testes travam o contrato do marcador.

describe("isClawbackMarked", () => {
  it("reconhece um cancelReason com o prefixo de clawback", () => {
    expect(
      isClawbackMarked("[CLAWBACK_PENDING] refund parcial — R$ 10,00"),
    ).toBe(true)
  })

  it("não marca um cancelReason comum (refund total não-PAID vira CANCELLED)", () => {
    expect(isClawbackMarked("refund")).toBe(false)
    expect(isClawbackMarked("refund_parcial")).toBe(false)
  })

  it("trata null/undefined como não-marcado", () => {
    expect(isClawbackMarked(null)).toBe(false)
    expect(isClawbackMarked(undefined)).toBe(false)
  })

  it("o prefixo exige começar com o marcador (não em qualquer posição)", () => {
    expect(isClawbackMarked("nota [CLAWBACK_PENDING] no meio")).toBe(false)
  })
})

describe("hasClawbackBlock (semântica do gate de saque)", () => {
  it("bloqueia quando há comissão PENDING congelada (refund parcial)", () => {
    // Cenário SAAS-005: a comissão NÃO está PAID, mas foi congelada.
    // O gate ampliado deve bloquear mesmo assim.
    const rows = [
      { cancelReason: null },
      { cancelReason: `${CLAWBACK_MARKER_PREFIX} refund parcial` },
    ]
    expect(hasClawbackBlock(rows)).toBe(true)
  })

  it("bloqueia quando há comissão PAID com clawback (refund total)", () => {
    const rows = [{ cancelReason: `${CLAWBACK_MARKER_PREFIX} valor R$ 5,00` }]
    expect(hasClawbackBlock(rows)).toBe(true)
  })

  it("NÃO bloqueia quando nenhuma comissão está marcada", () => {
    const rows = [
      { cancelReason: null },
      { cancelReason: "refund" },
      { cancelReason: undefined },
    ]
    expect(hasClawbackBlock(rows)).toBe(false)
  })

  it("NÃO bloqueia com lista vazia", () => {
    expect(hasClawbackBlock([])).toBe(false)
  })
})

describe("contrato do marcador", () => {
  it("o prefixo é estável e usado por quem marca e por quem bloqueia", () => {
    // Se este literal mudar, os gates de payout deixam de bloquear o freeze.
    expect(CLAWBACK_MARKER_PREFIX).toBe("[CLAWBACK_PENDING]")
  })
})
