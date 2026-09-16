import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Assinatura no boleto: criar, emitir e cancelar os boletos.
 *
 * Os defeitos caros aqui são de DINHEIRO: boleto emitido duas vezes para o
 * mesmo ciclo, boleto de uma assinatura cancelada que segue pagável, cobrança
 * da unidade saindo na conta-mãe. Os testes usam um "banco" em memória para as
 * linhas do carnê, porque a emissão lê e grava a mesma linha várias vezes.
 */

type Row = Record<string, unknown> & { id: string }

const store = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown> & { id: string }>,
  seq: 0,
  sub: null as Record<string, unknown> | null,
}))

const db = vi.hoisted(() => ({
  studentSubscription: { findUnique: vi.fn(), update: vi.fn() },
  subscriptionPayment: {
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  student: { update: vi.fn() },
}))

vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))

const asaas = vi.hoisted(() => {
  class AsaasApiError extends Error {
    constructor(public statusCode: number) {
      super(`asaas ${statusCode}`)
    }
  }
  return {
    AsaasApiError,
    createPayment: vi.fn(),
    decryptTenantAsaasKey: vi.fn((v: string) => `plain:${v}`),
    deletePayment: vi.fn(),
    findOrCreateAsaasCustomer: vi.fn(async (..._args: unknown[]) => ({
      customer: { id: "cus_1" },
      created: false,
    })),
    listPayments: vi.fn(async (..._args: unknown[]) => ({ data: [] as unknown[] })),
    motherAsaasKey: vi.fn(() => "mother-key"),
  }
})
vi.mock("@/lib/asaas/client", () => asaas)
vi.mock("@/lib/asaas/payment-instrument", () => ({
  asaasBoletoInstrument: vi.fn(async (p: { id: string }) => ({
    url: `https://boleto/${p.id}.pdf`,
    digitableLine: `linha-${p.id}`,
  })),
}))

const mp = vi.hoisted(() => {
  class MPApiError extends Error {
    constructor(public statusCode: number) {
      super(`mp ${statusCode}`)
    }
  }
  return {
    MPApiError,
    cancelPayment: vi.fn(async () => ({})),
    createPayment: vi.fn(),
    decryptTenantMpToken: vi.fn((v: string) => `plain:${v}`),
  }
})
vi.mock("@/lib/mercadopago/client", () => mp)
vi.mock("@/lib/enrollment/gateway-credentials", () => ({
  resolveEnrollmentGatewayKeys: vi.fn(async () => ({
    asaasApiKey: "unit-key",
    mpAccessToken: "unit-token",
  })),
}))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: (s: string) => s,
  withAdvisoryLock: async (_k: unknown, fn: () => Promise<void>) => {
    await fn()
    return true
  },
}))
vi.mock("@/lib/tenant/urls", () => ({
  asaasWebhookUrl: (slug?: string) => `https://hook/asaas?tenant=${slug ?? ""}`,
  mpWebhookUrl: (slug?: string) => `https://hook/mp?tenant=${slug ?? ""}`,
}))

import {
  CarneInputError,
  cancelOpenCarneRows,
  createSubscriptionCarne,
  emitCarneRow,
} from "./carne"
import { noonUtc } from "./carne-schedule"

const ADDRESS = {
  cep: "30110000",
  rua: "Rua A",
  numero: "10",
  bairro: "Centro",
  cidade: "Belo Horizonte",
  estado: "MG",
}

function student(over: Record<string, unknown> = {}) {
  return {
    id: "stu_1",
    nome: "Aluna Teste",
    email: "a@x.com",
    cpf: "39053344705",
    fone: "31999999999",
    responsavel: null,
    cpfResponsavel: null,
    responsavelEmail: null,
    responsavelFone: null,
    asaasCustomerId: null,
    responsavelAsaasCustomerId: null,
    ...ADDRESS,
    ...over,
  }
}

function subscription(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    tenantId: "ten_1",
    status: "PENDING",
    interval: "MONTHLY",
    priceAtPurchase: 59.9,
    gateway: "ASAAS",
    asaasCustomerId: null,
    plan: { name: "Plano Total" },
    student: student(),
    tenant: { id: "ten_1", slug: "unidade", asaasApiKey: "enc-asaas", mpAccessToken: "enc-mp" },
    ...over,
  }
}

function find(id: unknown): Row | undefined {
  return store.rows.find((r) => r.id === id)
}

beforeEach(() => {
  vi.clearAllMocks()
  store.rows = []
  store.seq = 0
  store.sub = subscription()

  db.studentSubscription.findUnique.mockImplementation(async () => store.sub)
  db.subscriptionPayment.count.mockImplementation(async () => store.rows.length)
  db.subscriptionPayment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = {
      id: `row_${++store.seq}`,
      paidAt: null,
      asaasPaymentId: null,
      mpPaymentId: null,
      bankSlipUrl: null,
      digitableLine: null,
      emitAttempts: 0,
      ...data,
    }
    store.rows.push(row)
    return row
  })
  db.subscriptionPayment.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    find(where.id) ?? null,
  )
  db.subscriptionPayment.findFirst.mockImplementation(
    async ({ where }: { where: { asaasPaymentId?: string } }) =>
      store.rows.find((r) => r.asaasPaymentId === where.asaasPaymentId) ?? null,
  )
  db.subscriptionPayment.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = find(where.id)!
      for (const [k, v] of Object.entries(data)) {
        row[k] =
          v && typeof v === "object" && "increment" in (v as object)
            ? (row[k] as number) + (v as { increment: number }).increment
            : v
      }
      return row
    },
  )
  db.subscriptionPayment.findMany.mockImplementation(async () =>
    store.rows.filter((r) => !r.paidAt && r.status !== "CANCELLED"),
  )

  let n = 0
  asaas.createPayment.mockImplementation(async (p: { dueDate: string }) => ({
    id: `pay_${++n}`,
    dueDate: p.dueDate,
    bankSlipUrl: null,
  }))
  mp.createPayment.mockImplementation(async () => ({
    id: 9001,
    transaction_details: { external_resource_url: "https://mp/boleto.pdf", digitable_line: "linha-mp" },
  }))
})

describe("createSubscriptionCarne", () => {
  it("Asaas: o carnê inteiro sai na venda, um boleto por ciclo, na conta da UNIDADE", async () => {
    const first = noonUtc("2026-10-10")
    const r = await createSubscriptionCarne({ subscriptionId: "sub_1", count: 3, firstDueDate: first })

    expect(asaas.createPayment).toHaveBeenCalledTimes(3)
    expect(asaas.createPayment.mock.calls.map((c) => c[0].dueDate)).toEqual([
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
    ])
    for (const [params, key] of asaas.createPayment.mock.calls) {
      expect(params).toMatchObject({
        billingType: "BOLETO",
        value: 59.9,
        // A referência que o webhook usa para achar a assinatura.
        externalReference: "pmb_sub_sub_1",
      })
      expect(key).toBe("plain:enc-asaas")
    }
    expect(asaas.motherAsaasKey).not.toHaveBeenCalled()
    expect(store.rows.map((row) => [row.number, row.status, row.asaasPaymentId])).toEqual([
      [1, "PENDING", "pay_1"],
      [2, "PENDING", "pay_2"],
      [3, "PENDING", "pay_3"],
    ])
    expect(r.firstBoleto).toEqual({ url: "https://boleto/pay_1.pdf", digitableLine: "linha-pay_1" })
    expect(db.studentSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: { boletoCarne: true, billingType: "BOLETO", externalReference: "pmb_sub_sub_1" },
    })
  })

  it("Mercado Pago: só o boleto na janela sai agora — o resto o cron emite", async () => {
    store.sub = subscription({ gateway: "MP" })
    const first = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)

    await createSubscriptionCarne({ subscriptionId: "sub_1", count: 3, firstDueDate: first })

    expect(mp.createPayment).toHaveBeenCalledTimes(1)
    const [token, params, idempotencyKey] = mp.createPayment.mock.calls[0]
    expect(token).toBe("plain:enc-mp")
    // Referência POR LINHA: o `cancelled` do boleto vencido não pode cair no
    // tratamento de assinatura, que o lê como estorno.
    expect(params.external_reference).toBe("subbol_row_1")
    expect(params.payment_method_id).toBe("bolbradesco")
    expect(params.notification_url).toBe("https://hook/mp?tenant=unidade")
    expect(idempotencyKey).toBe("subbol_row_1_1")
    expect(store.rows.map((row) => row.status)).toEqual(["PENDING", "SCHEDULED", "SCHEDULED"])
  })

  it("Mercado Pago sem endereço recusa ANTES de criar qualquer boleto", async () => {
    store.sub = subscription({ gateway: "MP", student: student({ bairro: null }) })
    await expect(
      createSubscriptionCarne({ subscriptionId: "sub_1", count: 3, firstDueDate: noonUtc("2026-10-10") }),
    ).rejects.toBeInstanceOf(CarneInputError)
    expect(store.rows).toEqual([])
    expect(mp.createPayment).not.toHaveBeenCalled()
  })

  it("aluno menor: o boleto sai no CPF do responsável", async () => {
    store.sub = subscription({
      student: student({ responsavel: "Mãe", cpfResponsavel: "11144477735", responsavelEmail: "m@x.com" }),
    })
    await createSubscriptionCarne({ subscriptionId: "sub_1", count: 1, firstDueDate: noonUtc("2026-10-10") })
    expect(asaas.findOrCreateAsaasCustomer.mock.calls[0][0]).toMatchObject({ cpfCnpj: "11144477735" })
  })

  it("vitalício não vira carnê de vários boletos", async () => {
    store.sub = subscription({ interval: "LIFETIME" })
    await expect(
      createSubscriptionCarne({ subscriptionId: "sub_1", count: 2, firstDueDate: noonUtc("2026-10-10") }),
    ).rejects.toBeInstanceOf(CarneInputError)
    expect(store.rows).toEqual([])
  })

  it("assinatura que já tem cobrança não ganha carnê por cima", async () => {
    db.subscriptionPayment.count.mockResolvedValueOnce(1)
    await expect(
      createSubscriptionCarne({ subscriptionId: "sub_1", count: 2, firstDueDate: noonUtc("2026-10-10") }),
    ).rejects.toThrow(/já tem cobranças/)
    expect(asaas.createPayment).not.toHaveBeenCalled()
  })

  it("1º boleto que não sai derruba a criação (quem chama desfaz)", async () => {
    asaas.createPayment.mockRejectedValueOnce(new asaas.AsaasApiError(500))
    await expect(
      createSubscriptionCarne({ subscriptionId: "sub_1", count: 2, firstDueDate: noonUtc("2026-10-10") }),
    ).rejects.toThrow()
  })

  it("falha num boleto SEGUINTE não derruba a venda — a linha fica para o cron", async () => {
    asaas.createPayment
      .mockImplementationOnce(async (p: { dueDate: string }) => ({ id: "pay_1", dueDate: p.dueDate }))
      .mockRejectedValueOnce(new asaas.AsaasApiError(500))
    const r = await createSubscriptionCarne({
      subscriptionId: "sub_1",
      count: 2,
      firstDueDate: noonUtc("2026-10-10"),
    })
    expect(r.count).toBe(2)
    expect(store.rows.map((row) => row.status)).toEqual(["PENDING", "SCHEDULED"])
  })

  it("vitrine PMB usa a conta-mãe", async () => {
    store.sub = subscription({ tenantId: null, tenant: null })
    await createSubscriptionCarne({ subscriptionId: "sub_1", count: 1, firstDueDate: noonUtc("2026-10-10") })
    expect(asaas.createPayment.mock.calls[0][1]).toBe("mother-key")
  })
})

describe("emitCarneRow", () => {
  async function seedRow(over: Record<string, unknown> = {}) {
    return db.subscriptionPayment.create({
      data: {
        subscriptionId: "sub_1",
        tenantId: "ten_1",
        number: 2,
        amount: 59.9,
        gateway: "ASAAS",
        status: "SCHEDULED",
        dueDate: noonUtc("2099-11-10"),
        ...over,
      },
    })
  }

  it("linha já emitida não gera outro boleto", async () => {
    const row = await seedRow({ asaasPaymentId: "pay_x", bankSlipUrl: "https://b/x.pdf", status: "PENDING" })
    const r = await emitCarneRow(row.id)
    expect(r).toEqual({ status: "already", boleto: { url: "https://b/x.pdf", digitableLine: undefined } })
    expect(asaas.createPayment).not.toHaveBeenCalled()
  })

  it("boleto criado numa tentativa que caiu antes de gravar é ADOTADO, não duplicado", async () => {
    const row = await seedRow()
    asaas.listPayments.mockResolvedValueOnce({
      data: [
        { id: "pay_other_due", dueDate: "2099-12-10", status: "PENDING", deleted: false },
        { id: "pay_deleted", dueDate: "2099-11-10", status: "PENDING", deleted: true },
        { id: "pay_orphan", dueDate: "2099-11-10", status: "PENDING", deleted: false },
      ],
    })
    const r = await emitCarneRow(row.id)
    expect(r.status).toBe("emitted")
    expect(asaas.createPayment).not.toHaveBeenCalled()
    expect(find(row.id)!.asaasPaymentId).toBe("pay_orphan")
  })

  it("Asaas não aceita vencimento no passado: o boleto atrasado vence hoje", async () => {
    const row = await seedRow({ dueDate: noonUtc("2020-01-10") })
    await emitCarneRow(row.id)
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    expect(asaas.createPayment.mock.calls[0][0].dueDate).toBe(today)
    // A agenda da linha continua a mesma — é dela que sai o período pago.
    expect((find(row.id)!.dueDate as Date).toISOString()).toBe("2020-01-10T12:00:00.000Z")
  })

  it("reemissão no Mercado Pago troca a chave de idempotência", async () => {
    store.sub = subscription({ gateway: "MP" })
    const row = await seedRow({ gateway: "MP", status: "OVERDUE", emitAttempts: 1 })
    await emitCarneRow(row.id)
    expect(mp.createPayment.mock.calls[0][2]).toBe(`subbol_${row.id}_2`)
    expect(find(row.id)!.emitAttempts).toBe(2)
  })

  it("assinatura encerrada não emite", async () => {
    store.sub = subscription({ status: "CANCELLED" })
    const row = await seedRow()
    expect(await emitCarneRow(row.id)).toEqual({ status: "skipped" })
    expect(asaas.createPayment).not.toHaveBeenCalled()
  })

  it("linha paga ou cancelada não emite", async () => {
    const paid = await seedRow({ paidAt: new Date() })
    const cancelled = await seedRow({ number: 3, status: "CANCELLED" })
    expect(await emitCarneRow(paid.id)).toEqual({ status: "skipped" })
    expect(await emitCarneRow(cancelled.id)).toEqual({ status: "skipped" })
  })
})

describe("cancelOpenCarneRows", () => {
  function open(over: Record<string, unknown>) {
    const row = {
      id: `row_${++store.seq}`,
      tenantId: "ten_1",
      status: "PENDING",
      paidAt: null,
      asaasPaymentId: null,
      mpPaymentId: null,
      ...over,
    }
    store.rows.push(row)
    return row
  }

  it("cancela no gateway e só então marca a linha", async () => {
    const a = open({ asaasPaymentId: "pay_1" })
    const m = open({ mpPaymentId: "mp_1" })
    const s = open({ status: "SCHEDULED" })
    asaas.deletePayment.mockResolvedValueOnce({ deleted: true, id: "pay_1" })

    expect(await cancelOpenCarneRows("sub_1")).toEqual({ ok: true })
    expect(asaas.deletePayment).toHaveBeenCalledWith("pay_1", "unit-key")
    expect(mp.cancelPayment).toHaveBeenCalledWith("unit-token", "mp_1")
    expect([a, m, s].map((r) => find(r.id)!.status)).toEqual(["CANCELLED", "CANCELLED", "CANCELLED"])
  })

  it("DELETE do Asaas é soft: sem `deleted: true` o boleto segue vivo e a linha NÃO é marcada", async () => {
    const a = open({ asaasPaymentId: "pay_1" })
    asaas.deletePayment.mockResolvedValueOnce({ deleted: false, id: "pay_1" })
    const r = await cancelOpenCarneRows("sub_1")
    expect(r.ok).toBe(false)
    expect(find(a.id)!.status).toBe("PENDING")
  })

  it("boleto que o gateway já não conhece conta como cancelado", async () => {
    const a = open({ asaasPaymentId: "pay_1" })
    const m = open({ mpPaymentId: "mp_1" })
    asaas.deletePayment.mockRejectedValueOnce(new asaas.AsaasApiError(404))
    mp.cancelPayment.mockRejectedValueOnce(new mp.MPApiError(400))
    expect(await cancelOpenCarneRows("sub_1")).toEqual({ ok: true })
    expect(find(a.id)!.status).toBe("CANCELLED")
    expect(find(m.id)!.status).toBe("CANCELLED")
  })

  it("falha de rede no gateway volta como erro", async () => {
    open({ mpPaymentId: "mp_1" })
    mp.cancelPayment.mockRejectedValueOnce(new mp.MPApiError(503))
    expect((await cancelOpenCarneRows("sub_1")).ok).toBe(false)
  })
})
