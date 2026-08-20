import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Liberação sob demanda de um curso do plano.
 *
 * A invariante que este arquivo trava: uma matrícula CANCELADA teve o curso
 * REVOGADO na fornecedora. Reativar só o status local devolvia um card
 * "Continuar" que abre um curso onde o aluno não está mais matriculado.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentSubscription: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    tenant: { findUniqueOrThrow: vi.fn() },
  },
}))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: () => 1n,
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
import { provisionCourseForStudent } from "@/lib/enrollment/fulfill"
import { planIncludesCourse } from "./plans"
import { releaseSubscriptionCourse } from "./release"

const findSub = prisma.studentSubscription.findUnique as unknown as ReturnType<typeof vi.fn>
const findCourse = prisma.course.findUnique as unknown as ReturnType<typeof vi.fn>
const findEnr = prisma.enrollment.findFirst as unknown as ReturnType<typeof vi.fn>
const createEnr = prisma.enrollment.create as unknown as ReturnType<typeof vi.fn>
const updateEnr = prisma.enrollment.update as unknown as ReturnType<typeof vi.fn>
const provision = provisionCourseForStudent as unknown as ReturnType<typeof vi.fn>
const includes = planIncludesCourse as unknown as ReturnType<typeof vi.fn>

const future = new Date(Date.now() + 30 * 864e5)

beforeEach(() => {
  vi.clearAllMocks()
  findSub.mockResolvedValue({
    id: "sub_1",
    studentId: "st_1",
    tenantId: null,
    status: "ACTIVE",
    currentPeriodEnd: future,
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
  includes.mockResolvedValue(true)
})

describe("releaseSubscriptionCourse", () => {
  it("cria a matricula e provisiona na fornecedora", async () => {
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r).toEqual({ ok: true, enrollmentId: "e_new", created: true })
    expect(provision).toHaveBeenCalledTimes(1)
  })

  it("matricula ja ATIVA e reusada sem tocar na fornecedora", async () => {
    findEnr.mockResolvedValue({ id: "e1", status: "ACTIVE" })
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r).toEqual({ ok: true, enrollmentId: "e1", created: false })
    expect(provision).not.toHaveBeenCalled()
  })

  it("matricula CANCELADA e REPROVISIONADA, nao so reativada no banco", async () => {
    // O defeito: religar só o status devolvia "Continuar" para um curso onde o
    // aluno não está mais matriculado na fornecedora.
    findEnr.mockResolvedValue({ id: "e1", status: "CANCELLED" })
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(provision).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ ok: true, enrollmentId: "e1", created: false })

    const data = updateEnr.mock.calls[0][0].data
    expect(data.status).toBe("ACTIVE")
    // As credenciais novas do provedor precisam substituir as revogadas.
    expect(data.lmsEnrollmentId).toBe("lms_new")
  })

  it("religacao usa chave de idempotencia DIFERENTE da 1a matricula", async () => {
    // Reusar a chave faria o LMS devolver a matrícula REVOGADA em vez de criar
    // uma nova — o aluno seguiria sem acesso.
    findEnr.mockResolvedValue({ id: "e1", status: "CANCELLED" })
    await releaseSubscriptionCourse("sub_1", "c1")
    const key = provision.mock.calls[0][3]
    expect(key).toContain("reactivate")
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
      plan: { scope: "ALL", categoryIds: [], courseIds: [], packageId: null },
      student: { id: "st_1", nome: "Aluno", email: "a@x.com" },
    })
    const r = await releaseSubscriptionCourse("sub_1", "c1")
    expect(r).toEqual({ ok: false, reason: "SUBSCRIPTION_INACTIVE" })
    expect(includes).not.toHaveBeenCalled()
  })
})
