import { describe, it, expect } from "vitest"
import {
  janelaEstorno,
  podeEstornar,
  REFUND_WINDOW_DAYS,
} from "./refund"

// Meio-dia BRT para os casos não dependerem da borda do fuso.
const em = (iso: string) => new Date(`${iso}T15:00:00.000Z`)

describe("janelaEstorno", () => {
  it("no mesmo dia está dentro do prazo", () => {
    const j = janelaEstorno(em("2026-09-09"), em("2026-09-09"))
    expect(j.diasDesdePagamento).toBe(0)
    expect(j.dentroDoPrazo).toBe(true)
  })

  it("o sétimo dia ainda está dentro — o prazo é inclusivo", () => {
    const j = janelaEstorno(em("2026-09-02"), em("2026-09-09"))
    expect(j.diasDesdePagamento).toBe(REFUND_WINDOW_DAYS)
    expect(j.dentroDoPrazo).toBe(true)
  })

  it("o oitavo dia está fora e a descrição diz isso", () => {
    const j = janelaEstorno(em("2026-09-01"), em("2026-09-09"))
    expect(j.diasDesdePagamento).toBe(8)
    expect(j.dentroDoPrazo).toBe(false)
    expect(j.descricao).toContain("FORA do prazo")
  })

  it("conta em dia civil BRASILEIRO, não em UTC", () => {
    // 22h de Brasília do dia 8 já é dia 9 em UTC. Contar em UTC somaria um dia
    // e poderia estourar o prazo por diferença de fuso.
    const pago = new Date("2026-09-01T15:00:00.000Z")
    const agora = new Date("2026-09-09T01:30:00.000Z") // 22h30 BRT do dia 8
    expect(janelaEstorno(pago, agora).diasDesdePagamento).toBe(7)
  })

  it("singular no primeiro dia", () => {
    expect(janelaEstorno(em("2026-09-08"), em("2026-09-09")).descricao).toContain(
      "há 1 dia —",
    )
  })
})

describe("podeEstornar", () => {
  it("aceita os status efetivamente pagos", () => {
    for (const s of ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]) {
      expect(podeEstornar(s, null)).toBe(true)
    }
  })

  it("recusa cobrança que não foi paga", () => {
    for (const s of ["PENDING", "OVERDUE", "DELETED", "DELETING"]) {
      expect(podeEstornar(s, null)).toBe(false)
    }
  })

  it("recusa estorno em duplicidade", () => {
    // Sem isto, dois cliques criariam duas devoluções na trilha e dois clawbacks
    // sobre a mesma comissão.
    expect(podeEstornar("RECEIVED", new Date("2026-09-01"))).toBe(false)
  })
})
