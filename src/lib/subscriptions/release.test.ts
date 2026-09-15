import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Liberação sob demanda de um curso do plano.
 *
 * Invariantes que este arquivo trava:
 * - uma matrícula CANCELADA teve o curso REVOGADO na fornecedora. Reativar só o
 *   status local devolvia um card "Continuar" que abre um curso onde o aluno não
 *   está mais matriculado;
 * - a assinatura tem no máximo SUBSCRIPTION_MAX_ACTIVE_COURSES cursos em
 *   andamento, e a troca nunca deixa o aluno sem o curso que ele tirou quando o
 *   novo não abre.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentSubscription: { findUnique: vi.fn() },
    course: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    enrollment: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    tenant: { findUniqueOrThrow: vi.fn() },
  },
}))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: vi.fn(() => 1n),
  // Executa o corpo direto: o lock em si é testado no fulfill.
  withAdvisoryLock: async (_k: bigint, fn: () => Promise<void>) => {
    await fn()
    return true
  },
  provisionCourseForStudent: vi.fn(async () => ({
    lmsEnrollmentId: "lms_new",
    lmsOrigin: "own",
    lmsPlayback: "local",
    lmsLogin: "l",
    lmsSenha: "s",
    lmsPortalUrl: null,
  })),
}))
vi.mock("@/lib/students/plataforma-actions", () => ({
  unlinkCourseFromStudent: vi.fn(async () => undefined),
}))
vi.mock("@/lib/students/progress", () => ({
  checkEaCourseStarted: vi.fn(async () => "not_started"),
}))
vi.mock("@/lib/pmb-config", () => ({
  pmbPlataformaPolo: () => "__pmb__",
  pmbPlataformaVendedorId: () => "1",
}))
vi.mock("./plans", () => ({ planIncludesCourse: vi.fn(async () => true) }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { prisma } from "@/lib/prisma"
import { advisoryLockKeyFrom, provisionCourseForStudent } from "@/lib/enrollment/fulfill"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import { checkEaCourseStarted } from "@/lib/students/progress"
import { planIncludesCourse } from "./plans"
import {
  adoptIntoLiveSubscription,
  releaseSubscriptionCourse,
  releaseSubscriptionSlot,
} from "./release"
import { SUBSCRIPTION_MAX_ACTIVE_COURSES } from "./slots"

type Mock = ReturnType<typeof vi.fn>
const findSub = prisma.studentSubscription.findUnique as unknown as Mock
const findCourse = prisma.course.findUnique as unknown as Mock
const findCourseOrThrow = prisma.course.findUniqueOrThrow as unknown as Mock
const findEnr = prisma.enrollment.findFirst as unknown as Mock
const findEnrOrThrow = prisma.enrollment.findFirstOrThrow as unknown as Mock
const createEnr = prisma.enrollment.create as unknown as Mock
const updateEnr = prisma.enrollment.update as unknown as Mock
const countEnr = prisma.enrollment.count as unknown as Mock
const provision = provisionCourseForStudent as unknown as Mock
const unlink = unlinkCourseFromStudent as unknown as Mock
const includes = planIncludesCourse as unknown as Mock
const eaStarted = checkEaCourseStarted as unknown as Mock
const lockKey = advisoryLockKeyFrom as unknown as Mock

const future = new Date(Date.now() + 30 * 864e5)
const FULL = SUBSCRIPTION_MAX_ACTIVE_COURSES

/** Matrícula existente no formato que o release lê. */
function existing(over: Record<string, unknown> = {}) {
  return {
    id: "e1",
    status: "CANCELLED",
    progressStatus: null,
    studentSubscriptionId: "sub_1",
    cancelledAt: null,
    subscriptionSlotReleasedAt: null,
    ...over,
  }
}

/**
 * `findFirst` responde por curso: a busca da matrícula do curso pedido (sem
 * `studentSubscriptionId` no where) e a do curso a tirar da lista (com ele).
 */
function enrollmentsByCourse(map: Record<string, unknown>) {
  findEnr.mockImplementation(async ({ where }: { where: { courseId: string } }) => {
    return map[where.courseId] ?? null
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  findSub.mockResolvedValue({
    id: "sub_1",
    studentId: "st_1",
    tenantId: null,
    status: "ACTIVE",
    currentPeriodEnd: future,
    interval: "MONTHLY",
    plan: { scope: "ALL", categoryIds: [], courseIds: [], packageId: null },
    student: { id: "st_1", nome: "Aluno", email: "a@x.com" },
  })
  findCourse.mockResolvedValue({
    id: "c1",
    nome: "Curso",
    provider: "LMS",
    lmsCourseId: "lms_c1",
  })
  findEnr.mockResolvedValue(null)
  createEnr.mockResolvedValue({ id: "e_new" })
  countEnr.mockResolvedValue(0)
  includes.mockResolvedValue(true)
  eaStarted.mockResolvedValue("not_started")
})

describe("releaseSubscriptionCourse", () => {
  it("cria a matricula e provisiona na fornecedora", async () => {
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r).toEqual({ ok: true, enrollmentId: "e_new", created: true })
    expect(provision).toHaveBeenCalledTimes(1)
  })

  it("matricula ja ATIVA e reusada sem tocar na fornecedora", async () => {
    findEnr.mockResolvedValue(existing({ status: "ACTIVE" }))
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r).toEqual({ ok: true, enrollmentId: "e1", created: false })
    expect(provision).not.toHaveBeenCalled()
  })

  it("matricula CANCELADA e REPROVISIONADA, nao so reativada no banco", async () => {
    // O defeito: religar só o status devolvia "Continuar" para um curso onde o
    // aluno não está mais matriculado na fornecedora.
    findEnr.mockResolvedValue(existing())
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(provision).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ ok: true, enrollmentId: "e1", created: false })

    const data = updateEnr.mock.calls[0][0].data
    expect(data.status).toBe("ACTIVE")
    // "Retomar" limpa a marca de fora da lista.
    expect(data.subscriptionSlotReleasedAt).toBeNull()
    // As credenciais novas do provedor precisam substituir as revogadas.
    expect(data.lmsEnrollmentId).toBe("lms_new")
  })

  it("religacao usa chave de idempotencia DIFERENTE da 1a matricula", async () => {
    // Reusar a chave faria o LMS devolver a matrícula REVOGADA em vez de criar
    // uma nova — o aluno seguiria sem acesso.
    findEnr.mockResolvedValue(existing())
    await releaseSubscriptionCourse("sub_1", "c1")
    const key = provision.mock.calls[0][3]
    expect(key).toContain("reactivate")
  })

  it("cada volta a lista usa uma chave propria", async () => {
    // Um curso que sai e volta da lista várias vezes não pode reusar a resposta
    // da primeira volta.
    findEnr.mockResolvedValue(existing({ subscriptionSlotReleasedAt: new Date(1000) }))
    await releaseSubscriptionCourse("sub_1", "c1")
    findEnr.mockResolvedValue(existing({ subscriptionSlotReleasedAt: new Date(2000) }))
    await releaseSubscriptionCourse("sub_1", "c1")
    expect(provision.mock.calls[0][3]).not.toBe(provision.mock.calls[1][3])
  })

  it("curso fora do plano e recusado", async () => {
    includes.mockResolvedValue(false)
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r).toEqual({ ok: false, reason: "COURSE_NOT_IN_PLAN" })
    expect(provision).not.toHaveBeenCalled()
  })

  it("assinatura sem acesso vivo e recusada antes de qualquer IO", async () => {
    findSub.mockResolvedValue({
      id: "sub_1",
      studentId: "st_1",
      tenantId: null,
      status: "CANCELLED",
      currentPeriodEnd: future,
      interval: "MONTHLY",
      plan: { scope: "ALL", categoryIds: [], courseIds: [], packageId: null },
      student: { id: "st_1", nome: "Aluno", email: "a@x.com" },
    })
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r).toEqual({ ok: false, reason: "SUBSCRIPTION_INACTIVE" })
    expect(includes).not.toHaveBeenCalled()
  })

  it("o lock e da ASSINATURA, nao de (aluno, curso)", async () => {
    // Dois cliques em cursos DIFERENTES com a lista em 9 leriam "9 ocupadas" ao
    // mesmo tempo e o aluno terminaria com 11.
    await releaseSubscriptionCourse("sub_1", "c1")
    expect(lockKey).toHaveBeenCalledWith("SUBSCRIPTION_RELEASE:sub_1")
  })
})

describe("releaseSubscriptionCourse · vagas", () => {
  it("lista cheia sem dizer qual sai: recusa sem tocar na fornecedora", async () => {
    countEnr.mockResolvedValue(FULL)
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r).toEqual({ ok: false, reason: "SLOTS_FULL" })
    expect(provision).not.toHaveBeenCalled()
    expect(unlink).not.toHaveBeenCalled()
  })

  it("com uma vaga sobrando, abre normalmente", async () => {
    countEnr.mockResolvedValue(FULL - 1)
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r.ok).toBe(true)
  })

  it("troca: revoga o que sai, marca como fora da lista e so entao abre o outro", async () => {
    countEnr.mockResolvedValue(FULL)
    enrollmentsByCourse({
      c_old: {
        id: "e_old",
        courseId: "c_old",
        status: "ACTIVE",
        progressStatus: "EM_ANDAMENTO",
        course: { provider: "LMS" },
      },
    })

    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_old" })

    expect(r).toEqual({ ok: true, enrollmentId: "e_new", created: true })
    expect(unlink).toHaveBeenCalledWith("st_1", "c_old")
    const marked = updateEnr.mock.calls[0][0]
    expect(marked.where).toEqual({ id: "e_old" })
    expect(marked.data.status).toBe("CANCELLED")
    expect(marked.data.subscriptionSlotReleasedAt).toBeInstanceOf(Date)
    // Ordem: a vaga só é considerada livre DEPOIS da revogação.
    expect(unlink.mock.invocationCallOrder[0]).toBeLessThan(
      provision.mock.invocationCallOrder[0],
    )
  })

  it("com vaga livre o substituto e IGNORADO — ninguem perde curso a toa", async () => {
    countEnr.mockResolvedValue(3)
    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_old" })
    expect(r.ok).toBe(true)
    expect(unlink).not.toHaveBeenCalled()
  })

  it("curso da plataforma legada JA COMECADO nao sai da lista (la revogar apaga o progresso)", async () => {
    countEnr.mockResolvedValue(FULL)
    enrollmentsByCourse({
      c_ea: {
        id: "e_ea",
        courseId: "c_ea",
        status: "ACTIVE",
        progressStatus: "EM_ANDAMENTO",
        progressPercent: 20,
        course: { provider: "EA" },
      },
    })
    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_ea" })
    expect(r).toEqual({ ok: false, reason: "SLOT_NOT_RELEASABLE" })
    expect(unlink).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
  })

  it("curso da plataforma legada NAO COMECADO sai na troca, depois de conferir ao vivo", async () => {
    countEnr.mockResolvedValue(FULL)
    enrollmentsByCourse({
      c_ea: {
        id: "e_ea",
        courseId: "c_ea",
        status: "ACTIVE",
        progressStatus: "AGUARDANDO",
        progressPercent: 0,
        course: { provider: "EA" },
      },
    })
    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_ea" })
    expect(r).toEqual({ ok: true, enrollmentId: "e_new", created: true })
    expect(eaStarted).toHaveBeenCalledWith("e_ea")
    expect(unlink).toHaveBeenCalledWith("st_1", "c_ea")
    // A conferência vem ANTES do desvincular — é ela que protege o progresso.
    expect(eaStarted.mock.invocationCallOrder[0]).toBeLessThan(
      unlink.mock.invocationCallOrder[0],
    )
  })

  it("curso da plataforma legada: plataforma diz que ja comecou, mesmo com 0% aqui — nao sai", async () => {
    // A legada nao tem webhook: o banco pode dizer 0% de quem assistiu ontem.
    countEnr.mockResolvedValue(FULL)
    enrollmentsByCourse({
      c_ea: {
        id: "e_ea",
        courseId: "c_ea",
        status: "ACTIVE",
        progressStatus: "AGUARDANDO",
        progressPercent: 0,
        course: { provider: "EA" },
      },
    })
    eaStarted.mockResolvedValue("started")
    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_ea" })
    expect(r).toEqual({ ok: false, reason: "SLOT_NOT_RELEASABLE" })
    expect(unlink).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
  })

  it("curso da plataforma legada: sem conseguir conferir, NAO desvincula (fail-closed)", async () => {
    countEnr.mockResolvedValue(FULL)
    enrollmentsByCourse({
      c_ea: {
        id: "e_ea",
        courseId: "c_ea",
        status: "ACTIVE",
        progressStatus: null,
        progressPercent: 0,
        course: { provider: "EA" },
      },
    })
    eaStarted.mockResolvedValue("unknown")
    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_ea" })
    expect(r).toEqual({ ok: false, reason: "SLOT_NOT_RELEASABLE" })
    expect(unlink).not.toHaveBeenCalled()
  })

  it("curso da plataforma propria nao precisa de conferencia ao vivo", async () => {
    countEnr.mockResolvedValue(FULL)
    enrollmentsByCourse({
      c_old: {
        id: "e_old",
        courseId: "c_old",
        status: "ACTIVE",
        progressStatus: "EM_ANDAMENTO",
        progressPercent: 80,
        course: { provider: "LMS" },
      },
    })
    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_old" })
    expect(r.ok).toBe(true)
    expect(eaStarted).not.toHaveBeenCalled()
  })

  it("trocar o curso por ele mesmo nao e troca", async () => {
    countEnr.mockResolvedValue(FULL)
    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c1" })
    expect(r).toEqual({ ok: false, reason: "SLOTS_FULL" })
    expect(unlink).not.toHaveBeenCalled()
  })

  it("retomar um curso JA CONCLUIDO nao ocupa vaga, mesmo com a lista cheia", async () => {
    countEnr.mockResolvedValue(FULL)
    findEnr.mockResolvedValue(existing({ progressStatus: "CONCLUIDO" }))
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r.ok).toBe(true)
    expect(countEnr).not.toHaveBeenCalled()
  })

  it("matricula que JA ocupa vaga desta assinatura nao conta duas vezes", async () => {
    // Suspensa por inadimplência volta a ATIVA sem pedir vaga nova.
    countEnr.mockResolvedValue(FULL)
    findEnr.mockResolvedValue(existing({ status: "SUSPENDED" }))
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r.ok).toBe(true)
  })

  it("se a revogacao falha, nada muda: sem marca, sem abrir o outro", async () => {
    countEnr.mockResolvedValue(FULL)
    enrollmentsByCourse({
      c_old: {
        id: "e_old",
        courseId: "c_old",
        status: "ACTIVE",
        progressStatus: null,
        course: { provider: "LMS" },
      },
    })
    unlink.mockRejectedValueOnce(new Error("LMS 503"))

    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_old" })

    expect(r).toEqual({ ok: false, reason: "PROVIDER_FAILED" })
    expect(updateEnr).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
  })

  it("se o curso novo nao abre, o que saiu VOLTA para a lista", async () => {
    // O aluno pediu para TROCAR, não para perder um curso.
    countEnr.mockResolvedValue(FULL)
    const old = {
      id: "e_old",
      courseId: "c_old",
      status: "ACTIVE",
      progressStatus: null,
      course: { provider: "LMS" },
    }
    enrollmentsByCourse({ c_old: old })
    provision.mockRejectedValueOnce(new Error("LMS 500"))
    findCourseOrThrow.mockResolvedValue({
      id: "c_old",
      nome: "Antigo",
      provider: "LMS",
      lmsCourseId: "lms_old",
    })
    findEnrOrThrow.mockResolvedValue(
      existing({ id: "e_old", subscriptionSlotReleasedAt: new Date() }),
    )

    const r = await releaseSubscriptionCourse("sub_1", "c1", { replaceCourseId: "c_old" })

    expect(r).toEqual({ ok: false, reason: "PROVIDER_FAILED" })
    // 1a chamada: o curso novo (falhou). 2a: a devolução do que saiu.
    expect(provision).toHaveBeenCalledTimes(2)
    expect(provision.mock.calls[1][2]).toMatchObject({ id: "c_old" })
    const restored = updateEnr.mock.calls.at(-1)?.[0]
    expect(restored.where).toEqual({ id: "e_old" })
    expect(restored.data.status).toBe("ACTIVE")
  })
})

describe("releaseSubscriptionSlot (tirar da lista)", () => {
  it("revoga na plataforma e marca a matricula como fora da lista", async () => {
    findEnr.mockResolvedValue({
      id: "e_old",
      courseId: "c_old",
      status: "ACTIVE",
      progressStatus: "EM_ANDAMENTO",
      course: { provider: "LMS" },
    })
    const r = await releaseSubscriptionSlot("sub_1", "c_old")
    expect(r).toEqual({ ok: true })
    expect(unlink).toHaveBeenCalledWith("st_1", "c_old")
    expect(updateEnr.mock.calls[0][0].data.subscriptionSlotReleasedAt).toBeInstanceOf(Date)
  })

  it("so alcanca matricula DESTA assinatura", async () => {
    await releaseSubscriptionSlot("sub_1", "c_old")
    expect(findEnr.mock.calls[0][0].where).toMatchObject({
      studentSubscriptionId: "sub_1",
      studentId: "st_1",
    })
  })

  it("curso concluido nao ocupa vaga, entao nao ha o que tirar", async () => {
    findEnr.mockResolvedValue({
      id: "e_done",
      courseId: "c_done",
      status: "ACTIVE",
      progressStatus: "CONCLUIDO",
      course: { provider: "LMS" },
    })
    const r = await releaseSubscriptionSlot("sub_1", "c_done")
    expect(r).toEqual({ ok: false, reason: "SLOT_NOT_RELEASABLE" })
    expect(unlink).not.toHaveBeenCalled()
  })

  it("assinatura sem acesso vivo nao mexe na lista", async () => {
    findSub.mockResolvedValue(null)
    const r = await releaseSubscriptionSlot("sub_1", "c_old")
    expect(r).toEqual({ ok: false, reason: "SUBSCRIPTION_INACTIVE" })
  })
})

describe("adoptIntoLiveSubscription (voltou a assinar antes do fim do periodo)", () => {
  function enr(id: string, courseId: string, progressStatus: string | null = null) {
    return { id, courseId, status: "ACTIVE" as const, progressStatus }
  }

  it("migra para a assinatura viva o que o plano dela cobre", async () => {
    countEnr.mockResolvedValue(0)
    const r = await adoptIntoLiveSubscription("sub_1", [enr("e1", "c1")])
    expect(r).toEqual({ adopted: ["e1"] })
    expect(updateEnr).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { studentSubscriptionId: "sub_1" },
    })
  })

  it("curso fora do plano novo nao migra", async () => {
    countEnr.mockResolvedValue(0)
    includes.mockResolvedValue(false)
    const r = await adoptIntoLiveSubscription("sub_1", [enr("e1", "c1")])
    expect(r).toEqual({ adopted: [] })
    expect(updateEnr).not.toHaveBeenCalled()
  })

  it("respeita as vagas: migrar tudo seria o atalho para 20 cursos abertos", async () => {
    countEnr.mockResolvedValue(FULL - 1)
    const r = await adoptIntoLiveSubscription("sub_1", [enr("e1", "c1"), enr("e2", "c2")])
    expect(r?.adopted).toHaveLength(1)
  })

  it("concluido migra mesmo com a lista cheia (nao ocupa vaga)", async () => {
    countEnr.mockResolvedValue(FULL)
    const r = await adoptIntoLiveSubscription("sub_1", [
      enr("e1", "c1"),
      enr("e2", "c2", "CONCLUIDO"),
    ])
    expect(r).toEqual({ adopted: ["e2"] })
  })

  it("assinatura 'viva' que nao da mais acesso nao adota nada", async () => {
    findSub.mockResolvedValue(null)
    const r = await adoptIntoLiveSubscription("sub_1", [enr("e1", "c1")])
    expect(r).toEqual({ adopted: [] })
  })
})
