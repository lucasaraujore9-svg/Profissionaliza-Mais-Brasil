import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

// QA-011: idempotência + validação de entrada do receiver de webhook do LMS.
// Complementa route.test.ts (SAAS-008 retry) cobrindo: secret ausente→503,
// assinatura inválida→401, evento não suportado→400, JSON inválido→400,
// dedup (evento já processado)→200 {duplicate}, e recuperação da corrida P2002.

const { envState } = vi.hoisted(() => ({
  envState: { PMB_WEBHOOK_SECRET: "secret-1234567890" as string | undefined },
}))
vi.mock("@/lib/env", () => ({ env: envState }))
vi.mock("@/lib/webhooks/lms-webhook", () => ({
  validateLmsWebhookSignature: vi.fn(() => true),
  lmsDedupKey: () => "dedup-1",
}))
vi.mock("@/lib/webhooks/lms-process", () => ({
  processLmsWebhookEvent: vi.fn(),
  isLmsWebhookEvent: vi.fn(() => true),
}))
vi.mock("@/lib/webhooks/redact-payload", () => ({ redactWebhookPayload: (p: unknown) => p }))
vi.mock("@/lib/prisma", () => ({
  prisma: { webhookLog: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() } },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { validateLmsWebhookSignature } from "@/lib/webhooks/lms-webhook"
import { processLmsWebhookEvent, isLmsWebhookEvent } from "@/lib/webhooks/lms-process"
import { POST } from "./route"

const p = prisma as unknown as {
  webhookLog: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}
const validateMock = validateLmsWebhookSignature as unknown as ReturnType<typeof vi.fn>
const isEventMock = isLmsWebhookEvent as unknown as ReturnType<typeof vi.fn>
const processMock = processLmsWebhookEvent as unknown as ReturnType<typeof vi.fn>

function req(body = JSON.stringify({ studentExternalId: "s1", courseId: "c1" })) {
  return new Request("http://x/api/webhooks/lms", {
    method: "POST",
    headers: {
      "x-pmb-event-type": "course.completed",
      "x-pmb-event-id": "evt-1",
      "x-pmb-timestamp": "1",
      "x-pmb-signature": "sha256=abc",
      "content-type": "application/json",
    },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  envState.PMB_WEBHOOK_SECRET = "secret-1234567890"
  validateMock.mockReturnValue(true)
  isEventMock.mockReturnValue(true)
  p.webhookLog.update.mockResolvedValue({})
  p.webhookLog.create.mockResolvedValue({ id: "log1" })
})

describe("webhook LMS route — validação de entrada (QA-011)", () => {
  it("secret ausente → 503 (receiver desligado)", async () => {
    envState.PMB_WEBHOOK_SECRET = undefined
    const res = await POST(req())
    expect(res.status).toBe(503)
  })

  it("assinatura inválida → 401", async () => {
    validateMock.mockReturnValue(false)
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(p.webhookLog.create).not.toHaveBeenCalled()
  })

  it("evento não suportado → 400", async () => {
    isEventMock.mockReturnValue(false)
    const res = await POST(req())
    expect(res.status).toBe(400)
  })

  it("JSON inválido → 400", async () => {
    const res = await POST(req("{corpo invalido"))
    expect(res.status).toBe(400)
    expect(processMock).not.toHaveBeenCalled()
  })
})

describe("webhook LMS route — idempotência (QA-011)", () => {
  it("evento já processado → 200 {duplicate:true}, não chama o dispatcher", async () => {
    p.webhookLog.findUnique.mockResolvedValue({ id: "log1", processed: true, createdAt: new Date() })

    const res = await POST(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ duplicate: true })
    expect(processMock).not.toHaveBeenCalled()
  })

  it("evento novo → cria log, processa e marca processed:true", async () => {
    p.webhookLog.findUnique.mockResolvedValue(null)
    processMock.mockResolvedValue({ ok: true, message: "ok" })

    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(p.webhookLog.create).toHaveBeenCalledTimes(1)
    const updateArg = p.webhookLog.update.mock.calls.at(-1)![0]
    expect(updateArg.data.processed).toBe(true)
  })

  it("corrida P2002 no createLog → re-busca o log vencedor sem lançar", async () => {
    // 1ª findUnique (dedup) = null; create colide (P2002); createLog re-busca o vencedor.
    p.webhookLog.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "winner" })
    p.webhookLog.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }),
    )
    processMock.mockResolvedValue({ ok: true, message: "ok" })

    const res = await POST(req())

    expect(res.status).toBe(200)
    // O update final usa o id do log vencedor (não lançou).
    const updateArg = p.webhookLog.update.mock.calls.at(-1)![0]
    expect(updateArg.where.id).toBe("winner")
  })
})
