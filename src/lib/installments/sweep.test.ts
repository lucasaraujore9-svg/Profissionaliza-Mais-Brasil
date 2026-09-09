import { describe, it, expect, vi, beforeEach } from "vitest"

// Varredura diária do carnê. O trecho coberto aqui é a etapa C — a rede de
// segurança da cota de aulas. O que precisa ser provado é QUEM ela recolhe:
// errar o filtro não quebra nada visivelmente, só deixa matrícula parcelada
// fora da trava para sempre.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    boletoInstallment: { findMany: vi.fn(), update: vi.fn() },
    enrollment: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/students/plataforma-actions", () => ({ blockStudentInEA: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/enrollment/pace", () => ({ evaluatePaceGate: vi.fn() }))
vi.mock("./plan", () => ({ generateMpBoletoForInstallment: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { PACE_GATED_WHERE, PACE_GATED_CONTENT_WHERE } from "@/lib/enrollment/pace-gate"
import { runBoletoInstallmentSweep } from "./sweep"

const p = prisma as unknown as {
  boletoInstallment: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  enrollment: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}
const paceMock = evaluatePaceGate as unknown as ReturnType<typeof vi.fn>

/** Argumento do `findMany` de matrículas — a consulta da etapa C. */
function paceQuery() {
  expect(p.enrollment.findMany).toHaveBeenCalledTimes(1)
  return p.enrollment.findMany.mock.calls[0][0]
}

beforeEach(() => {
  vi.clearAllMocks()
  // Sem parcela a emitir nem a vencer: isola a etapa C.
  p.boletoInstallment.findMany.mockResolvedValue([])
  p.enrollment.findMany.mockResolvedValue([])
  paceMock.mockResolvedValue(null)
})

describe("runBoletoInstallmentSweep — reconciliação da cota de aulas", () => {
  it("só olha matrícula ATIVA sob a regra da cota (plano próprio ou herdado)", async () => {
    await runBoletoInstallmentSweep(new Date("2026-08-07T09:00:00.000Z"))

    const query = paceQuery()
    expect(query.where.status).toBe("ACTIVE")
    // O gêmeo SQL de `isPaceGatedPlan` precisa entrar por `AND`: dois `OR`
    // soltos no mesmo objeto seriam a MESMA chave e o segundo apagaria o
    // primeiro — a varredura passaria a recolher matrícula à vista.
    expect(query.where.AND[0]).toEqual(PACE_GATED_WHERE)
  })

  it("não carrega e-book: a cota conta AULAS, e um arquivo não tem nenhuma", async () => {
    await runBoletoInstallmentSweep(new Date("2026-08-07T09:00:00.000Z"))

    // `evaluatePaceGate` dispensa o e-book de qualquer forma, então esquecer
    // este filtro não travaria ninguém por engano — só faria a varredura
    // carregar todo e-book parcelado da base toda noite para não fazer nada.
    expect(paceQuery().where.AND[1]).toEqual(PACE_GATED_CONTENT_WHERE)
  })

  it("recolhe as travadas, as que já andaram e as que ainda não têm teto", async () => {
    await runBoletoInstallmentSweep(new Date("2026-08-07T09:00:00.000Z"))

    expect(paceQuery().where.AND[2].OR).toEqual([
      { paceBlockedAt: { not: null } },
      { paceExemptAt: null, progressPercent: { gt: 0 } },
      // Sem esta, a venda parcelada que ainda não andou (e a que teve o envio
      // ao LMS falho) ficava com o curso inteiro liberado até o aluno passar
      // da cota — tarde demais.
      { paceExemptAt: null, paceAppliedPercent: null },
    ])
  })

  it("conta como reconciliada só a matrícula que mudou de estado", async () => {
    p.enrollment.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }])
    paceMock
      .mockResolvedValueOnce({ changed: true })
      .mockResolvedValueOnce({ changed: false })

    const out = await runBoletoInstallmentSweep(new Date("2026-08-07T09:00:00.000Z"))

    expect(paceMock).toHaveBeenCalledTimes(2)
    expect(out.paceReconciled).toBe(1)
  })
})
