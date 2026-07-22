import { describe, it, expect, vi, beforeEach } from "vitest"

// O que precisa ser provado: a liberação do acesso do aluno na plataforma só
// acontece quando NENHUMA matrícula viva da mesma PESSOA ainda merece a trava.
// O login da plataforma é único por pessoa e compartilhado entre unidades —
// liberar cedo demais devolveria acesso a um curso que ainda não foi pago.

vi.mock("@/lib/prisma", () => ({
  prisma: { enrollment: { findMany: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock("@/lib/students/plataforma-actions", () => ({
  findPersonStudentIds: vi.fn(),
  setStudentPaceBlock: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import {
  findPersonStudentIds,
  setStudentPaceBlock,
} from "@/lib/students/plataforma-actions"
import { releaseStudentPaceIfClear, clearPaceFlags } from "./pace"

const p = prisma as unknown as {
  enrollment: {
    findMany: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}
const personIdsMock = findPersonStudentIds as unknown as ReturnType<typeof vi.fn>
const setBlockMock = setStudentPaceBlock as unknown as ReturnType<typeof vi.fn>

/** Matrícula de carnê: `paid` de `total` parcelas pagas, `progress`% assistido. */
function carne(paid: number, total: number, progress: number, extra = {}) {
  return {
    id: "e1",
    paymentType: "BOLETO_INSTALLMENT",
    installmentsPaid: paid,
    installmentsTotal: total,
    progressPercent: progress,
    paceExemptAt: null,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  personIdsMock.mockResolvedValue(["s1"])
  setBlockMock.mockResolvedValue(true)
  p.enrollment.updateMany.mockResolvedValue({ count: 0 })
})

describe("releaseStudentPaceIfClear", () => {
  it("libera quando não sobrou matrícula viva", async () => {
    p.enrollment.findMany.mockResolvedValue([])

    expect(await releaseStudentPaceIfClear("s1")).toBe(true)
    expect(setBlockMock).toHaveBeenCalledWith("s1", false)
  })

  it("libera quando as matrículas vivas estão dentro da cota", async () => {
    // 1 de 2 parcelas pagas = cota 50%; com 30% assistido ainda há folga.
    p.enrollment.findMany.mockResolvedValue([carne(1, 2, 30)])

    expect(await releaseStudentPaceIfClear("s1")).toBe(true)
    expect(setBlockMock).toHaveBeenCalledWith("s1", false)
  })

  it("NÃO libera enquanto outra matrícula ainda estiver travada", async () => {
    // Cota 50% com 60% assistido → segue travado.
    p.enrollment.findMany.mockResolvedValue([carne(1, 2, 60, { id: "e2" })])

    expect(await releaseStudentPaceIfClear("s1")).toBe(false)
    expect(setBlockMock).not.toHaveBeenCalled()
  })

  it("ignora matrícula com liberação manual (paceExemptAt)", async () => {
    p.enrollment.findMany.mockResolvedValue([
      carne(1, 2, 90, { paceExemptAt: new Date() }),
    ])

    expect(await releaseStudentPaceIfClear("s1")).toBe(true)
    expect(setBlockMock).toHaveBeenCalledWith("s1", false)
  })

  it("olha as matrículas de TODAS as identidades da mesma pessoa", async () => {
    // O login da plataforma é compartilhado entre unidades: decidir olhando só
    // um Student devolveria acesso a um curso travado de outra unidade.
    personIdsMock.mockResolvedValue(["s1", "s2"])
    p.enrollment.findMany.mockResolvedValue([])

    await releaseStudentPaceIfClear("s1")

    expect(p.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: { in: ["s1", "s2"] } }),
      }),
    )
  })

  it("não deixa falha na plataforma derrubar quem chamou", async () => {
    p.enrollment.findMany.mockResolvedValue([])
    setBlockMock.mockRejectedValue(new Error("EA fora do ar"))

    await expect(releaseStudentPaceIfClear("s1")).resolves.toBe(false)
  })
})

describe("clearPaceFlags", () => {
  it("não consulta o banco com lista vazia", async () => {
    await clearPaceFlags([])
    expect(p.enrollment.updateMany).not.toHaveBeenCalled()
  })

  it("limpa só as matrículas que estavam travadas", async () => {
    await clearPaceFlags(["e1", "e2"])

    expect(p.enrollment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["e1", "e2"] }, paceBlockedAt: { not: null } },
      data: { paceBlockedAt: null, paceAppliedPercent: null },
    })
  })
})
