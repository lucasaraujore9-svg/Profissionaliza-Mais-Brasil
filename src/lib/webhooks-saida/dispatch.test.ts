import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHmac } from "node:crypto"

const db = vi.hoisted(() => ({
  webhookEndpoint: { findMany: vi.fn() },
  webhookDelivery: {
    createManyAndReturn: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))
const background = vi.hoisted(() => [] as Array<() => Promise<unknown>>)

vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v.replace(/^enc:/, "") }))
vi.mock("@/lib/after-response", () => ({ afterResponse: (fn: () => Promise<unknown>) => background.push(fn) }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { deliverOne, emitWebhookEvent } from "./dispatch"

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

function row(over: Record<string, unknown> = {}) {
  return {
    attempts: 0,
    event: "unidade.criada",
    payload: { id: "evt_1", evento: "unidade.criada" },
    endpoint: { url: "https://hook.exemplo.com/pmb", status: "ACTIVE", secretEncrypted: "enc:whsec_x" },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  background.length = 0
  db.webhookDelivery.updateMany.mockResolvedValue({ count: 1 })
})

describe("emitWebhookEvent", () => {
  it("sem endpoint assinando: não monta payload nem grava nada", async () => {
    db.webhookEndpoint.findMany.mockResolvedValue([])
    const build = vi.fn()
    await emitWebhookEvent("unidade.criada", build, "t1")
    expect(build).not.toHaveBeenCalled()
    expect(db.webhookDelivery.createManyAndReturn).not.toHaveBeenCalled()
  })

  it("grava uma entrega por endpoint, com dedupe e skipDuplicates", async () => {
    db.webhookEndpoint.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }])
    db.webhookDelivery.createManyAndReturn.mockResolvedValue([{ id: "evt_a" }])
    await emitWebhookEvent("unidade.pagamento.confirmado", async () => ({ x: 1 }), "pay_1")

    const arg = db.webhookDelivery.createManyAndReturn.mock.calls[0]![0]
    expect(arg.skipDuplicates).toBe(true)
    expect(arg.data).toHaveLength(2)
    expect(arg.data[0].dedupeKey).toBe("unidade.pagamento.confirmado:pay_1")
    expect(arg.data[0].payload.dados).toEqual({ x: 1 })
    expect(background).toHaveLength(1)
  })

  it("tudo duplicado: nada a entregar", async () => {
    db.webhookEndpoint.findMany.mockResolvedValue([{ id: "e1" }])
    db.webhookDelivery.createManyAndReturn.mockResolvedValue([])
    await emitWebhookEvent("unidade.pagamento.confirmado", async () => ({}), "pay_1")
    expect(background).toHaveLength(0)
  })

  it("nunca lança no fluxo de negócio", async () => {
    db.webhookEndpoint.findMany.mockRejectedValue(new Error("db fora"))
    await expect(emitWebhookEvent("unidade.criada", async () => ({}))).resolves.toBeUndefined()
  })
})

describe("deliverOne", () => {
  it("2xx: assina corpo + timestamp e marca DELIVERED", async () => {
    db.webhookDelivery.findUnique.mockResolvedValue(row())
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    await deliverOne("evt_1")

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://hook.exemplo.com/pmb")
    expect(init.redirect).toBe("manual")
    const ts = init.headers["X-PMB-Timestamp"]
    const esperado = createHmac("sha256", "whsec_x").update(`${ts}.${init.body}`).digest("hex")
    expect(init.headers["X-PMB-Signature"]).toBe(`sha256=${esperado}`)
    expect(init.headers["X-PMB-Event-Id"]).toBe("evt_1")
    expect(db.webhookDelivery.update.mock.calls[0]![0].data.status).toBe("DELIVERED")
  })

  it("falha: volta para a fila com backoff", async () => {
    db.webhookDelivery.findUnique.mockResolvedValue(row())
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    await deliverOne("evt_1")
    const data = db.webhookDelivery.update.mock.calls[0]![0].data
    expect(data.status).toBe("PENDING")
    expect(data.attempts).toBe(1)
    expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
  })

  it("redirect conta como falha", async () => {
    db.webhookDelivery.findUnique.mockResolvedValue(row())
    fetchMock.mockResolvedValue({ ok: false, status: 302 })
    await deliverOne("evt_1")
    expect(db.webhookDelivery.update.mock.calls[0]![0].data.lastError).toBe("HTTP 302")
  })

  it("última tentativa falhou: FAILED", async () => {
    db.webhookDelivery.findUnique.mockResolvedValue(row({ attempts: 6 }))
    fetchMock.mockRejectedValue(new Error("timeout"))
    await deliverOne("evt_1")
    expect(db.webhookDelivery.update.mock.calls[0]![0].data.status).toBe("FAILED")
  })

  it("linha já tomada por outra execução: não envia", async () => {
    db.webhookDelivery.updateMany.mockResolvedValue({ count: 0 })
    await deliverOne("evt_1")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("endpoint desativado depois do evento: encerra sem enviar", async () => {
    db.webhookDelivery.findUnique.mockResolvedValue(
      row({ endpoint: { url: "https://h.com", status: "DISABLED", secretEncrypted: "enc:x" } }),
    )
    await deliverOne("evt_1")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.webhookDelivery.update.mock.calls[0]![0].data.status).toBe("FAILED")
  })
})
