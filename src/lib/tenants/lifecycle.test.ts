import { describe, it, expect } from "vitest"
import {
  EVER_PAID_STATUSES,
  EVER_PAID_PAYMENT_WHERE,
  NEVER_ACTIVATED_WHERE,
  CHURN_BASE_WHERE,
  MAX_DUE_DAYS_AHEAD,
  DEFAULT_FIRST_DUE_DAYS,
  CORTESIA_GRACE_DAYS,
  MIN_REASON_LENGTH,
  isDueDateStretched,
  assertCortesiaExcepcional,
} from "./lifecycle"
import { PAID_STATUSES } from "@/lib/tenant-billing/types"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

describe("EVER_PAID_STATUSES", () => {
  it("cobre tudo que PAID_STATUSES cobre", () => {
    for (const s of PAID_STATUSES) {
      expect(EVER_PAID_STATUSES).toContain(s)
    }
  })

  /**
   * Baixa manual no painel do Asaas. O resto do repo já a trata como paga; se
   * ficasse de fora, unidade que pagou em dinheiro entraria na blacklist.
   */
  it("inclui RECEIVED_IN_CASH", () => {
    expect(EVER_PAID_STATUSES).toContain("RECEIVED_IN_CASH")
  })

  it("não inclui status de cobrança em aberto nem apagada", () => {
    for (const s of ["PENDING", "OVERDUE", "DELETED", "DELETING", "REFUNDED"]) {
      expect(EVER_PAID_STATUSES).not.toContain(s)
    }
  })
})

describe("cláusulas where", () => {
  it("EVER_PAID_PAYMENT_WHERE aceita status pago OU baixa manual", () => {
    expect(EVER_PAID_PAYMENT_WHERE).toEqual({
      OR: [
        { status: { in: [...EVER_PAID_STATUSES] } },
        { markedPaidAt: { not: null } },
      ],
    })
  })

  it("NEVER_ACTIVATED_WHERE exige fora do ar E sem pagamento", () => {
    expect(NEVER_ACTIVATED_WHERE.status).toEqual({
      in: ["SUSPENDED", "CANCELLED"],
    })
    expect(NEVER_ACTIVATED_WHERE.tenantPayments).toEqual({
      none: EVER_PAID_PAYMENT_WHERE,
    })
  })

  /**
   * `activatedAt` foi deliberadamente deixado de fora: a migration
   * `20260620_referral_commission_tiers` fez backfill com fallback para
   * `created_at`, então ele não prova pagamento. Ver o cabeçalho do módulo.
   */
  it("NEVER_ACTIVATED_WHERE não olha activatedAt", () => {
    expect(NEVER_ACTIVATED_WHERE).not.toHaveProperty("activatedAt")
  })

  it("CHURN_BASE_WHERE exclui o placeholder PMB e exige pagamento", () => {
    expect(CHURN_BASE_WHERE.slug).toEqual({ not: PMB_TENANT_SLUG })
    expect(CHURN_BASE_WHERE.tenantPayments).toEqual({
      some: EVER_PAID_PAYMENT_WHERE,
    })
  })

  it("CHURN_BASE_WHERE não filtra por status — o numerador é que recorta", () => {
    expect(CHURN_BASE_WHERE).not.toHaveProperty("status")
  })
})

describe("isDueDateStretched", () => {
  const now = new Date("2026-08-07T15:00:00.000Z")

  it("aceita o prazo padrão da criação (D+3)", () => {
    expect(isDueDateStretched("2026-08-10", now)).toBe(false)
  })

  it("aceita exatamente o limite (D+10)", () => {
    expect(isDueDateStretched("2026-08-17", now)).toBe(false)
  })

  it("recusa um dia além do limite (D+11)", () => {
    expect(isDueDateStretched("2026-08-18", now)).toBe(true)
  })

  /** Os casos reais que motivaram a regra. */
  it("recusa os prazos esticados vistos em produção", () => {
    // valedosaber: criada 30/06, 1a cobranca em 20/07 (D+20)
    expect(isDueDateStretched("2026-07-20", new Date("2026-06-30T12:00:00Z"))).toBe(true)
    // andersoncidade: criada 16/07, 1a cobranca em 31/07 (D+15)
    expect(isDueDateStretched("2026-07-31", new Date("2026-07-16T12:00:00Z"))).toBe(true)
    // concluirconsultoriaeducacional: criada 25/06, 1a cobranca em 06/07 (D+11)
    expect(isDueDateStretched("2026-07-06", new Date("2026-06-25T12:00:00Z"))).toBe(true)
  })

  it("aceita data no passado (outra validação cuida disso)", () => {
    expect(isDueDateStretched("2026-01-01", now)).toBe(false)
  })

  it("aceita Date além de string", () => {
    expect(isDueDateStretched(new Date("2026-08-18T00:00:00.000Z"), now)).toBe(true)
    expect(isDueDateStretched(new Date("2026-08-10T00:00:00.000Z"), now)).toBe(false)
  })

  it("ignora data inválida em vez de bloquear", () => {
    expect(isDueDateStretched("não-é-data", now)).toBe(false)
  })

  /**
   * O servidor roda em UTC e o vencimento é data civil brasileira. Às 02:00 UTC
   * ainda é o dia anterior no Brasil — o limite tem que andar junto, senão o
   * corte erra por um dia.
   */
  it("usa o dia civil brasileiro, não o do servidor", () => {
    // 08/08 02:00 UTC = 07/08 23:00 em Sao Paulo. Limite = 07/08 + 10 = 17/08.
    const madrugadaUtc = new Date("2026-08-08T02:00:00.000Z")
    expect(isDueDateStretched("2026-08-17", madrugadaUtc)).toBe(false)
    expect(isDueDateStretched("2026-08-18", madrugadaUtc)).toBe(true)
  })

  it("o limite é o padrão da criação mais a folga", () => {
    expect(MAX_DUE_DAYS_AHEAD).toBe(DEFAULT_FIRST_DUE_DAYS + CORTESIA_GRACE_DAYS)
  })
})

describe("assertCortesiaExcepcional", () => {
  const semPoder = { allowed: false }
  const comPoder = (reason?: string) => ({ allowed: true, reason })

  it("libera quem já pagou, mesmo sem a permissão", () => {
    const v = assertCortesiaExcepcional({
      tenant: { neverActivated: false },
      trigger: "free",
      override: semPoder,
    })
    expect(v.blocked).toBe(false)
    expect(v).toMatchObject({ overridden: false })
  })

  it("bloqueia quem nunca ativou, sem a permissão", () => {
    const v = assertCortesiaExcepcional({
      tenant: { neverActivated: true },
      trigger: "free",
      override: semPoder,
    })
    expect(v.blocked).toBe(true)
    expect(v).toMatchObject({ requiresReason: false })
  })

  /**
   * Quem TEM o poder e não mandou motivo recebe `requiresReason` — é o sinal
   * que faz o cliente abrir o diálogo de justificativa em vez de mostrar erro.
   */
  it("pede o motivo de quem tem a permissão", () => {
    const v = assertCortesiaExcepcional({
      tenant: { neverActivated: true },
      trigger: "promo",
      override: comPoder(),
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: true })
  })

  it("recusa motivo curto demais", () => {
    const v = assertCortesiaExcepcional({
      tenant: { neverActivated: true },
      trigger: "postpone",
      override: comPoder("x".repeat(MIN_REASON_LENGTH - 1)),
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: true })
  })

  it("recusa motivo que é só espaço em branco", () => {
    const v = assertCortesiaExcepcional({
      tenant: { neverActivated: true },
      trigger: "reactivate",
      override: comPoder("          "),
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: true })
  })

  it("libera com a permissão e motivo suficiente, marcando o override", () => {
    const v = assertCortesiaExcepcional({
      tenant: { neverActivated: true },
      trigger: "reactivate",
      override: comPoder("  cliente renegociou, pagamento combinado por PIX  "),
    })
    expect(v.blocked).toBe(false)
    expect(v).toMatchObject({
      overridden: true,
      reason: "cliente renegociou, pagamento combinado por PIX",
    })
  })

  it("a mensagem nomeia a ação pedida", () => {
    const v = assertCortesiaExcepcional({
      tenant: { neverActivated: true },
      trigger: "postpone",
      override: comPoder(),
    })
    expect(v.blocked && v.message).toContain("adiar o vencimento")
  })
})
