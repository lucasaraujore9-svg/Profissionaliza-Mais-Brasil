import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { student: { findUnique: vi.fn() } },
}))
vi.mock("@/lib/lms", () => ({
  isLmsConfigured: vi.fn(() => true),
  revokeLmsEnrollment: vi.fn(),
}))
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => ({ id: "n1" })),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { isLmsConfigured, revokeLmsEnrollment } from "@/lib/lms"
import { createNotification } from "@/lib/notifications"
import { propagateStudentErasure } from "./erasure-propagation"

const findUnique = (prisma as unknown as {
  student: { findUnique: ReturnType<typeof vi.fn> }
}).student.findUnique
const revoke = revokeLmsEnrollment as unknown as ReturnType<typeof vi.fn>
const lmsConfigured = isLmsConfigured as unknown as ReturnType<typeof vi.fn>
const notify = createNotification as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  findUnique.mockReset()
  revoke.mockReset()
  notify.mockReset()
  lmsConfigured.mockReturnValue(true)
  notify.mockResolvedValue({ id: "n1" })
})

describe("propagateStudentErasure — LGPD-013", () => {
  it("revoga cada matrícula LMS, marca pendências e sempre registra retenção legal", async () => {
    findUnique.mockResolvedValue({
      plataformaAlunoId: "555",
      nome: "Fulano",
      enrollments: [{ lmsEnrollmentId: "e1" }, { lmsEnrollmentId: "e2" }],
    })
    revoke.mockResolvedValue(undefined)

    const res = await propagateStudentErasure("stu1")

    expect(revoke).toHaveBeenCalledTimes(2)
    expect(res.lmsEnrollmentsRevoked).toBe(2)
    expect(res.lmsEnrollmentsFailed).toBe(0)
    expect(res.hasEaAccount).toBe(true)
    // EA e LMS sem API de exclusão → pendência manual.
    expect(res.manualPending.length).toBe(2)
    // Asaas/MP sempre listados como retenção legal (não se apaga).
    expect(res.legalRetention.join(" ")).toContain("obrigação legal")
    // Notifica SUPER_ADMIN sobre a pendência manual.
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].roleTarget).toBe("SUPER_ADMIN")
  })

  it("não lança quando a revogação LMS falha; conta a falha", async () => {
    findUnique.mockResolvedValue({
      plataformaAlunoId: null,
      nome: "Fulano",
      enrollments: [{ lmsEnrollmentId: "e1" }],
    })
    revoke.mockRejectedValue(new Error("LMS 503"))

    const res = await propagateStudentErasure("stu2")
    expect(res.lmsEnrollmentsRevoked).toBe(0)
    expect(res.lmsEnrollmentsFailed).toBe(1)
    expect(res.hasEaAccount).toBe(false)
  })

  it("pula LMS quando não configurado, mas ainda registra retenção legal", async () => {
    lmsConfigured.mockReturnValue(false)
    findUnique.mockResolvedValue({
      plataformaAlunoId: "999",
      nome: "Fulano",
      enrollments: [{ lmsEnrollmentId: "e1" }],
    })

    const res = await propagateStudentErasure("stu3")
    expect(revoke).not.toHaveBeenCalled()
    expect(res.hasEaAccount).toBe(true)
    expect(res.legalRetention.length).toBeGreaterThan(0)
  })

  it("student inexistente retorna resultado vazio sem lançar", async () => {
    findUnique.mockResolvedValue(null)
    const res = await propagateStudentErasure("nope")
    expect(res.lmsEnrollmentsRevoked).toBe(0)
    expect(res.manualPending).toEqual([])
    expect(notify).not.toHaveBeenCalled()
  })
})
