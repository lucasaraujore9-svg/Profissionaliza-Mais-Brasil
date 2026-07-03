import { describe, it, expect, vi, beforeEach } from "vitest"

// PERF-010/API-007: os eventos de catalogo do webhook LMS deixaram de disparar
// syncCatalogFromLMS() COMPLETO por evento e passaram a sincronizar SO o curso do
// evento (incremental). Este teste prova o roteamento do dispatcher:
//  - course.published/updated -> syncSingleLmsCourse(slug) (curso novo/curado)
//  - course.unpublished       -> deactivateLmsCourse(courseId)
//  - curso nao publicado (detalhe 404 => null) -> ok sem erro
// e que o sync COMPLETO nunca e chamado no caminho de webhook.
vi.mock("@/lib/catalog/sync-lms", () => ({
  syncSingleLmsCourse: vi.fn(),
  deactivateLmsCourse: vi.fn(),
  syncCatalogFromLMS: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: { findFirst: vi.fn(), update: vi.fn() },
    systemSettings: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/certificates/issue", () => ({ issueCertificateIfEligible: vi.fn() }))
vi.mock("@/lib/support/student-support", () => ({
  createStudentSupportTicket: vi.fn(),
  SUPPORT_STUDENT_SELECT: {},
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  syncSingleLmsCourse,
  deactivateLmsCourse,
  syncCatalogFromLMS,
} from "@/lib/catalog/sync-lms"
import { processLmsWebhookEvent } from "./lms-process"

const singleMock = syncSingleLmsCourse as unknown as ReturnType<typeof vi.fn>
const deactivateMock = deactivateLmsCourse as unknown as ReturnType<typeof vi.fn>
const fullMock = syncCatalogFromLMS as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("processLmsWebhookEvent — catalogo incremental (PERF-010/API-007)", () => {
  it("course.published: sincroniza SO o curso do evento (novo)", async () => {
    singleMock.mockResolvedValue({ created: true })

    const res = await processLmsWebhookEvent("course.published", {
      courseId: "lms-uuid-1",
      slug: "eletricista-residencial",
    })

    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(singleMock).toHaveBeenCalledWith("eletricista-residencial")
    expect(fullMock).not.toHaveBeenCalled()
    expect(deactivateMock).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
    expect(res.message).toMatch(/novo/)
  })

  it("course.updated: sincroniza SO o curso do evento (curso conhecido/atualizado)", async () => {
    singleMock.mockResolvedValue({ created: false })

    const res = await processLmsWebhookEvent("course.updated", {
      courseId: "lms-uuid-1",
      slug: "eletricista-residencial",
    })

    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(singleMock).toHaveBeenCalledWith("eletricista-residencial")
    expect(fullMock).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
    expect(res.message).toMatch(/atualizado/)
  })

  it("course.updated: curso nao publicado (detalhe 404 => null) responde ok sem erro", async () => {
    singleMock.mockResolvedValue(null)

    const res = await processLmsWebhookEvent("course.updated", {
      courseId: "lms-uuid-x",
      slug: "curso-fantasma",
    })

    expect(singleMock).toHaveBeenCalledWith("curso-fantasma")
    expect(res.ok).toBe(true)
    expect(res.message).toMatch(/nada a sincronizar/)
  })

  it("course.unpublished: marca SO o curso do evento como INATIVO (por lmsCourseId)", async () => {
    deactivateMock.mockResolvedValue(1)

    const res = await processLmsWebhookEvent("course.unpublished", {
      courseId: "lms-uuid-1",
      slug: "eletricista-residencial",
    })

    expect(deactivateMock).toHaveBeenCalledTimes(1)
    expect(deactivateMock).toHaveBeenCalledWith("lms-uuid-1")
    expect(singleMock).not.toHaveBeenCalled()
    expect(fullMock).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it("course.published sem slug: rejeita (schema exige slug para o pull do detalhe)", async () => {
    await expect(
      processLmsWebhookEvent("course.published", { courseId: "lms-uuid-1" }),
    ).rejects.toThrow()
    expect(singleMock).not.toHaveBeenCalled()
  })

  it("course.unpublished sem courseId: rejeita (schema exige o id estavel)", async () => {
    await expect(
      processLmsWebhookEvent("course.unpublished", { slug: "eletricista-residencial" }),
    ).rejects.toThrow()
    expect(deactivateMock).not.toHaveBeenCalled()
  })
})
