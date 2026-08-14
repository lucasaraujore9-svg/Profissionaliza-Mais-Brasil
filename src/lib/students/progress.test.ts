import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    enrollment: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    systemSettings: { upsert: vi.fn() },
    certificate: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/plataforma-cursos/client", () => ({ cursosVinculados: vi.fn() }))
vi.mock("@/lib/redis/cache", () => ({ get: vi.fn(), set: vi.fn() }))
vi.mock("@/lib/certificates/issue", () => ({
  issueCertificateIfEligible: vi.fn(),
  PaceGateError: class PaceGateError extends Error {},
}))
vi.mock("@/lib/enrollment/pace", () => ({ evaluatePaceGate: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { cursosVinculados } from "@/lib/plataforma-cursos/client"
import { get as cacheGet } from "@/lib/redis/cache"
import { syncStudentProgress } from "./progress"

const p = prisma as unknown as {
  student: { findUnique: ReturnType<typeof vi.fn> }
  enrollment: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
  systemSettings: { upsert: ReturnType<typeof vi.fn> }
  certificate: { findFirst: ReturnType<typeof vi.fn> }
}
const listar = cursosVinculados as unknown as ReturnType<typeof vi.fn>
const getCache = cacheGet as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  p.student.findUnique.mockResolvedValue({ id: "stu1", plataformaAlunoId: "4490" })
  p.enrollment.update.mockResolvedValue({})
  p.enrollment.updateMany.mockResolvedValue({ count: 0 })
  p.systemSettings.upsert.mockResolvedValue({
    certificateMinPercent: 90,
    certificateAutoIssue: false,
  })
  p.certificate.findFirst.mockResolvedValue(null)
  listar.mockResolvedValue([
    {
      Curso: "NR-33",
      "Data do cadastro": "05/08/2026",
      "Situação": "CONCLUÍDO",
      Porcentagem: "100%",
      "Data da última aula": "2026-08-14",
    },
  ])
})

function recentEnrollment() {
  return [
    {
      id: "e1",
      courseId: "ea_258",
      status: "ACTIVE",
      // Sincronizado agora: cai no atalho de 5 min do banco.
      progressSyncedAt: new Date(),
      course: { id: "ea_258", nome: "NR-33" },
      paymentType: "ONE_TIME",
      installmentsTotal: null,
      installmentsPaid: 0,
      primaryEnrollment: null,
    },
  ]
}

describe("syncStudentProgress — force do botão 'Atualizar progresso'", () => {
  it("SEM force: cache do Redis quente => nem chega a perguntar à plataforma", async () => {
    getCache.mockResolvedValue("1")
    p.enrollment.findMany.mockResolvedValue(recentEnrollment())

    const res = await syncStudentProgress("stu1")

    expect(listar).not.toHaveBeenCalled()
    expect(res.updated).toBe(0)
  })

  it("COM force: ignora o cache do Redis e consulta a plataforma", async () => {
    // É a razão de o botão existir: um clique explícito que respeita o cache de
    // 5 min é um botão placebo — o aluno clica, nada muda, e conclui que o
    // sistema está quebrado.
    getCache.mockResolvedValue("1")
    p.enrollment.findMany.mockResolvedValue(recentEnrollment())

    await syncStudentProgress("stu1", { force: true })

    expect(getCache).not.toHaveBeenCalled()
    expect(listar).toHaveBeenCalledWith(4490)
    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: expect.objectContaining({
          progressPercent: 100,
          progressStatus: "CONCLUIDO",
        }),
      }),
    )
  })

  it("SEM force: sync recente no banco (< 5 min) também curto-circuita", async () => {
    getCache.mockResolvedValue(null)
    p.enrollment.findMany.mockResolvedValue(recentEnrollment())

    await syncStudentProgress("stu1")

    expect(listar).not.toHaveBeenCalled()
  })

  it("COM force: ignora também o atalho de 5 min do banco", async () => {
    getCache.mockResolvedValue(null)
    p.enrollment.findMany.mockResolvedValue(recentEnrollment())

    await syncStudentProgress("stu1", { force: true })

    expect(listar).toHaveBeenCalledWith(4490)
  })
})
