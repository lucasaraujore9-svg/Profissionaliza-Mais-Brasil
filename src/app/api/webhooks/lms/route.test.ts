import { describe, it, expect, vi, beforeEach } from "vitest"

// SAAS-008: course.completed/lesson.completed para matrícula ainda não
// provisionada (corrida com o fulfillment) deve ser RETRYABLE dentro da janela
// (500, processed=false) em vez de descartar a conclusão como terminal (200).
// Passada a janela, marca terminal (200) e delega ao cron sync-day-update-lms.
vi.mock("@/lib/env", () => ({ env: { PMB_WEBHOOK_SECRET: "secret-1234567890" } }))
vi.mock("@/lib/webhooks/lms-webhook", () => ({
  validateLmsWebhookSignature: () => true,
  lmsDedupKey: () => "dedup-key-1",
}))
vi.mock("@/lib/webhooks/lms-process", () => ({
  processLmsWebhookEvent: vi.fn(),
  isLmsWebhookEvent: () => true,
}))
vi.mock("@/lib/webhooks/redact-payload", () => ({
  redactWebhookPayload: (p: unknown) => p,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookLog: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { processLmsWebhookEvent } from "@/lib/webhooks/lms-process"
import { POST } from "./route"

const p = prisma as unknown as {
  webhookLog: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}
const processMock = processLmsWebhookEvent as unknown as ReturnType<typeof vi.fn>

function req() {
  return new Request("http://x/api/webhooks/lms", {
    method: "POST",
    headers: {
      "x-pmb-event-type": "course.completed",
      "x-pmb-timestamp": "1",
      "x-pmb-signature": "sha256=abc",
      "content-type": "application/json",
    },
    body: JSON.stringify({ studentExternalId: "stu_1", courseId: "c1" }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  p.webhookLog.update.mockResolvedValue({})
  p.webhookLog.create.mockResolvedValue({ id: "log1" })
})

describe("SAAS-008 — retry de webhook LMS em corrida conclusão↔fulfillment", () => {
  it("matrícula ausente + log novo (dentro da janela) → 500 e processed=false", async () => {
    p.webhookLog.findUnique.mockResolvedValue(null) // log novo
    processMock.mockResolvedValue({ ok: false, retryable: true, message: "matrícula LMS não encontrada" })

    const res = await POST(req())
    expect(res.status).toBe(500)
    const updateArg = p.webhookLog.update.mock.calls.at(-1)?.[0]
    expect(updateArg.data.processed).toBe(false)
  })

  it("matrícula ausente + log antigo (janela expirada) → 200 e processed=true (terminal)", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000) // 1h atrás
    p.webhookLog.findUnique.mockResolvedValue({ id: "log1", processed: false, createdAt: old })
    processMock.mockResolvedValue({ ok: false, retryable: true, message: "matrícula LMS não encontrada" })

    const res = await POST(req())
    expect(res.status).toBe(200)
    const updateArg = p.webhookLog.update.mock.calls.at(-1)?.[0]
    expect(updateArg.data.processed).toBe(true)
  })

  it("falha terminal (não retryable) → 200 processed=true", async () => {
    p.webhookLog.findUnique.mockResolvedValue(null)
    processMock.mockResolvedValue({ ok: false, message: "aluno não encontrado" })

    const res = await POST(req())
    expect(res.status).toBe(200)
    const updateArg = p.webhookLog.update.mock.calls.at(-1)?.[0]
    expect(updateArg.data.processed).toBe(true)
  })

  it("sucesso → 200 processed=true, sem erro", async () => {
    p.webhookLog.findUnique.mockResolvedValue(null)
    processMock.mockResolvedValue({ ok: true, message: "conclusão processada" })

    const res = await POST(req())
    expect(res.status).toBe(200)
    const updateArg = p.webhookLog.update.mock.calls.at(-1)?.[0]
    expect(updateArg.data.processed).toBe(true)
    expect(updateArg.data.error).toBeNull()
  })
})
