import { describe, it, expect, vi, beforeEach } from "vitest"

// QA-017: bloqueio/desbloqueio em massa por inadimplência (billingMode=AUTO).
// Provamos o escopo por tenant (nunca toca alunos de outro tenant), a contagem
// do BlockResult, a resiliência a falha parcial (o lote continua) e a simetria
// do desbloqueio. Clients da plataforma de aulas mockados.

vi.mock("@/lib/prisma", () => {
  const prisma = {
    student: { findMany: vi.fn() },
    enrollment: { updateMany: vi.fn() },
  }
  return { prisma }
})
vi.mock("@/lib/students/plataforma-actions", () => ({
  blockStudentInEA: vi.fn(),
  unblockStudentInEA: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}))

import { prisma } from "@/lib/prisma"
import { blockStudentInEA, unblockStudentInEA } from "@/lib/students/plataforma-actions"
import { blockTenantStudents, unblockTenantStudents } from "./auto-block"

const p = prisma as unknown as {
  student: { findMany: ReturnType<typeof vi.fn> }
  enrollment: { updateMany: ReturnType<typeof vi.fn> }
}
const blockMock = blockStudentInEA as unknown as ReturnType<typeof vi.fn>
const unblockMock = unblockStudentInEA as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  blockMock.mockResolvedValue(undefined)
  unblockMock.mockResolvedValue(undefined)
})

describe("blockTenantStudents (QA-017)", () => {
  it("escopa a busca por tenant e por status elegível (não toca alunos de outro tenant)", async () => {
    p.student.findMany.mockResolvedValue([])

    await blockTenantStudents("t_x")

    expect(p.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t_x",
          status: { notIn: ["BLOQUEADO", "INATIVO", "FORMADO"] },
        }),
      }),
    )
  })

  it("bloqueia cada aluno na plataforma e contabiliza students/enrollments afetados", async () => {
    p.student.findMany.mockResolvedValue([
      { id: "s1", plataformaAlunoId: 1 },
      { id: "s2", plataformaAlunoId: 2 },
    ])
    p.enrollment.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 })

    const res = await blockTenantStudents("t_x")

    expect(blockMock).toHaveBeenCalledTimes(2)
    expect(blockMock).toHaveBeenCalledWith("s1")
    expect(blockMock).toHaveBeenCalledWith("s2")
    // Suspende apenas matrículas ACTIVE do aluno.
    expect(p.enrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: "s1", status: "ACTIVE" },
        data: { status: "SUSPENDED" },
      }),
    )
    expect(res.affectedStudents).toBe(2)
    expect(res.affectedEnrollments).toBe(3)
    expect(res.errors).toEqual([])
  })

  it("falha parcial na plataforma NÃO interrompe o lote e é registrada em errors", async () => {
    p.student.findMany.mockResolvedValue([
      { id: "s1", plataformaAlunoId: 1 },
      { id: "s2", plataformaAlunoId: 2 },
    ])
    p.enrollment.updateMany.mockResolvedValue({ count: 1 })
    blockMock.mockImplementation(async (id: string) => {
      if (id === "s2") throw new Error("plataforma 500")
    })

    const res = await blockTenantStudents("t_x")

    expect(res.affectedStudents).toBe(1) // s1 processado
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toContain("s2")
  })
})

describe("unblockTenantStudents (QA-017)", () => {
  it("busca só alunos BLOQUEADO do tenant e reativa matrículas SUSPENDED simetricamente", async () => {
    p.student.findMany.mockResolvedValue([{ id: "s1", plataformaAlunoId: 1 }])
    p.enrollment.updateMany.mockResolvedValue({ count: 2 })

    const res = await unblockTenantStudents("t_x")

    expect(p.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t_x", status: "BLOQUEADO" } }),
    )
    expect(unblockMock).toHaveBeenCalledWith("s1")
    expect(p.enrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: "s1", status: "SUSPENDED" },
        data: { status: "ACTIVE" },
      }),
    )
    expect(res.affectedStudents).toBe(1)
    expect(res.affectedEnrollments).toBe(2)
  })
})
