import { describe, it, expect, vi, beforeEach } from "vitest"

// Motor da cota de aulas. O que precisa ser provado:
//  (a) trava AO ATINGIR a fatia paga e libera quando uma parcela nova entra;
//  (b) é IDEMPOTENTE — só chama EA/LMS na transição, não a cada varredura;
//  (c) a política de colateral: o status da plataforma é por LOGIN, então não
//      podemos cortar o acesso de quem tem outro curso liberado no mesmo login;
//  (d) desligar o interruptor SOLTA quem já estava travado;
//  (e) falha da plataforma não pode deixar o aluno destravado localmente.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))
vi.mock("@/lib/students/plataforma-actions", () => ({
  findPersonStudentIds: vi.fn(),
  setStudentPaceBlock: vi.fn(),
}))
vi.mock("./pace-settings", () => ({ resolvePaceGateSettings: vi.fn() }))
// LMS desligado por padrão: os testes da EA seguem exercitando o corte por aluno.
// Os testes do teto por matrícula ligam explicitamente.
vi.mock("@/lib/lms", () => ({
  isLmsConfigured: vi.fn(() => false),
  setLmsEnrollmentLimit: vi.fn(async () => undefined),
}))
vi.mock("@/lib/tenant/urls", () => ({ appUrl: () => "https://pmb.test" }))
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import {
  findPersonStudentIds,
  setStudentPaceBlock,
} from "@/lib/students/plataforma-actions"
import { resolvePaceGateSettings } from "./pace-settings"
import { isLmsConfigured, setLmsEnrollmentLimit } from "@/lib/lms"
import {
  evaluatePaceGate,
  releaseStudentPaceIfClear,
  clearPaceFlags,
} from "./pace"

const p = prisma as unknown as {
  enrollment: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}
const personIdsMock = findPersonStudentIds as unknown as ReturnType<typeof vi.fn>
const setBlockMock = setStudentPaceBlock as unknown as ReturnType<typeof vi.fn>
const settingsMock = resolvePaceGateSettings as unknown as ReturnType<typeof vi.fn>
const lmsConfiguredMock = isLmsConfigured as unknown as ReturnType<typeof vi.fn>
const lmsLimitMock = setLmsEnrollmentLimit as unknown as ReturnType<typeof vi.fn>

/** Matrícula de carnê: `paid` de `total` pagas, `progress`% assistido. */
function carne(paid: number, total: number, progress: number, extra = {}) {
  return {
    id: "e1",
    tenantId: "t1",
    studentId: "s1",
    status: "ACTIVE",
    paymentType: "BOLETO_INSTALLMENT",
    installmentsPaid: paid,
    installmentsTotal: total,
    progressPercent: progress,
    paceBlockedAt: null,
    paceAppliedPercent: null,
    paceExemptAt: null,
    lmsEnrollmentId: null,
    course: { nome: "Eletricista" },
    student: { nome: "Maria", status: "ATIVO" },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  settingsMock.mockResolvedValue({ enabled: true, strict: false })
  personIdsMock.mockResolvedValue(["s1"])
  setBlockMock.mockResolvedValue(true)
  p.enrollment.findMany.mockResolvedValue([])
  p.enrollment.update.mockResolvedValue({})
  p.enrollment.updateMany.mockResolvedValue({ count: 0 })
  lmsConfiguredMock.mockReturnValue(false)
  lmsLimitMock.mockResolvedValue(undefined)
})

describe("evaluatePaceGate — teto por matrícula no LMS", () => {
  // O LMS aceita cota POR MATRÍCULA (PATCH /enrollments/:id/limit). É exato e
  // não tem o colateral do status da EA, que é por login e derrubaria os outros
  // cursos da pessoa — por isso este caminho ignora a política de colateral.
  beforeEach(() => {
    lmsConfiguredMock.mockReturnValue(true)
  })

  it("manda o teto ao LMS e NÃO corta o aluno inteiro", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 2, 50, { lmsEnrollmentId: "lms_enr_1" }),
    )

    const out = await evaluatePaceGate("e1")

    expect(lmsLimitMock).toHaveBeenCalledWith(
      "lms_enr_1",
      50,
      expect.objectContaining({ reason: "installment" }),
    )
    expect(setBlockMock).not.toHaveBeenCalled()
    expect(out).toMatchObject({ blocked: true, platformApplied: true })
  })

  it("não consulta a política de colateral — o teto não tem colateral", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 2, 50, { lmsEnrollmentId: "lms_enr_1" }),
    )

    await evaluatePaceGate("e1")

    expect(p.enrollment.findMany).not.toHaveBeenCalled()
  })

  it("quitado REMOVE o teto (null), não apenas amplia", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      carne(2, 2, 60, {
        lmsEnrollmentId: "lms_enr_1",
        paceBlockedAt: new Date(),
        paceAppliedPercent: 50,
        student: { nome: "Maria", status: "DEVEDOR" },
      }),
    )

    await evaluatePaceGate("e1")

    expect(lmsLimitMock).toHaveBeenCalledWith("lms_enr_1", null, expect.anything())
  })

  it("parcela nova amplia o teto mesmo sem destravar", async () => {
    // 2 de 6 pagas = 33%, mas o aluno já assistiu 50%: segue travado — e ainda
    // assim o teto no LMS precisa subir, senão ele pagou e continuaria preso.
    p.enrollment.findUnique.mockResolvedValue(
      carne(2, 6, 50, {
        lmsEnrollmentId: "lms_enr_1",
        paceBlockedAt: new Date(),
        paceAppliedPercent: 16,
        student: { nome: "Maria", status: "DEVEDOR" },
      }),
    )

    await evaluatePaceGate("e1")

    expect(lmsLimitMock).toHaveBeenCalledWith("lms_enr_1", 33, expect.anything())
  })

  it("LMS fora do ar cai no corte por aluno (fail-closed)", async () => {
    lmsLimitMock.mockRejectedValue(new Error("LMS 502"))
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 2, 50, { lmsEnrollmentId: "lms_enr_1" }),
    )

    const out = await evaluatePaceGate("e1")

    expect(setBlockMock).toHaveBeenCalledWith("s1", true)
    expect(out).toMatchObject({ blocked: true })
  })

  it("sem LMS configurado, nem tenta — usa o caminho da EA", async () => {
    lmsConfiguredMock.mockReturnValue(false)
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 2, 50, { lmsEnrollmentId: "lms_enr_1" }),
    )

    await evaluatePaceGate("e1")

    expect(lmsLimitMock).not.toHaveBeenCalled()
    expect(setBlockMock).toHaveBeenCalledWith("s1", true)
  })
})

describe("evaluatePaceGate — travar", () => {
  it("trava ao ATINGIR a cota (2x, 1 paga = 50%)", async () => {
    p.enrollment.findUnique.mockResolvedValue(carne(1, 2, 50))

    const out = await evaluatePaceGate("e1")

    expect(out).toMatchObject({ blocked: true, changed: true, allowedPercent: 50 })
    expect(setBlockMock).toHaveBeenCalledWith("s1", true)
    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paceAppliedPercent: 50 }),
      }),
    )
  })

  it("não trava quem ainda está abaixo da cota", async () => {
    p.enrollment.findUnique.mockResolvedValue(carne(1, 2, 49))

    const out = await evaluatePaceGate("e1")

    expect(out).toMatchObject({ blocked: false, changed: false })
    expect(setBlockMock).not.toHaveBeenCalled()
  })

  it("é idempotente — já travado não rechama a plataforma", async () => {
    // Estado coerente de um aluno já travado: DEVEDOR na plataforma.
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 2, 70, {
        paceBlockedAt: new Date(),
        paceAppliedPercent: 50,
        student: { nome: "Maria", status: "DEVEDOR" },
      }),
    )

    const out = await evaluatePaceGate("e1")

    expect(out?.changed).toBe(false)
    expect(setBlockMock).not.toHaveBeenCalled()
  })

  it("REAPLICA o corte quando outro fluxo devolveu o acesso (deriva)", async () => {
    // `Student.status` tem vários donos: auto-unblock do tenant que voltou a
    // pagar, desbloqueio manual, reativação ao vincular curso novo. Se um deles
    // devolve ATIVO a um aluno que continua travado pela cota e nada reaplica o
    // corte, ele assiste o que não pagou — sem transição, o motor era cego.
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 2, 70, {
        paceBlockedAt: new Date(),
        paceAppliedPercent: 50,
        student: { nome: "Maria", status: "ATIVO" },
      }),
    )

    const out = await evaluatePaceGate("e1")

    expect(setBlockMock).toHaveBeenCalledWith("s1", true)
    expect(out).toMatchObject({ blocked: true, platformApplied: true })
  })

  it("não reaplica por cima da trava de inadimplência (BLOQUEADO)", async () => {
    // BLOQUEADO pertence à trava mais forte; rebaixar para DEVEDOR seria afrouxar.
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 2, 70, {
        paceBlockedAt: new Date(),
        paceAppliedPercent: 50,
        student: { nome: "Maria", status: "BLOQUEADO" },
      }),
    )

    await evaluatePaceGate("e1")

    expect(setBlockMock).not.toHaveBeenCalled()
  })

  it("marca localmente mesmo se o corte na plataforma falhar", async () => {
    // Deixar a matrícula destravada porque a EA caiu seria pior: a trava de
    // certificado depende da marca local, e a varredura diária re-tenta o corte.
    p.enrollment.findUnique.mockResolvedValue(carne(1, 2, 50))
    setBlockMock.mockRejectedValue(new Error("EA fora do ar"))

    const out = await evaluatePaceGate("e1")

    expect(out).toMatchObject({ blocked: true, changed: true, platformApplied: false })
    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paceBlockedAt: expect.any(Date) }),
      }),
    )
  })
})

describe("evaluatePaceGate — política de colateral na plataforma", () => {
  it("NÃO corta o acesso quando o login tem outro curso liberado", async () => {
    // O status da EA é por login: cortar aqui derrubaria um curso já pago.
    p.enrollment.findUnique.mockResolvedValue(carne(1, 2, 50))
    p.enrollment.findMany.mockResolvedValue([
      { ...carne(1, 1, 90, { id: "e2" }), paymentType: "ONE_TIME" },
    ])

    const out = await evaluatePaceGate("e1")

    // A matrícula fica travada localmente (UI + certificado), mas o aluno não
    // perde o acesso à plataforma.
    expect(out).toMatchObject({ blocked: true, platformApplied: false })
    expect(setBlockMock).not.toHaveBeenCalled()
  })

  it("corta quando TODOS os cursos do login estão travados pela cota", async () => {
    p.enrollment.findUnique.mockResolvedValue(carne(1, 2, 50))
    p.enrollment.findMany.mockResolvedValue([carne(1, 4, 80, { id: "e2" })])

    await evaluatePaceGate("e1")

    expect(setBlockMock).toHaveBeenCalledWith("s1", true)
  })

  it("no modo estrito corta mesmo com outro curso liberado", async () => {
    settingsMock.mockResolvedValue({ enabled: true, strict: true })
    p.enrollment.findUnique.mockResolvedValue(carne(1, 2, 50))

    await evaluatePaceGate("e1")

    expect(setBlockMock).toHaveBeenCalledWith("s1", true)
    // Modo estrito nem consulta os irmãos.
    expect(p.enrollment.findMany).not.toHaveBeenCalled()
  })
})

describe("evaluatePaceGate — liberar", () => {
  it("libera quando uma parcela nova amplia a cota além do progresso", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      carne(2, 2, 60, { paceBlockedAt: new Date(), paceAppliedPercent: 50 }),
    )

    const out = await evaluatePaceGate("e1")

    expect(out).toMatchObject({ blocked: false, changed: true, allowedPercent: 100 })
    expect(setBlockMock).toHaveBeenCalledWith("s1", false)
  })

  it("continua travado se a nova cota ainda não passou o progresso", async () => {
    // 2 de 6 pagas = 33%, mas o aluno já assistiu 50% → segue travado.
    p.enrollment.findUnique.mockResolvedValue(
      carne(2, 6, 50, {
        paceBlockedAt: new Date(),
        paceAppliedPercent: 16,
        student: { nome: "Maria", status: "DEVEDOR" },
      }),
    )

    const out = await evaluatePaceGate("e1")

    expect(out).toMatchObject({ blocked: true, changed: false })
    expect(setBlockMock).not.toHaveBeenCalled()
    // A cota exibida acompanha o pagamento mesmo sem destravar.
    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paceAppliedPercent: 33 } }),
    )
  })

  it("desligar o interruptor SOLTA quem já estava travado", async () => {
    settingsMock.mockResolvedValue({ enabled: false, strict: false })
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 6, 90, { paceBlockedAt: new Date() }),
    )

    const out = await evaluatePaceGate("e1")

    expect(out).toMatchObject({ blocked: false, changed: true })
    expect(p.enrollment.updateMany).toHaveBeenCalled()
    expect(setBlockMock).toHaveBeenCalledWith("s1", false)
  })

  it("liberação manual (paceExemptAt) desarma a trava", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 6, 90, { paceBlockedAt: new Date(), paceExemptAt: new Date() }),
    )

    const out = await evaluatePaceGate("e1")

    expect(out).toMatchObject({ blocked: false, changed: true })
    expect(setBlockMock).toHaveBeenCalledWith("s1", false)
  })

  it("matrícula fora de operação limpa a marca e reavalia o aluno", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      carne(1, 6, 90, { status: "CANCELLED", paceBlockedAt: new Date() }),
    )

    expect(await evaluatePaceGate("e1")).toBeNull()
    expect(p.enrollment.updateMany).toHaveBeenCalled()
    expect(setBlockMock).toHaveBeenCalledWith("s1", false)
  })

  it("não avalia matrícula inexistente", async () => {
    p.enrollment.findUnique.mockResolvedValue(null)
    expect(await evaluatePaceGate("nope")).toBeNull()
  })

  it("NUNCA lança — falha na transição não derruba quem chamou", async () => {
    // Guarda o `await` em `return await applyBlock(...)`: sem ele a promise sai
    // do try sem ser aguardada e a rejeição escapa do catch, derrubando o sync
    // de progresso / o webhook de pagamento que invocou a avaliação.
    p.enrollment.findUnique.mockResolvedValue(carne(1, 2, 50))
    p.enrollment.update.mockRejectedValue(new Error("pooler caiu"))

    await expect(evaluatePaceGate("e1")).resolves.toBeNull()
  })
})

describe("releaseStudentPaceIfClear", () => {
  it("libera quando não sobrou matrícula viva", async () => {
    p.enrollment.findMany.mockResolvedValue([])

    expect(await releaseStudentPaceIfClear("s1")).toBe(true)
    expect(setBlockMock).toHaveBeenCalledWith("s1", false)
  })

  it("libera quando as matrículas vivas estão dentro da cota", async () => {
    p.enrollment.findMany.mockResolvedValue([carne(1, 2, 30)])

    expect(await releaseStudentPaceIfClear("s1")).toBe(true)
  })

  it("NÃO libera enquanto outra matrícula ainda estiver travada", async () => {
    p.enrollment.findMany.mockResolvedValue([carne(1, 2, 60, { id: "e2" })])

    expect(await releaseStudentPaceIfClear("s1")).toBe(false)
    expect(setBlockMock).not.toHaveBeenCalled()
  })

  it("ignora matrícula com liberação manual", async () => {
    p.enrollment.findMany.mockResolvedValue([
      carne(1, 2, 90, { paceExemptAt: new Date() }),
    ])

    expect(await releaseStudentPaceIfClear("s1")).toBe(true)
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
