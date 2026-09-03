import { describe, it, expect } from "vitest"
import {
  SUBSCRIPTION_GRACE_DAYS,
  subscriptionGrantsAccess,
  subscriptionShouldCancel,
  type SubscriptionAccessInput,
} from "./access"

const NOW = new Date("2026-08-20T12:00:00Z")

function days(n: number): Date {
  const d = new Date(NOW)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function sub(over: Partial<SubscriptionAccessInput> = {}): SubscriptionAccessInput {
  return {
    status: "ACTIVE",
    currentPeriodEnd: days(10),
    interval: "MONTHLY",
    ...over,
  }
}

describe("subscriptionGrantsAccess", () => {
  it("ACTIVE com ciclo em dia libera", () => {
    expect(subscriptionGrantsAccess(sub(), NOW)).toBe(true)
  })

  it("PENDING nao libera nem com prazo no futuro", () => {
    // A assinatura foi criada mas o 1o pagamento nao confirmou: liberar aqui
    // daria o catalogo inteiro a quem so abriu o checkout.
    expect(
      subscriptionGrantsAccess(sub({ status: "PENDING" }), NOW),
    ).toBe(false)
  })

  it("PAST_DUE libera DENTRO da carencia", () => {
    // PIX/boleto nao tem debito automatico: cortar no 1o dia de atraso
    // derrubaria quem paga a fatura com um dia de folga.
    expect(
      subscriptionGrantsAccess(
        sub({ status: "PAST_DUE", currentPeriodEnd: days(-1) }),
        NOW,
      ),
    ).toBe(true)
    expect(
      subscriptionGrantsAccess(
        sub({ status: "PAST_DUE", currentPeriodEnd: days(-SUBSCRIPTION_GRACE_DAYS) }),
        NOW,
      ),
    ).toBe(true)
  })

  it("PAST_DUE deixa de liberar DEPOIS da carencia", () => {
    expect(
      subscriptionGrantsAccess(
        sub({
          status: "PAST_DUE",
          currentPeriodEnd: days(-SUBSCRIPTION_GRACE_DAYS - 1),
        }),
        NOW,
      ),
    ).toBe(false)
  })

  it("ACTIVE com ciclo vencido ha muito NAO libera", () => {
    // O ponto de decidir pelo PRAZO e nao pelo status: webhook perdido ou cron
    // atrasado deixam `status` desatualizado, e uma assinatura ACTIVE cujo
    // ciclo caiu ha semanas continuaria liberando de graca.
    expect(
      subscriptionGrantsAccess(sub({ currentPeriodEnd: days(-60) }), NOW),
    ).toBe(false)
  })

  it("CANCELLED e EXPIRED nunca liberam", () => {
    for (const status of ["CANCELLED", "EXPIRED"] as const) {
      expect(
        subscriptionGrantsAccess(sub({ status, currentPeriodEnd: days(30) }), NOW),
      ).toBe(false)
    }
  })

  it("sem ciclo pago nao libera", () => {
    expect(
      subscriptionGrantsAccess(sub({ currentPeriodEnd: null }), NOW),
    ).toBe(false)
  })
})

describe("subscriptionShouldCancel", () => {
  it("nao cancela quem esta em dia nem quem esta na carencia", () => {
    expect(subscriptionShouldCancel(sub(), NOW)).toBe(false)
    expect(
      subscriptionShouldCancel(
        sub({ status: "PAST_DUE", currentPeriodEnd: days(-2) }),
        NOW,
      ),
    ).toBe(false)
  })

  it("cancela depois de esgotada a carencia", () => {
    expect(
      subscriptionShouldCancel(
        sub({
          status: "PAST_DUE",
          currentPeriodEnd: days(-SUBSCRIPTION_GRACE_DAYS - 1),
        }),
        NOW,
      ),
    ).toBe(true)
  })

  it("nao re-cancela quem ja esta encerrado", () => {
    // Recancelar dispararia de novo a revogacao na fornecedora — e na EA isso
    // APAGA o progresso do aluno. Tem que ser uma vez so.
    for (const status of ["CANCELLED", "EXPIRED"] as const) {
      expect(
        subscriptionShouldCancel(sub({ status, currentPeriodEnd: days(-90) }), NOW),
      ).toBe(false)
    }
  })

  it("assinatura que nunca pagou nao entra na fila de cancelamento", () => {
    // Sem ciclo pago nao ha o que revogar na fornecedora.
    expect(
      subscriptionShouldCancel(
        sub({ status: "PENDING", currentPeriodEnd: null }),
        NOW,
      ),
    ).toBe(false)
  })
})

describe("assinatura VITALICIA", () => {
  // O vitalicio e uma cobranca UNICA com acesso permanente. Tratado como
  // recorrencia, ele quebraria em dois lugares ao mesmo tempo: sem
  // `currentPeriodEnd` nunca liberaria nada, e com uma data qualquer seria
  // cancelado pela varredura — e cancelar REVOGA o curso na fornecedora legada,
  // onde desvincular APAGA o progresso do aluno.
  const vitalicia: SubscriptionAccessInput = {
    status: "ACTIVE",
    currentPeriodEnd: null,
    interval: "LIFETIME",
  }

  it("libera sem `currentPeriodEnd`", () => {
    expect(subscriptionGrantsAccess(vitalicia, NOW)).toBe(true)
  })

  it("continua liberando anos depois", () => {
    expect(
      subscriptionGrantsAccess(vitalicia, new Date("2099-01-01T00:00:00Z")),
    ).toBe(true)
  })

  it("PENDING nao libera — o pagamento unico ainda nao confirmou", () => {
    expect(
      subscriptionGrantsAccess({ ...vitalicia, status: "PENDING" }, NOW),
    ).toBe(false)
  })

  it("PAST_DUE nao libera: nao existe atraso num produto sem ciclo", () => {
    // Aceitar PAST_DUE aqui transformaria qualquer marcacao equivocada de
    // atraso em acesso concedido.
    expect(
      subscriptionGrantsAccess({ ...vitalicia, status: "PAST_DUE" }, NOW),
    ).toBe(false)
  })

  it("NUNCA e candidata a cancelamento, nem com prazo vencido gravado", () => {
    expect(subscriptionShouldCancel(vitalicia, NOW)).toBe(false)
    expect(
      subscriptionShouldCancel(
        { ...vitalicia, currentPeriodEnd: days(-999) },
        NOW,
      ),
    ).toBe(false)
  })

  it("nem quando o status vem errado do gateway", () => {
    // O caso que a guarda de `shouldCancel` existe para pegar. Um vitalicio
    // marcado PAST_DUE (webhook confuso, estorno parcial, correcao manual)
    // deixa de "liberar" — e, sem a guarda, "nao libera + tem prazo vencido"
    // vira CANCELAR, que revoga o curso na fornecedora legada e APAGA o
    // progresso de quem comprou acesso permanente.
    expect(
      subscriptionShouldCancel(
        { ...vitalicia, status: "PAST_DUE", currentPeriodEnd: days(-30) },
        NOW,
      ),
    ).toBe(false)
  })
})

describe("periodicidades longas", () => {
  it("a carencia conta a partir do fim do ciclo, seja ele qual for", () => {
    // A regra de acesso nao precisa saber o TAMANHO do ciclo — so quando ele
    // acabou. Uma anual vencida ha 8 dias cai igual a uma mensal vencida ha 8.
    const anual: SubscriptionAccessInput = {
      status: "PAST_DUE",
      currentPeriodEnd: days(-(SUBSCRIPTION_GRACE_DAYS + 1)),
      interval: "ANNUAL",
    }
    expect(subscriptionGrantsAccess(anual, NOW)).toBe(false)
    expect(subscriptionShouldCancel(anual, NOW)).toBe(true)
  })
})
