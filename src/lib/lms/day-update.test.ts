import { describe, it, expect, vi, beforeEach } from "vitest"

// DB-006: syncLmsDayUpdate deixou de fazer um findFirst por (aluno x curso) e
// passou a pre-carregar as matriculas LMS elegiveis em UMA findMany, indexadas
// por (studentId, lmsCourseId). Este teste prova o comportamento (mesmas
// atualizacoes de progresso/certificado) e que a leitura e batched.
vi.mock("@/lib/prisma", () => {
  const prisma = {
    systemSettings: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    course: { updateMany: vi.fn() },
    student: { findUnique: vi.fn(), findMany: vi.fn() },
    enrollment: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  }
  return { prisma }
})

vi.mock("./client", () => ({ lmsDayUpdate: vi.fn() }))
vi.mock("@/lib/certificates/issue", () => ({ issueCertificateIfEligible: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { lmsDayUpdate } from "./client"
import { issueCertificateIfEligible } from "@/lib/certificates/issue"
import { syncLmsDayUpdate } from "./day-update"

const p = prisma as unknown as {
  systemSettings: { upsert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  course: { updateMany: ReturnType<typeof vi.fn> }
  student: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  enrollment: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
  }
}

const dayUpdateMock = lmsDayUpdate as unknown as ReturnType<typeof vi.fn>
const issueMock = issueCertificateIfEligible as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  p.systemSettings.upsert.mockResolvedValue({
    lmsDayUpdateCursor: null,
    certificateAutoIssue: true,
  })
  p.systemSettings.update.mockResolvedValue({})
  p.course.updateMany.mockResolvedValue({ count: 0 })
  p.enrollment.update.mockResolvedValue({})
  issueMock.mockResolvedValue(undefined)
})

function studentCourse(partial: Record<string, unknown>) {
  return {
    slug: "s",
    title: "t",
    percent: 0,
    status: "in_progress",
    completedAt: null,
    lastActivityAt: null,
    enrollmentStatus: "active",
    grantedAt: null,
    revokedAt: null,
    ...partial,
  }
}

describe("syncLmsDayUpdate — pre-carga em lote (DB-006)", () => {
  it("faz UMA findMany batched e aplica progresso/certificado por (aluno x curso)", async () => {
    dayUpdateMock.mockResolvedValue({
      data: {
        courses: [],
        students: [
          {
            studentExternalId: "stu1",
            tenantExternalId: null,
            name: "Aluno",
            status: "active",
            courses: [
              studentCourse({ courseId: "lms-A", percent: 100, status: "completed" }),
              studentCourse({ courseId: "lms-B", percent: 40, status: "in_progress" }),
            ],
          },
        ],
      },
      since: null,
      generatedAt: "2026-07-03T00:00:00.000Z",
    })

    p.student.findUnique.mockResolvedValue({ id: "stu1" })
    p.enrollment.findMany.mockResolvedValue([
      { id: "e1", studentId: "stu1", course: { lmsCourseId: "lms-A" } },
      { id: "e2", studentId: "stu1", course: { lmsCourseId: "lms-B" } },
    ])

    const result = await syncLmsDayUpdate()

    // Leitura batched: NAO usa findFirst por curso; usa 1 findMany por lote.
    expect(p.enrollment.findFirst).not.toHaveBeenCalled()
    expect(p.enrollment.findMany).toHaveBeenCalledTimes(1)
    expect(p.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: { in: ["stu1"] } }),
      }),
    )

    // Aplica progresso nas 2 matriculas casadas.
    expect(p.enrollment.update).toHaveBeenCalledTimes(2)
    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: expect.objectContaining({ progressPercent: 100, progressStatus: "CONCLUIDO" }),
      }),
    )
    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e2" },
        data: expect.objectContaining({ progressPercent: 40, progressStatus: "EM_ANDAMENTO" }),
      }),
    )

    // Certificado so no concluido.
    expect(issueMock).toHaveBeenCalledTimes(1)
    expect(issueMock).toHaveBeenCalledWith("e1", "AUTO")

    expect(result.progressUpdated).toBe(2)
    expect(result.certificatesIssued).toBe(1)
  })

  it("cursos do delta sem matricula casada sao ignorados", async () => {
    dayUpdateMock.mockResolvedValue({
      data: {
        courses: [],
        students: [
          {
            studentExternalId: "stu1",
            tenantExternalId: null,
            name: "Aluno",
            status: "active",
            courses: [studentCourse({ courseId: "lms-Z", percent: 10 })],
          },
        ],
      },
      since: null,
      generatedAt: "2026-07-03T00:00:00.000Z",
    })

    p.student.findUnique.mockResolvedValue({ id: "stu1" })
    p.enrollment.findMany.mockResolvedValue([]) // nenhuma matricula LMS elegivel

    const result = await syncLmsDayUpdate()

    expect(p.enrollment.update).not.toHaveBeenCalled()
    expect(result.progressUpdated).toBe(0)
  })
})
