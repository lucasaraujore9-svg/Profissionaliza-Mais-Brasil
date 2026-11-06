import { describe, it, expect, vi, beforeEach } from "vitest"

// C1: venda direta parcelada (flexInstallments) tem o cronograma nas linhas de
// BoletoInstallment e a inadimplencia e do sweep das linhas — este cron (que
// preve o vencimento por startedAt + installmentsPaid meses) nao pode pega-la.

vi.mock("@/lib/prisma", () => ({
  prisma: { enrollment: { findMany: vi.fn(), update: vi.fn() } },
}))
vi.mock("@/lib/students/plataforma-actions", () => ({ blockStudentInEA: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(() => Promise.resolve(null)) }))
vi.mock("@/lib/observability/cron-heartbeat", () => ({ authorizeCron: vi.fn(async () => true) }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ info: vi.fn(), error: vi.fn() }) }))
vi.mock("@/lib/redis/cache", () => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => undefined),
  invalidate: vi.fn(async () => undefined),
}))

import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { POST } from "./route"

const findMany = prisma.enrollment.findMany as unknown as ReturnType<typeof vi.fn>
const update = prisma.enrollment.update as unknown as ReturnType<typeof vi.fn>
const blockMock = blockStudentInEA as unknown as ReturnType<typeof vi.fn>

function req() {
  return new Request("http://x/api/cron/sweep-students-overdue", { method: "POST" })
}

beforeEach(() => vi.clearAllMocks())

describe("sweep-students-overdue — venda direta parcelada fica de fora (C1)", () => {
  it("a selecao exclui flexInstallments", async () => {
    findMany.mockResolvedValue([])
    await POST(req())
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ flexInstallments: false }) }),
    )
  })

  it("matricula flex ativa conta como em dia: nao bloqueia o aluno", async () => {
    const longAgo = new Date(Date.now() - 400 * 86400_000)
    findMany.mockResolvedValue([
      {
        id: "e-old",
        status: "ACTIVE",
        startedAt: longAgo,
        installmentsTotal: 12,
        installmentsPaid: 1,
        student: {
          id: "s1",
          status: "ATIVO",
          enrollments: [
            { id: "e-old", installmentsTotal: 12, installmentsPaid: 1, startedAt: longAgo, flexInstallments: false },
            // flex com startedAt antigo e poucas pagas: pela previsao de meses
            // pareceria atrasada, mas o cronograma real esta nas linhas.
            { id: "e-flex", installmentsTotal: 12, installmentsPaid: 1, startedAt: longAgo, flexInstallments: true },
          ],
        },
      },
    ])
    update.mockResolvedValue({})
    await POST(req())
    expect(update).toHaveBeenCalledWith({ where: { id: "e-old" }, data: { status: "SUSPENDED" } })
    expect(blockMock).not.toHaveBeenCalled()
  })
})
