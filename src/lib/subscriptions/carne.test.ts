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
  studentSubscription: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  subscriptionPayment: {
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
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
    createPixAutomaticAuthorization: vi.fn(),
    getPixAutomaticAuthorization: vi.fn(),
    cancelPixAutomaticAuthorization: vi.fn(async () => ({})),
  }
})
vi.mock("@/lib/asaas/client", () => asaas)
vi.mock("@/lib/asaas/payment-instrument", () => ({
  asaasPixInstrument: vi.fn(async (id: string) => ({ qrCode: `qr-${id}`, qrCodeBase64: "img" })),
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
    getPayment: vi.fn(),
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
  linkPixAutomaticFirstPayment,
  openCarnePix,
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
  db.subscriptionPayment.updateMany.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = find(where.id)
      if (!row || row.paidAt) return { count: 0 }
      Object.assign(row, data)
      return { count: 1 }
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

// ── Carnê no PIX (2026-09-29) ───────────────────────────────────────────────

describe("carnê no PIX", () => {
  const soon = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)

  it("Mercado Pago: PIX comum na conta da loja, sem pedir endereço, referência por linha", async () => {
    store.sub = subscription({
      gateway: "MP",
      student: student({ cep: null, rua: null, numero: null, bairro: null, cidade: null, estado: null }),
    })
    mp.createPayment.mockResolvedValueOnce({
      id: 7001,
      point_of_interaction: { transaction_data: { qr_code: "pix-mp", qr_code_base64: "b64" } },
    })

    const r = await createSubscriptionCarne({
      subscriptionId: "sub_1",
      count: 1,
      firstDueDate: soon(),
      method: "PIX",
    })

    const [token, params, key] = mp.createPayment.mock.calls[0]
    expect(token).toBe("plain:enc-mp")
    expect(params).toMatchObject({
      payment_method_id: "pix",
      external_reference: "subbol_row_1",
      notification_url: "https://hook/mp?tenant=unidade",
      payer: { email: "a@x.com", identification: { type: "CPF", number: "39053344705" } },
    })
    expect(params.date_of_expiration).toBeTruthy()
    expect(key).toBe("subbol_row_1_1")
    expect(r).toMatchObject({ firstPix: { qrCode: "pix-mp" }, firstBoleto: null, pixAutomatic: false })
    expect(store.rows[0]).toMatchObject({ billingType: "PIX", mpPaymentId: "7001", status: "PENDING" })
    expect(asaas.createPixAutomaticAuthorization).not.toHaveBeenCalled()
  })

  it("Asaas: a 1ª cobrança é o QR da autorização de Pix Automático", async () => {
    asaas.createPixAutomaticAuthorization.mockResolvedValueOnce({
      id: "auth_1",
      status: "CREATED",
      payload: "qr-auto",
      encodedImage: "img-auto",
    })
    const first = noonUtc("2099-10-10")

    const r = await createSubscriptionCarne({
      subscriptionId: "sub_1",
      count: 1,
      firstDueDate: first,
      method: "PIX",
    })

    const [params, apiKey] = asaas.createPixAutomaticAuthorization.mock.calls[0]
    expect(apiKey).toBe("plain:enc-asaas")
    expect(params).toMatchObject({
      customerId: "cus_1",
      frequency: "MONTHLY",
      contractId: "pmb_sub_sub_1",
      // Os débitos começam no 2º ciclo: o 1º é o próprio QR.
      startDate: "2099-11-10",
      value: 59.9,
      paymentCreationMode: "MANUAL",
      immediateQrCode: { originalValue: 59.9 },
    })
    expect(r).toMatchObject({ pixAutomatic: true, firstPix: { qrCode: "qr-auto", qrCodeBase64: "img-auto" } })
    // Nenhuma cobrança PIX comum por cima do QR.
    expect(asaas.createPayment).not.toHaveBeenCalled()
    expect(store.rows[0]).toMatchObject({ status: "PENDING", asaasPaymentId: null })
    expect(db.studentSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: { pixAutomaticAuthorizationId: "auth_1" },
    })
  })

  it("Asaas: conta sem Pix Automático (4xx) segue no PIX comum", async () => {
    asaas.createPixAutomaticAuthorization.mockRejectedValueOnce(new asaas.AsaasApiError(400))

    const r = await createSubscriptionCarne({
      subscriptionId: "sub_1",
      count: 1,
      firstDueDate: noonUtc("2099-10-10"),
      method: "PIX",
    })

    expect(asaas.createPayment.mock.calls[0][0]).toMatchObject({
      billingType: "PIX",
      externalReference: "pmb_sub_sub_1",
    })
    expect(asaas.createPayment.mock.calls[0][0].pixAutomaticAuthorizationId).toBeUndefined()
    expect(r).toMatchObject({ pixAutomatic: false, firstPix: { qrCode: "qr-pay_1" } })
  })

  it("Asaas fora do ar (5xx) NÃO vira PIX comum calado — a venda falha e quem chama desfaz", async () => {
    asaas.createPixAutomaticAuthorization.mockRejectedValueOnce(new asaas.AsaasApiError(502))
    await expect(
      createSubscriptionCarne({
        subscriptionId: "sub_1",
        count: 1,
        firstDueDate: noonUtc("2099-10-10"),
        method: "PIX",
      }),
    ).rejects.toThrow()
    expect(asaas.createPayment).not.toHaveBeenCalled()
  })

  it("vitalício no PIX não vira carnê (é cobrança única do gateway)", async () => {
    store.sub = subscription({ interval: "LIFETIME" })
    await expect(
      createSubscriptionCarne({ subscriptionId: "sub_1", count: 1, firstDueDate: soon(), method: "PIX" }),
    ).rejects.toThrow()
    expect(store.rows).toHaveLength(0)
  })

  async function pixRow(over: Record<string, unknown> = {}) {
    return db.subscriptionPayment.create({
      data: {
        subscriptionId: "sub_1",
        tenantId: "ten_1",
        number: 2,
        amount: 59.9,
        gateway: "ASAAS",
        status: "SCHEDULED",
        billingType: "PIX",
        dueDate: noonUtc("2099-11-10"),
        ...over,
      },
    })
  }

  it("ciclo seguinte com autorização ATIVA sai vinculado a ela (débito automático)", async () => {
    store.sub = subscription({ billingType: "PIX", pixAutomaticAuthorizationId: "auth_1" })
    asaas.getPixAutomaticAuthorization.mockResolvedValueOnce({ id: "auth_1", status: "ACTIVE" })
    const row = await pixRow()

    const r = await emitCarneRow(row.id)

    expect(asaas.createPayment.mock.calls[0][0]).toMatchObject({
      billingType: "PIX",
      pixAutomaticAuthorizationId: "auth_1",
    })
    expect(r).toMatchObject({ status: "emitted", pix: { qrCode: "qr-pay_1" } })
  })

  it("autorização cancelada no app do banco: o ciclo sai como PIX comum", async () => {
    store.sub = subscription({ billingType: "PIX", pixAutomaticAuthorizationId: "auth_1" })
    asaas.getPixAutomaticAuthorization.mockResolvedValueOnce({ id: "auth_1", status: "CANCELLED" })
    const row = await pixRow()

    await emitCarneRow(row.id)

    expect(asaas.createPayment.mock.calls[0][0].pixAutomaticAuthorizationId).toBeUndefined()
  })

  it("instrução de débito recusada (4xx) é refeita como PIX comum, não perde o ciclo", async () => {
    store.sub = subscription({ billingType: "PIX", pixAutomaticAuthorizationId: "auth_1" })
    asaas.getPixAutomaticAuthorization.mockResolvedValueOnce({ id: "auth_1", status: "ACTIVE" })
    asaas.createPayment
      .mockRejectedValueOnce(new asaas.AsaasApiError(400))
      .mockResolvedValueOnce({ id: "pay_plain", dueDate: "2099-11-10", bankSlipUrl: null })
    const row = await pixRow()

    await emitCarneRow(row.id)

    expect(asaas.createPayment).toHaveBeenCalledTimes(2)
    expect(asaas.createPayment.mock.calls[1][0].pixAutomaticAuthorizationId).toBeUndefined()
    expect(find(row.id)!.asaasPaymentId).toBe("pay_plain")
  })

  it("a 1ª linha nunca é vinculada à autorização — ela É o QR da autorização", async () => {
    store.sub = subscription({ billingType: "PIX", pixAutomaticAuthorizationId: "auth_1" })
    const row = await pixRow({ number: 1, status: "OVERDUE" })
    await emitCarneRow(row.id)
    expect(asaas.getPixAutomaticAuthorization).not.toHaveBeenCalled()
    expect(asaas.createPayment.mock.calls[0][0].pixAutomaticAuthorizationId).toBeUndefined()
  })

  describe("openCarnePix", () => {
    it("1ª linha de Pix Automático ainda válida: devolve o QR da autorização, sem emitir nada", async () => {
      store.sub = subscription({ billingType: "PIX", pixAutomaticAuthorizationId: "auth_1" })
      const row = await pixRow({ number: 1, status: "PENDING", dueDate: soon() })
      db.subscriptionPayment.findFirst.mockResolvedValueOnce(find(row.id))
      asaas.getPixAutomaticAuthorization.mockResolvedValueOnce({
        id: "auth_1",
        status: "CREATED",
        payload: "qr-auto",
        encodedImage: "img",
      })

      expect(await openCarnePix("sub_1")).toEqual({ qrCode: "qr-auto", qrCodeBase64: "img" })
      expect(asaas.createPayment).not.toHaveBeenCalled()
    })

    it("QR da autorização recusado/expirado: a linha passa ao PIX comum na hora", async () => {
      store.sub = subscription({ billingType: "PIX", pixAutomaticAuthorizationId: "auth_1" })
      const row = await pixRow({ number: 1, status: "PENDING", dueDate: soon() })
      db.subscriptionPayment.findFirst.mockResolvedValueOnce(find(row.id))
      asaas.getPixAutomaticAuthorization.mockResolvedValueOnce({ id: "auth_1", status: "REFUSED" })

      expect(await openCarnePix("sub_1")).toEqual({ qrCode: "qr-pay_1", qrCodeBase64: "img" })
      expect(find(row.id)!.asaasPaymentId).toBe("pay_1")
    })

    it("MP: PIX já emitido é lido ao vivo; expirado não é mostrado", async () => {
      store.sub = subscription({ gateway: "MP", billingType: "PIX" })
      const row = await pixRow({ gateway: "MP", number: 1, status: "PENDING", mpPaymentId: "77", dueDate: soon() })
      db.subscriptionPayment.findFirst.mockResolvedValue(find(row.id))
      mp.getPayment.mockResolvedValueOnce({
        status: "pending",
        point_of_interaction: { transaction_data: { qr_code: "pix-vivo", qr_code_base64: "b" } },
      })
      expect(await openCarnePix("sub_1")).toEqual({ qrCode: "pix-vivo", qrCodeBase64: "b" })

      mp.getPayment.mockResolvedValueOnce({ status: "cancelled" })
      expect(await openCarnePix("sub_1")).toBeNull()
    })
  })

  describe("linkPixAutomaticFirstPayment", () => {
    function candidate(row: Record<string, unknown>) {
      db.studentSubscription.findFirst.mockResolvedValueOnce({
        id: "sub_1",
        boletoCarne: true,
        payments: [row],
      })
    }

    it("liga o pagamento do QR à 1ª linha, pelo cliente e pelo valor — escopado à loja", async () => {
      const row = await pixRow({ number: 1, status: "PENDING" })
      candidate(find(row.id)!)

      const sub = await linkPixAutomaticFirstPayment({
        tenantId: "ten_1",
        payment: { id: "pay_qr", customer: "cus_1", value: 59.9, billingType: "PIX" },
      })

      expect(sub).toEqual({ id: "sub_1", boletoCarne: true, payments: expect.any(Array) })
      expect(db.studentSubscription.findFirst.mock.calls[0][0].where).toMatchObject({
        tenantId: "ten_1",
        asaasCustomerId: "cus_1",
        pixAutomaticAuthorizationId: { not: null },
      })
      expect(find(row.id)!.asaasPaymentId).toBe("pay_qr")
      expect(asaas.deletePayment).not.toHaveBeenCalled()
    })

    it("QR pago depois de a linha virar PIX comum: o PIX comum é removido (sem cobrança em dobro)", async () => {
      const row = await pixRow({ number: 1, status: "PENDING", asaasPaymentId: "pay_plain" })
      candidate(find(row.id)!)
      asaas.deletePayment.mockResolvedValueOnce({ deleted: true, id: "pay_plain" })

      await linkPixAutomaticFirstPayment({
        tenantId: "ten_1",
        payment: { id: "pay_qr", customer: "cus_1", value: 59.9, billingType: "PIX" },
      })

      expect(find(row.id)!.asaasPaymentId).toBe("pay_qr")
      expect(asaas.deletePayment).toHaveBeenCalledWith("pay_plain", "unit-key")
    })

    it("valor diferente ou meio que não é PIX não casa", async () => {
      const row = await pixRow({ number: 1, status: "PENDING" })
      candidate(find(row.id)!)
      expect(
        await linkPixAutomaticFirstPayment({
          tenantId: "ten_1",
          payment: { id: "pay_x", customer: "cus_1", value: 10, billingType: "PIX" },
        }),
      ).toBeNull()
      expect(
        await linkPixAutomaticFirstPayment({
          tenantId: "ten_1",
          payment: { id: "pay_y", customer: "cus_1", value: 59.9, billingType: "BOLETO" },
        }),
      ).toBeNull()
      expect(find(row.id)!.asaasPaymentId).toBeNull()
    })
  })

  it("cancelar a assinatura cancela também a autorização de Pix Automático", async () => {
    store.sub = subscription({ pixAutomaticAuthorizationId: "auth_1" })
    await cancelOpenCarneRows("sub_1")
    expect(asaas.cancelPixAutomaticAuthorization).toHaveBeenCalledWith("auth_1", "unit-key")
  })
})
