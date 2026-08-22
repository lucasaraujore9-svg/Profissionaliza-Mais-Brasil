import { describe, it, expect } from "vitest"
import {
  AUTO_CANCEL_OVERDUE_DAYS,
  DEFAULT_SUSPEND_GRACE_DAYS,
  cancelDateFor,
  cancelWarningOffset,
  cancellationNoticeLine,
  overdueAction,
  overdueDays,
  resolveOverdueRuler,
  shouldWarnCancellation,
} from "./overdue-policy"

/** Vencimento: meia-noite UTC do dia civil (formato que vem do Asaas). */
function due(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

describe("resolveOverdueRuler", () => {
  it("sem política: suspende em 3, avisa em 5, cancela em 7", () => {
    const ruler = resolveOverdueRuler(null)
    expect(ruler).toEqual({
      suspendAfterDays: DEFAULT_SUSPEND_GRACE_DAYS,
      cancelAfterDays: AUTO_CANCEL_OVERDUE_DAYS,
      warnAfterDays: 5,
      autoCancel: true,
    })
  })

  it("nunca cancela ANTES de suspender: carência maior que 7 empurra o corte", () => {
    // Caso real de produção (`vocequervocepode`, gracePeriodDays 15). Sem o
    // `max`, ela seria cancelada no dia 7 sem nunca ter sido suspensa.
    const ruler = resolveOverdueRuler({ gracePeriodDays: 15 })
    expect(ruler.suspendAfterDays).toBe(15)
    expect(ruler.cancelAfterDays).toBe(15)
    expect(ruler.warnAfterDays).toBe(13)
  })

  it("teto por unidade abaixo da carência também é elevado", () => {
    const ruler = resolveOverdueRuler({ gracePeriodDays: 10, autoCancelAfterDays: 2 })
    expect(ruler.cancelAfterDays).toBe(10)
  })

  it("aceita prazo próprio acima do padrão", () => {
    expect(resolveOverdueRuler({ autoCancelAfterDays: 30 }).cancelAfterDays).toBe(30)
  })

  it("autoCancel: false desliga o corte só desta unidade", () => {
    expect(resolveOverdueRuler({ autoCancel: false }).autoCancel).toBe(false)
    // Ausente ou true = a regra vale.
    expect(resolveOverdueRuler({}).autoCancel).toBe(true)
    expect(resolveOverdueRuler({ autoCancel: true }).autoCancel).toBe(true)
  })

  it("ignora lixo no JSON em vez de quebrar a varredura", () => {
    for (const junk of [undefined, "x", 7, [], { gracePeriodDays: -1 }, { gracePeriodDays: "3" }]) {
      expect(resolveOverdueRuler(junk).suspendAfterDays).toBe(DEFAULT_SUSPEND_GRACE_DAYS)
    }
  })
})

describe("overdueDays — dia civil brasileiro", () => {
  it("conta dias completos no fuso de Brasília, não em UTC", () => {
    // 21/08 02:00 UTC = 20/08 23:00 em Brasília. Ainda são 6 dias de atraso.
    // Em UTC dariam 7 — a unidade seria cancelada um dia antes do combinado.
    expect(overdueDays(due("2026-08-14"), new Date("2026-08-21T02:00:00.000Z"))).toBe(6)
    // 21/08 12:00 UTC = 21/08 09:00 em Brasília: aí sim, 7 dias.
    expect(overdueDays(due("2026-08-14"), new Date("2026-08-21T12:00:00.000Z"))).toBe(7)
  })

  it("é negativo antes do vencimento e zero no dia", () => {
    const agora = new Date("2026-08-21T12:00:00.000Z")
    expect(overdueDays(due("2026-08-21"), agora)).toBe(0)
    expect(overdueDays(due("2026-08-25"), agora)).toBe(-4)
  })
})

describe("overdueAction", () => {
  const ruler = resolveOverdueRuler(null)

  it("suspende a unidade no ar a partir da carência", () => {
    expect(overdueAction({ ageDays: 2, status: "ACTIVE", ruler })).toBe("none")
    expect(overdueAction({ ageDays: 3, status: "ACTIVE", ruler })).toBe("suspend")
    expect(overdueAction({ ageDays: 3, status: "PENDING", ruler })).toBe("suspend")
    // Já suspensa não é suspensa de novo.
    expect(overdueAction({ ageDays: 5, status: "SUSPENDED", ruler })).toBe("none")
  })

  it("cancela no sétimo dia, venha de qual status vier", () => {
    expect(overdueAction({ ageDays: 6, status: "SUSPENDED", ruler })).toBe("none")
    expect(overdueAction({ ageDays: 7, status: "SUSPENDED", ruler })).toBe("cancel")
    expect(overdueAction({ ageDays: 7, status: "ACTIVE", ruler })).toBe("cancel")
    expect(overdueAction({ ageDays: 40, status: "PENDING", ruler })).toBe("cancel")
  })

  it("não mexe em quem já está cancelada", () => {
    expect(overdueAction({ ageDays: 99, status: "CANCELLED", ruler })).toBe("none")
  })

  it("com autoCancel desligado, para na suspensão", () => {
    const off = resolveOverdueRuler({ autoCancel: false })
    expect(overdueAction({ ageDays: 99, status: "SUSPENDED", ruler: off })).toBe("none")
    expect(overdueAction({ ageDays: 99, status: "ACTIVE", ruler: off })).toBe("suspend")
  })
})

describe("aviso final", () => {
  const ruler = resolveOverdueRuler(null)

  it("vale de D+5 até a véspera do corte", () => {
    expect(shouldWarnCancellation(4, ruler)).toBe(false)
    expect(shouldWarnCancellation(5, ruler)).toBe(true)
    expect(shouldWarnCancellation(6, ruler)).toBe(true)
    // No dia do corte quem fala é o cancelamento, não o aviso.
    expect(shouldWarnCancellation(7, ruler)).toBe(false)
  })

  it("não avisa sobre um corte que não vai acontecer", () => {
    expect(shouldWarnCancellation(6, resolveOverdueRuler({ autoCancel: false }))).toBe(false)
  })

  it("a chave de idempotência é o offset NEGATIVO do dia do aviso", () => {
    // A tabela de lembretes usa positivo para "antes do vencimento" (5/2/0).
    expect(cancelWarningOffset(ruler)).toBe(-5)
    expect(cancelWarningOffset(resolveOverdueRuler({ gracePeriodDays: 15 }))).toBe(-13)
  })
})

describe("data do cancelamento", () => {
  it("é o vencimento + o prazo, em dia civil", () => {
    expect(cancelDateFor(due("2026-08-14"), resolveOverdueRuler(null)).toISOString()).toBe(
      "2026-08-21T00:00:00.000Z",
    )
  })

  it("a frase do aviso diz a data e o prazo", () => {
    const frase = cancellationNoticeLine(due("2026-08-14"), resolveOverdueRuler(null))
    expect(frase).toContain("21/08/2026")
    expect(frase).toContain("7 dias")
  })
})
