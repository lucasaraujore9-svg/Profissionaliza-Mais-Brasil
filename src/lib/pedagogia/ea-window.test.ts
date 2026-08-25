import { describe, it, expect, vi, beforeEach } from "vitest"

/* JANELA DE HORARIO na fornecedora legada. O que precisa ser provado — todos os
   casos sao formas de DEVOLVER ACESSO INDEVIDO ou de CORTAR QUEM PAGOU, que sao
   os dois erros que esta camada pode cometer:

   (a) so trava quando NENHUM curso vivo da pessoa esta dentro da janela dele;
   (b) o login e compartilhado entre unidades — curso aberto em OUTRA unidade
       cancela o corte;
   (c) nao rebaixa quem ja esta sob trava mais forte;
   (d) ao liberar, se surgiu motivo mais forte no meio (unidade suspensa, cota),
       ENTREGA o aluno aquela camada em vez de devolver o acesso;
   (e) dryRun nao escreve nada. */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: vi.fn() },
    tenantCourse: { findMany: vi.fn() },
    enrollment: { findMany: vi.fn(), count: vi.fn() },
    student: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/students/plataforma-actions", () => ({
  findPersonStudentIds: vi.fn(),
  setStudentScheduleBlock: vi.fn(async () => true),
  releaseScheduleMarkKeepingBlock: vi.fn(async () => undefined),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}))

import { prisma } from "@/lib/prisma"
import {
  findPersonStudentIds,
  releaseScheduleMarkKeepingBlock,
  setStudentScheduleBlock,
} from "@/lib/students/plataforma-actions"
import { runScheduleWindowSweep } from "./ea-window"

const p = prisma as unknown as {
  tenant: { findMany: ReturnType<typeof vi.fn> }
  tenantCourse: { findMany: ReturnType<typeof vi.fn> }
  enrollment: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }
  student: { findUnique: ReturnType<typeof vi.fn> }
}
const setBlock = setStudentScheduleBlock as unknown as ReturnType<typeof vi.fn>
const handoff = releaseScheduleMarkKeepingBlock as unknown as ReturnType<typeof vi.fn>
const personIds = findPersonStudentIds as unknown as ReturnType<typeof vi.fn>

/** 2026-08-25, terca. 12:00 e 23:00 no relogio brasileiro. */
const ter12h = new Date("2026-08-25T15:00:00.000Z")
const ter23h = new Date("2026-08-26T02:00:00.000Z")

/** Comercial: seg-sex, 09:00-18:00. */
const COMERCIAL = { accessDays: [1, 2, 3, 4, 5], accessStartMin: 540, accessEndMin: 1080 }

function setup(opts: {
  tenants?: { id: string; pedagogyPolicy: unknown }[]
  overrides?: { tenantId: string; courseId: string; pedagogyPolicy: unknown }[]
  enrollments?: { studentId: string; tenantId: string; courseId: string }[]
  student?: Record<string, unknown>
  siblings?: unknown[]
  personSiblings?: string[]
  paceBlocked?: number
}) {
  p.tenant.findMany.mockResolvedValue(opts.tenants ?? [{ id: "t1", pedagogyPolicy: COMERCIAL }])
  p.tenantCourse.findMany.mockResolvedValue(opts.overrides ?? [])
  p.enrollment.findMany
    .mockResolvedValueOnce(opts.enrollments ?? [{ studentId: "s1", tenantId: "t1", courseId: "c1" }])
    .mockResolvedValue(opts.siblings ?? [])
  p.student.findUnique.mockResolvedValue(
    opts.student ?? {
      status: "ATIVO",
      scheduleBlockedAt: null,
      plataformaAlunoId: "999",
      tenant: { status: "ACTIVE" },
    },
  )
  p.enrollment.count.mockResolvedValue(opts.paceBlocked ?? 0)
  personIds.mockResolvedValue(opts.personSiblings ?? ["s1"])
}

beforeEach(() => {
  vi.clearAllMocks()
  p.enrollment.findMany.mockReset()
})

describe("runScheduleWindowSweep", () => {
  it("nenhuma unidade com politica: nao consulta matricula nenhuma", async () => {
    p.tenant.findMany.mockResolvedValue([])
    p.tenantCourse.findMany.mockResolvedValue([])
    const r = await runScheduleWindowSweep(ter23h)
    expect(r.avaliados).toBe(0)
    expect(p.enrollment.findMany).not.toHaveBeenCalled()
  })

  it("fora do horario: trava o aluno", async () => {
    setup({})
    const r = await runScheduleWindowSweep(ter23h)
    expect(setBlock).toHaveBeenCalledWith("s1", true)
    expect(r.bloqueados).toBe(1)
  })

  it("dentro do horario: nao mexe em ninguem", async () => {
    setup({})
    const r = await runScheduleWindowSweep(ter12h)
    expect(setBlock).not.toHaveBeenCalled()
    expect(r.bloqueados).toBe(0)
  })

  it("UM curso sem janela ja cancela o corte — o login e um so", async () => {
    // Duas matriculas na mesma pessoa: uma na unidade com horario, outra numa
    // unidade sem regra. Travar derrubaria a segunda junto.
    setup({
      tenants: [
        { id: "t1", pedagogyPolicy: COMERCIAL },
        { id: "t2", pedagogyPolicy: null },
      ],
      enrollments: [
        { studentId: "s1", tenantId: "t1", courseId: "c1" },
        { studentId: "s1", tenantId: "t2", courseId: "c2" },
      ],
    })
    await runScheduleWindowSweep(ter23h)
    expect(setBlock).not.toHaveBeenCalled()
  })

  it("curso aberto em OUTRA unidade da MESMA PESSOA cancela o corte", async () => {
    setup({
      personSiblings: ["s1", "s2"],
      siblings: [
        {
          tenantId: "t9",
          courseId: "c9",
          tenant: { pedagogyPolicy: null }, // sem janela = sempre aberto
          tenantCourse: null,
        },
      ],
    })
    await runScheduleWindowSweep(ter23h)
    expect(setBlock).not.toHaveBeenCalled()
  })

  it("nao rebaixa quem ja esta sob trava mais forte", async () => {
    setup({
      student: {
        status: "BLOQUEADO",
        scheduleBlockedAt: null, // travado por inadimplencia, nao por nos
        plataformaAlunoId: "999",
        tenant: { status: "ACTIVE" },
      },
    })
    await runScheduleWindowSweep(ter23h)
    expect(setBlock).not.toHaveBeenCalled()
  })

  it("dentro do horario, libera quem NOS travamos", async () => {
    setup({
      student: {
        status: "BLOQUEADO",
        scheduleBlockedAt: new Date("2026-08-24T22:00:00.000Z"),
        plataformaAlunoId: "999",
        tenant: { status: "ACTIVE" },
      },
    })
    const r = await runScheduleWindowSweep(ter12h)
    expect(setBlock).toHaveBeenCalledWith("s1", false)
    expect(r.liberados).toBe(1)
  })

  it("unidade SUSPENSA no meio: entrega a outra camada em vez de devolver acesso", async () => {
    // A corrida real: enquanto travado pelo relogio, a unidade fica inadimplente.
    // O sweep de inadimplencia PULA quem ja esta BLOQUEADO, entao ninguem mais
    // carimbaria — liberar aqui devolveria acesso de unidade suspensa.
    setup({
      student: {
        status: "BLOQUEADO",
        scheduleBlockedAt: new Date("2026-08-24T22:00:00.000Z"),
        plataformaAlunoId: "999",
        tenant: { status: "SUSPENDED" },
      },
    })
    const r = await runScheduleWindowSweep(ter12h)
    expect(setBlock).not.toHaveBeenCalled()
    expect(handoff).toHaveBeenCalledWith("s1")
    expect(r.entreguesAOutraCamada).toBe(1)
    expect(r.liberados).toBe(0)
  })

  it("cota de aulas ativa no meio tambem impede a devolucao do acesso", async () => {
    setup({
      student: {
        status: "BLOQUEADO",
        scheduleBlockedAt: new Date("2026-08-24T22:00:00.000Z"),
        plataformaAlunoId: "999",
        tenant: { status: "ACTIVE" },
      },
      paceBlocked: 1,
    })
    await runScheduleWindowSweep(ter12h)
    expect(setBlock).not.toHaveBeenCalled()
    expect(handoff).toHaveBeenCalledWith("s1")
  })

  it("aluno que nunca foi para a fornecedora legada e ignorado", async () => {
    setup({
      student: {
        status: "ATIVO",
        scheduleBlockedAt: null,
        plataformaAlunoId: null,
        tenant: { status: "ACTIVE" },
      },
    })
    await runScheduleWindowSweep(ter23h)
    expect(setBlock).not.toHaveBeenCalled()
  })

  it("dryRun conta o que faria e NAO escreve", async () => {
    setup({})
    const r = await runScheduleWindowSweep(ter23h, true)
    expect(r.bloqueados).toBe(1)
    expect(setBlock).not.toHaveBeenCalled()
    expect(handoff).not.toHaveBeenCalled()
  })

  it("override do curso pode REMOVER a janela de um curso da unidade", async () => {
    setup({
      overrides: [{ tenantId: "t1", courseId: "c1", pedagogyPolicy: { releaseMode: "FREE" } }],
    })
    await runScheduleWindowSweep(ter23h)
    expect(setBlock).not.toHaveBeenCalled()
  })
})
