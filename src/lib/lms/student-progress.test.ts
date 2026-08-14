import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: { findMany: vi.fn() },
    systemSettings: { upsert: vi.fn() },
  },
}))
vi.mock("./client", () => ({ getLmsStudent: vi.fn() }))
vi.mock("./config", () => ({ isLmsConfigured: vi.fn(() => true) }))
vi.mock("./apply-progress", () => ({ applyLmsCourseProgress: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { getLmsStudent } from "./client"
import { isLmsConfigured } from "./config"
import { applyLmsCourseProgress } from "./apply-progress"
import { syncLmsStudentProgress } from "./student-progress"

const p = prisma as unknown as {
  enrollment: { findMany: ReturnType<typeof vi.fn> }
  systemSettings: { upsert: ReturnType<typeof vi.fn> }
}
const getStudent = getLmsStudent as unknown as ReturnType<typeof vi.fn>
const configured = isLmsConfigured as unknown as ReturnType<typeof vi.fn>
const apply = applyLmsCourseProgress as unknown as ReturnType<typeof vi.fn>

function lmsCourse(partial: Record<string, unknown>) {
  return {
    slug: "s",
    title: "t",
    percent: 0,
    status: "in_progress",
    completedAt: null,
    lastActivityAt: null,
    ...partial,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  configured.mockReturnValue(true)
  p.systemSettings.upsert.mockResolvedValue({ certificateAutoIssue: true })
  apply.mockResolvedValue({ certificateIssued: false })
})

describe("syncLmsStudentProgress — atualização sob demanda de um aluno", () => {
  it("casa cada curso do LMS com a matrícula pelo lmsCourseId", async () => {
    p.enrollment.findMany.mockResolvedValue([
      { id: "e1", course: { lmsCourseId: "lms-A" } },
      { id: "e2", course: { lmsCourseId: "lms-B" } },
    ])
    getStudent.mockResolvedValue({
      courses: [
        lmsCourse({ courseId: "lms-B", percent: 40 }),
        lmsCourse({ courseId: "lms-A", percent: 100, status: "completed" }),
      ],
    })

    const res = await syncLmsStudentProgress("stu1")

    // O pareamento é por lmsCourseId, NÃO pela ordem em que o LMS devolve —
    // trocar isso gravaria o progresso de um curso na matrícula de outro.
    expect(apply).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenCalledWith(
      "e2",
      expect.objectContaining({ courseId: "lms-B", percent: 40 }),
      expect.anything(),
    )
    expect(apply).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ courseId: "lms-A", status: "completed" }),
      expect.anything(),
    )
    expect(res.updated).toBe(2)
  })

  it("consulta só as matrículas LMS DO ALUNO, incluindo suspensas", async () => {
    p.enrollment.findMany.mockResolvedValue([])

    await syncLmsStudentProgress("stu1")

    expect(p.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "stu1",
          status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
          course: { lmsCourseId: { not: null } },
        }),
      }),
    )
  })

  it("aluno sem matrícula LMS não chega a consultar a fornecedora", async () => {
    p.enrollment.findMany.mockResolvedValue([])

    const res = await syncLmsStudentProgress("stu1")

    expect(getStudent).not.toHaveBeenCalled()
    expect(res).toEqual({ updated: 0, certificatesIssued: 0 })
  })

  it("curso do LMS sem matrícula casada é ignorado", async () => {
    p.enrollment.findMany.mockResolvedValue([
      { id: "e1", course: { lmsCourseId: "lms-A" } },
    ])
    getStudent.mockResolvedValue({
      courses: [lmsCourse({ courseId: "lms-Z", percent: 90 })],
    })

    const res = await syncLmsStudentProgress("stu1")

    expect(apply).not.toHaveBeenCalled()
    expect(res.updated).toBe(0)
  })

  it("falha ao ler o perfil no LMS degrada para zerado, sem lançar", async () => {
    // A rota do aluno consulta EA e LMS no MESMO pedido: uma exceção aqui
    // derrubaria a atualização da EA junto.
    p.enrollment.findMany.mockResolvedValue([
      { id: "e1", course: { lmsCourseId: "lms-A" } },
    ])
    getStudent.mockRejectedValue(new Error("404 student not found"))

    await expect(syncLmsStudentProgress("stu1")).resolves.toEqual({
      updated: 0,
      certificatesIssued: 0,
    })
    expect(apply).not.toHaveBeenCalled()
  })

  it("LMS não configurado => no-op sem tocar no banco", async () => {
    configured.mockReturnValue(false)

    const res = await syncLmsStudentProgress("stu1")

    expect(p.enrollment.findMany).not.toHaveBeenCalled()
    expect(res).toEqual({ updated: 0, certificatesIssued: 0 })
  })

  it("conta os certificados emitidos pelo aplicador", async () => {
    p.enrollment.findMany.mockResolvedValue([
      { id: "e1", course: { lmsCourseId: "lms-A" } },
    ])
    getStudent.mockResolvedValue({
      courses: [lmsCourse({ courseId: "lms-A", percent: 100, status: "completed" })],
    })
    apply.mockResolvedValue({ certificateIssued: true })

    const res = await syncLmsStudentProgress("stu1")

    expect(res).toEqual({ updated: 1, certificatesIssued: 1 })
  })
})
