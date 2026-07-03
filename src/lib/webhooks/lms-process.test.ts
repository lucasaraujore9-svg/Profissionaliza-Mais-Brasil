import { describe, it, expect, vi, beforeEach } from "vitest"

// QA-010: dispatcher dos webhooks de ENTRADA do LMS. Faz parse Zod por evento,
// atualiza progresso, emite certificado, sincroniza catálogo (incremental) e
// roteia suporte. Idempotente por design. Aqui cobrimos o roteamento por evento,
// a borda de clampPercent (via lesson.completed), a corrida SAAS-008 (matrícula
// ausente → retryable) e o payload inválido (ZodError → a rota converte p/ 400).

vi.mock("@/lib/prisma", () => {
  const prisma = {
    enrollment: { findFirst: vi.fn(), update: vi.fn() },
    systemSettings: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
  }
  return { prisma }
})
vi.mock("@/lib/certificates/issue", () => ({ issueCertificateIfEligible: vi.fn() }))
vi.mock("@/lib/catalog/sync-lms", () => ({
  syncSingleLmsCourse: vi.fn(),
  deactivateLmsCourse: vi.fn(),
}))
vi.mock("@/lib/support/student-support", () => ({
  createStudentSupportTicket: vi.fn(),
  SUPPORT_STUDENT_SELECT: {},
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { issueCertificateIfEligible } from "@/lib/certificates/issue"
import { syncSingleLmsCourse, deactivateLmsCourse } from "@/lib/catalog/sync-lms"
import { createStudentSupportTicket } from "@/lib/support/student-support"
import {
  processLmsWebhookEvent,
  isLmsWebhookEvent,
  LMS_WEBHOOK_EVENTS,
} from "./lms-process"

const p = prisma as unknown as {
  enrollment: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  systemSettings: { findUnique: ReturnType<typeof vi.fn> }
  student: { findUnique: ReturnType<typeof vi.fn> }
}
const issueMock = issueCertificateIfEligible as unknown as ReturnType<typeof vi.fn>
const syncMock = syncSingleLmsCourse as unknown as ReturnType<typeof vi.fn>
const deactivateMock = deactivateLmsCourse as unknown as ReturnType<typeof vi.fn>
const supportMock = createStudentSupportTicket as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  p.enrollment.update.mockResolvedValue({})
  p.systemSettings.findUnique.mockResolvedValue({ certificateAutoIssue: true })
  issueMock.mockResolvedValue(undefined)
  supportMock.mockResolvedValue(undefined)
})

describe("isLmsWebhookEvent", () => {
  it("true só para os eventos de LMS_WEBHOOK_EVENTS", () => {
    for (const e of LMS_WEBHOOK_EVENTS) expect(isLmsWebhookEvent(e)).toBe(true)
    expect(isLmsWebhookEvent("payment.approved")).toBe(false)
    expect(isLmsWebhookEvent(null)).toBe(false)
  })
})

describe("course.completed (QA-010)", () => {
  it("com matrícula → progressPercent:100/CONCLUIDO e emite certificado (autoIssue on)", async () => {
    p.enrollment.findFirst.mockResolvedValue({ id: "e1" })

    const res = await processLmsWebhookEvent("course.completed", {
      studentExternalId: "s1",
      courseId: "lms-c1",
    })

    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: expect.objectContaining({ progressPercent: 100, progressStatus: "CONCLUIDO" }),
      }),
    )
    expect(issueMock).toHaveBeenCalledWith("e1", "AUTO")
    expect(res.ok).toBe(true)
  })

  it("autoIssue desligado → atualiza progresso mas NÃO emite certificado", async () => {
    p.enrollment.findFirst.mockResolvedValue({ id: "e1" })
    p.systemSettings.findUnique.mockResolvedValue({ certificateAutoIssue: false })

    await processLmsWebhookEvent("course.completed", { studentExternalId: "s1", courseId: "lms-c1" })

    expect(p.enrollment.update).toHaveBeenCalled()
    expect(issueMock).not.toHaveBeenCalled()
  })

  it("matrícula ausente → {ok:false, retryable:true} sem update (corrida SAAS-008)", async () => {
    p.enrollment.findFirst.mockResolvedValue(null)

    const res = await processLmsWebhookEvent("course.completed", { studentExternalId: "s1", courseId: "lms-c1" })

    expect(res).toMatchObject({ ok: false, retryable: true })
    expect(p.enrollment.update).not.toHaveBeenCalled()
    expect(issueMock).not.toHaveBeenCalled()
  })
})

describe("lesson.completed — clampPercent e estado (QA-010)", () => {
  beforeEach(() => {
    p.enrollment.findFirst.mockResolvedValue({ id: "e1" })
  })

  // NaN não chega ao clampPercent (o schema Zod z.number() rejeita antes — vira
  // ZodError→400 na rota). Aqui cobrimos os valores numéricos válidos que o
  // clampPercent normaliza: fora de [0,100] e arredondamento.
  it.each([
    [150, 100],
    [-5, 0],
    [33.6, 34],
  ])("percent %p é clampado para %p", async (input, expected) => {
    await processLmsWebhookEvent("lesson.completed", {
      studentExternalId: "s1",
      courseId: "lms-c1",
      percent: input,
      completedAt: "2026-07-03T00:00:00.000Z",
    })
    const data = p.enrollment.update.mock.calls.at(-1)![0].data
    expect(data.progressPercent).toBe(expected)
  })

  it("sem completedAt → progressStatus EM_ANDAMENTO", async () => {
    await processLmsWebhookEvent("lesson.completed", {
      studentExternalId: "s1",
      courseId: "lms-c1",
      percent: 40,
    })
    const data = p.enrollment.update.mock.calls.at(-1)![0].data
    expect(data.progressStatus).toBe("EM_ANDAMENTO")
  })

  it("com completedAt → CONCLUIDO", async () => {
    await processLmsWebhookEvent("lesson.completed", {
      studentExternalId: "s1",
      courseId: "lms-c1",
      completedAt: "2026-07-03T00:00:00.000Z",
    })
    const data = p.enrollment.update.mock.calls.at(-1)![0].data
    expect(data.progressStatus).toBe("CONCLUIDO")
  })
})

describe("catálogo incremental (QA-010)", () => {
  it("course.published → syncSingleLmsCourse pelo slug", async () => {
    syncMock.mockResolvedValue({ created: true })
    const res = await processLmsWebhookEvent("course.published", { slug: "curso-x", courseId: "c1" })
    expect(syncMock).toHaveBeenCalledWith("curso-x")
    expect(res.ok).toBe(true)
  })

  it("course.published de curso não publicado (null) → ok sem erro", async () => {
    syncMock.mockResolvedValue(null)
    const res = await processLmsWebhookEvent("course.published", { slug: "curso-x" })
    expect(res.ok).toBe(true)
  })

  it("course.unpublished → deactivateLmsCourse pelo courseId", async () => {
    deactivateMock.mockResolvedValue(1)
    const res = await processLmsWebhookEvent("course.unpublished", { courseId: "lms-c1" })
    expect(deactivateMock).toHaveBeenCalledWith("lms-c1")
    expect(res.ok).toBe(true)
  })
})

describe("student.question.created (QA-010)", () => {
  it("com aluno → createStudentSupportTicket (source lms)", async () => {
    p.student.findUnique.mockResolvedValue({ id: "s1", tenantId: "t1" })
    const res = await processLmsWebhookEvent("student.question.created", {
      studentExternalId: "s1",
      body: "Minha dúvida",
    })
    expect(supportMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "lms", mensagem: "Minha dúvida" }),
    )
    expect(res.ok).toBe(true)
  })

  it("aluno ausente → {ok:false} sem criar ticket", async () => {
    p.student.findUnique.mockResolvedValue(null)
    const res = await processLmsWebhookEvent("student.question.created", {
      studentExternalId: "sX",
      body: "oi",
    })
    expect(res.ok).toBe(false)
    expect(supportMock).not.toHaveBeenCalled()
  })
})

describe("payload inválido (QA-010)", () => {
  it("course.completed sem courseId → ZodError (a rota converte para 400)", async () => {
    await expect(
      processLmsWebhookEvent("course.completed", { studentExternalId: "s1" }),
    ).rejects.toThrow()
  })
})
