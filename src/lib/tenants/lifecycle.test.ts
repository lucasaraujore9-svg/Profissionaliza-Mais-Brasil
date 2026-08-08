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
import { brDayStartUtc } from "@/lib/dates"

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
  it("EVER_PAID_PAYMENT_WHERE aceita status pago, baixa manual OU paidAt", () => {
    expect(EVER_PAID_PAYMENT_WHERE).toEqual({
      OR: [
        { status: { in: [...EVER_PAID_STATUSES] } },
        { markedPaidAt: { not: null } },
        { paidAt: { not: null } },
      ],
    })
  })

  /**
   * `status` é MUTÁVEL: `asaas/process.ts` faz upsert do status atual para todo
   * evento, então um estorno reescreve a linha que era RECEIVED. Sem `paidAt`,
   * quem pagou de verdade voltaria a ler como "nunca pagou" — sairia do churn,
   * cairia em "Nunca ativou" e tomaria 403 ao ser reativado. `paidAt` sobrevive
   * às transições e é o que sustenta a monotonicidade que o módulo promete.
   */
  it("estorno não pode apagar o pagamento: paidAt está no predicado", () => {
    const clausulas = (EVER_PAID_PAYMENT_WHERE.OR ?? []) as Record<string, unknown>[]
    expect(clausulas.some((c) => "paidAt" in c)).toBe(true)
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
  /** Unidade criada em 07/08 — a âncora do teto. */
  const criadaEm = new Date("2026-08-07T15:00:00.000Z")

  it("aceita o prazo padrão da criação (D+3)", () => {
    expect(isDueDateStretched("2026-08-10", criadaEm)).toBe(false)
  })

  it("aceita exatamente o limite (D+10)", () => {
    expect(isDueDateStretched("2026-08-17", criadaEm)).toBe(false)
  })

  it("recusa um dia além do limite (D+11)", () => {
    expect(isDueDateStretched("2026-08-18", criadaEm)).toBe(true)
  })

  /** Os casos reais que motivaram a regra, medidos da CRIAÇÃO de cada unidade. */
  it("recusa os prazos esticados vistos em produção", () => {
    // valedosaber: criada 30/06, 1a cobranca em 20/07 (D+20)
    expect(isDueDateStretched("2026-07-20", new Date("2026-06-30T12:00:00Z"))).toBe(true)
    // andersoncidade: criada 16/07, 1a cobranca em 31/07 (D+15)
    expect(isDueDateStretched("2026-07-31", new Date("2026-07-16T12:00:00Z"))).toBe(true)
    // concluirconsultoriaeducacional: criada 25/06, 1a cobranca em 06/07 (D+11)
    expect(isDueDateStretched("2026-07-06", new Date("2026-06-25T12:00:00Z"))).toBe(true)
  })

  /**
   * A ÂNCORA É `createdAt`, NÃO "hoje". Ancorado em hoje, o teto vira janela
   * deslizante: adiar para hoje+10, amanhã adiar de novo para hoje+10 (já D+11
   * do original), e em um mês o vencimento está 40 dias à frente sem UMA linha
   * de auditoria, porque nenhuma chamada chegou a ser bloqueada.
   */
  it("não desliza: repetir o adiamento não compra prazo", () => {
    const criada = new Date("2026-06-01T12:00:00.000Z")
    // Primeira mexida, dentro do limite absoluto (01/06 + 10 = 11/06).
    expect(isDueDateStretched("2026-06-11", criada)).toBe(false)
    // Um mês depois, "hoje+10" seria 11/07 — e continua bloqueado, porque o
    // teto é da unidade, não do dia em que se clica.
    expect(isDueDateStretched("2026-07-11", criada)).toBe(true)
    expect(isDueDateStretched("2026-06-12", criada)).toBe(true)
  })

  /**
   * Consequência deliberada: numa unidade antiga que nunca pagou, `createdAt+10`
   * já passou, então qualquer vencimento futuro cai no gate — dar prazo novo a
   * quem nunca pagou é exatamente a cortesia que o dono quis controlar.
   */
  it("unidade antiga que nunca pagou não ganha prazo novo sem passar pelo gate", () => {
    const criadaAnoPassado = new Date("2025-08-07T12:00:00.000Z")
    expect(isDueDateStretched("2026-09-01", criadaAnoPassado)).toBe(true)
  })

  it("aceita data no passado (outra validação cuida disso)", () => {
    expect(isDueDateStretched("2026-01-01", criadaEm)).toBe(false)
  })

  it("aceita Date além de string", () => {
    expect(isDueDateStretched(new Date("2026-08-18T00:00:00.000Z"), criadaEm)).toBe(true)
    expect(isDueDateStretched(new Date("2026-08-10T00:00:00.000Z"), criadaEm)).toBe(false)
  })

  it("ignora data inválida em vez de bloquear", () => {
    expect(isDueDateStretched("não-é-data", criadaEm)).toBe(false)
  })

  it("o limite é o padrão da criação mais a folga", () => {
    expect(MAX_DUE_DAYS_AHEAD).toBe(DEFAULT_FIRST_DUE_DAYS + CORTESIA_GRACE_DAYS)
  })

  /**
   * O corte tem que ser o MESMO qualquer que seja a HORA em que a unidade foi
   * criada — `createdAt` é um instante, o vencimento é uma data civil.
   *
   * Regressão real da versão anterior: um helper montava a data com
   * `new Date().toISOString()` (dia UTC) enquanto o corte usa o dia civil
   * brasileiro. Das 00h às 03h UTC — 21h à meia-noite no Brasil — os dois
   * discordam em um dia e o caso "exatamente no limite" virava 403. O CI quebrou
   * às 00:08 UTC com o código de produção correto.
   */
  it("o corte não muda com a hora da criação", () => {
    for (let hora = 0; hora < 24; hora++) {
      const criada = new Date(Date.UTC(2026, 7, 8, hora, 30, 0))
      const diaCivilBr = brDayStartUtc(criada)

      const noLimite = new Date(diaCivilBr)
      noLimite.setUTCDate(noLimite.getUTCDate() + MAX_DUE_DAYS_AHEAD)
      const umDiaAlem = new Date(diaCivilBr)
      umDiaAlem.setUTCDate(umDiaAlem.getUTCDate() + MAX_DUE_DAYS_AHEAD + 1)

      expect(isDueDateStretched(noLimite, criada), `${hora}h UTC — no limite`).toBe(false)
      expect(isDueDateStretched(umDiaAlem, criada), `${hora}h UTC — um dia além`).toBe(true)
    }
  })
})

describe("assertCortesiaExcepcional — escopo por gatilho", () => {
  const nunca = { everPaid: false, neverActivated: false } // PENDING, nunca pagou
  const foraDoAr = { everPaid: false, neverActivated: true } // SUSPENDED/CANCELLED

  /**
   * O furo da primeira versão. A criação fixa a 1ª cobrança em D+3, então os
   * prazos esticados que motivaram a regra só podem ter sido gravados enquanto
   * a unidade ainda era PENDING — ela só vira SUSPENDED DEPOIS de vencer. Um
   * gate que exigisse SUSPENDED/CANCELLED deixava aberto justamente o caminho
   * que produziu o problema.
   */
  it.each(["free", "promo", "postpone", "discount"] as const)(
    "%s bloqueia unidade PENDING que nunca pagou",
    (trigger) => {
      const v = assertCortesiaExcepcional({
        tenant: nunca,
        trigger,
        override: { allowed: false },
      })
      expect(v.blocked).toBe(true)
    },
  )

  it("reativar NÃO dispara em unidade que ainda está no ar", () => {
    const v = assertCortesiaExcepcional({
      tenant: nunca,
      trigger: "reactivate",
      override: { allowed: false },
    })
    expect(v.blocked).toBe(false)
  })

  it("reativar dispara quando ela está fora do ar", () => {
    const v = assertCortesiaExcepcional({
      tenant: foraDoAr,
      trigger: "reactivate",
      override: { allowed: false },
    })
    expect(v.blocked).toBe(true)
  })

  it("quem já pagou passa em todos os gatilhos", () => {
    for (const trigger of ["free", "promo", "postpone", "discount", "reactivate"] as const) {
      const v = assertCortesiaExcepcional({
        tenant: { everPaid: true, neverActivated: false },
        trigger,
        override: { allowed: false },
      })
      expect(v.blocked, trigger).toBe(false)
    }
  })
})

describe("assertCortesiaExcepcional", () => {
  const semPoder = { allowed: false }
  const comPoder = (reason?: string) => ({ allowed: true, reason })

  it("libera quem já pagou, mesmo sem a permissão", () => {
    const v = assertCortesiaExcepcional({
      tenant: { everPaid: true, neverActivated: false },
      trigger: "free",
      override: semPoder,
    })
    expect(v.blocked).toBe(false)
    expect(v).toMatchObject({ overridden: false })
  })

  it("bloqueia quem nunca ativou, sem a permissão", () => {
    const v = assertCortesiaExcepcional({
      tenant: { everPaid: false, neverActivated: true },
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
      tenant: { everPaid: false, neverActivated: true },
      trigger: "promo",
      override: comPoder(),
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: true })
  })

  it("recusa motivo curto demais", () => {
    const v = assertCortesiaExcepcional({
      tenant: { everPaid: false, neverActivated: true },
      trigger: "postpone",
      override: comPoder("x".repeat(MIN_REASON_LENGTH - 1)),
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: true })
  })

  it("recusa motivo que é só espaço em branco", () => {
    const v = assertCortesiaExcepcional({
      tenant: { everPaid: false, neverActivated: true },
      trigger: "reactivate",
      override: comPoder("          "),
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: true })
  })

  it("libera com a permissão e motivo suficiente, marcando o override", () => {
    const v = assertCortesiaExcepcional({
      tenant: { everPaid: false, neverActivated: true },
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
      tenant: { everPaid: false, neverActivated: true },
      trigger: "postpone",
      override: comPoder(),
    })
    expect(v.blocked && v.message).toContain("adiar o vencimento")
  })
})
