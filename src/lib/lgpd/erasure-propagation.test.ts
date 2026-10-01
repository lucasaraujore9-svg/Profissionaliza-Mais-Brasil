import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { student: { findUnique: vi.fn() } },
}))
vi.mock("@/lib/lms", () => ({
  isLmsConfigured: vi.fn(() => true),
  revokeLmsEnrollment: vi.fn(),
  eraseLmsStudent: vi.fn(),
}))
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => ({ id: "n1" })),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { eraseLmsStudent, isLmsConfigured, revokeLmsEnrollment } from "@/lib/lms"
import { createNotification } from "@/lib/notifications"
import { propagateStudentErasure } from "./erasure-propagation"

const findUnique = (prisma as unknown as {
  student: { findUnique: ReturnType<typeof vi.fn> }
}).student.findUnique
const revoke = revokeLmsEnrollment as unknown as ReturnType<typeof vi.fn>
const erase = eraseLmsStudent as unknown as ReturnType<typeof vi.fn>
const lmsConfigured = isLmsConfigured as unknown as ReturnType<typeof vi.fn>
const notify = createNotification as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  findUnique.mockReset()
  revoke.mockReset()
  erase.mockReset()
  erase.mockResolvedValue(true)
  notify.mockReset()
  lmsConfigured.mockReturnValue(true)
  notify.mockResolvedValue({ id: "n1" })
})

describe("propagateStudentErasure — LGPD-013", () => {
  it("revoga cada matrícula LMS, apaga a PII lá e sempre registra retenção legal", async () => {
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
    // O LMS tem API de exclusão (DELETE /students/:id): apaga nome/e-mail e
    // LIBERA o e-mail para um cadastro novo na mesma unidade. Só a EA fica manual.
    expect(erase).toHaveBeenCalledWith("stu1")
    expect(res.lmsPiiErased).toBe(true)
    expect(res.manualPending).toHaveLength(1)
    expect(res.manualPending[0]).toContain("EA")
    // Asaas/MP sempre listados como retenção legal (não se apaga).
    expect(res.legalRetention.join(" ")).toContain("obrigação legal")
    // Notifica SUPER_ADMIN sobre a pendência manual.
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].roleTarget).toBe("SUPER_ADMIN")
  })

  it("a exclusão no LMS vem DEPOIS de revogar as matrículas", async () => {
    findUnique.mockResolvedValue({
      plataformaAlunoId: null,
      nome: "Fulano",
      enrollments: [{ lmsEnrollmentId: "e1" }],
    })
    const order: string[] = []
    revoke.mockImplementation(async () => void order.push("revoke"))
    erase.mockImplementation(async () => {
      order.push("erase")
      return true
    })

    await propagateStudentErasure("stu1")
    expect(order).toEqual(["revoke", "erase"])
  })

  it("LMS falha ao apagar a PII: vira pendência manual, sem lançar", async () => {
    findUnique.mockResolvedValue({
      plataformaAlunoId: null,
      nome: "Fulano",
      enrollments: [{ lmsEnrollmentId: "e1" }],
    })
    revoke.mockResolvedValue(undefined)
    erase.mockRejectedValue(new Error("LMS 503"))

    const res = await propagateStudentErasure("stu1")
    expect(res.lmsPiiErased).toBe(false)
    expect(res.manualPending.join(" ")).toContain("LMS")
  })

  it("aluno que nunca foi ao LMS (404): nada a apagar, sem pendência", async () => {
    findUnique.mockResolvedValue({ plataformaAlunoId: null, nome: "Fulano", enrollments: [] })
    erase.mockResolvedValue(false)

    const res = await propagateStudentErasure("stu1")
    expect(res.lmsPiiErased).toBe(false)
    expect(res.manualPending).toEqual([])
    expect(notify).not.toHaveBeenCalled()
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
    expect(erase).not.toHaveBeenCalled()
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
