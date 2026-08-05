import { describe, it, expect, vi, beforeEach } from "vitest"

// Cancelamento de matrícula: o inverso do fulfill. O que precisa ser provado
// aqui é (a) o ISOLAMENTO FINANCEIRO — uma venda de revenda tem que ser
// cancelada com a chave da conta DA UNIDADE, nunca com a da conta-mãe PMB
// (usar a errada devolve 404 e a cobrança do aluno seguiria viva) — e (b) que
// curso concluído não é cancelável, satélite de pacote acompanha a primária e
// falha de gateway não impede o cancelamento local.

vi.mock("@/lib/prisma", () => {
  const prisma = {
    enrollment: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    tenant: { findUnique: vi.fn() },
    boletoInstallment: { findMany: vi.fn(), update: vi.fn() },
  }
  return { prisma }
})

vi.mock("@/lib/asaas/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/asaas/client")>(
    "@/lib/asaas/client",
  )
  return {
    AsaasApiError: actual.AsaasApiError,
    motherAsaasKey: () => "MOTHER_ASAAS_KEY",
    decryptTenantAsaasKey: (s: string) => `dec(${s})`,
    cancelSubscription: vi.fn(),
    deletePayment: vi.fn(),
    deleteInstallment: vi.fn(),
  }
})

vi.mock("@/lib/mercadopago/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mercadopago/client")>(
    "@/lib/mercadopago/client",
  )
  return {
    MPApiError: actual.MPApiError,
    decryptTenantMpToken: (s: string) => `dec(${s})`,
    cancelPreapproval: vi.fn(),
    cancelPayment: vi.fn(),
  }
})

vi.mock("@/lib/pmb-config", () => ({ pmbMpAccessToken: async () => "PMB_MP_TOKEN" }))
vi.mock("@/lib/students/plataforma-actions", () => ({
  unlinkCourseFromStudent: vi.fn(),
}))
// Cota de aulas: o cancelamento precisa desarmar a trava (senão o aluno fica
// preso em DEVEDOR sem nada para reavaliá-lo). Mockado aqui para o teste de
// cancelamento não virar teste da cota — a lógica de release tem testes próprios.
vi.mock("@/lib/enrollment/pace", () => ({
  clearPaceFlags: vi.fn(),
  releaseStudentPaceIfClear: vi.fn(),
}))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import {
  cancelSubscription,
  deletePayment,
  deleteInstallment,
  AsaasApiError,
} from "@/lib/asaas/client"
import { cancelPreapproval, cancelPayment } from "@/lib/mercadopago/client"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import { clearPaceFlags, releaseStudentPaceIfClear } from "@/lib/enrollment/pace"
import { cancelEnrollment, isCancellableEnrollmentStatus } from "./cancel"

const p = prisma as unknown as {
  enrollment: {
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  tenant: { findUnique: ReturnType<typeof vi.fn> }
  boletoInstallment: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}
const cancelSubMock = cancelSubscription as unknown as ReturnType<typeof vi.fn>
const deletePaymentMock = deletePayment as unknown as ReturnType<typeof vi.fn>
const deleteInstallmentMock = deleteInstallment as unknown as ReturnType<typeof vi.fn>
const cancelPreapprovalMock = cancelPreapproval as unknown as ReturnType<typeof vi.fn>
const cancelPaymentMock = cancelPayment as unknown as ReturnType<typeof vi.fn>
const unlinkMock = unlinkCourseFromStudent as unknown as ReturnType<typeof vi.fn>
const clearPaceFlagsMock = clearPaceFlags as unknown as ReturnType<typeof vi.fn>
const releasePaceMock = releaseStudentPaceIfClear as unknown as ReturnType<typeof vi.fn>

const actor = { userId: "u1", role: "SUPER_ADMIN" }

function enrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    tenantId: "t1",
    studentId: "s1",
    courseId: "c1",
    status: "ACTIVE",
    gateway: "ASAAS",
    coursePackageId: null,
    packagePrimary: false,
    bundleCourseIds: [],
    asaasPaymentId: null,
    asaasSubscriptionId: null,
    asaasInstallmentId: null,
    mpPaymentId: null,
    mpSubscriptionId: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.enrollment.findMany.mockResolvedValue([])
  p.enrollment.update.mockResolvedValue({})
  p.boletoInstallment.findMany.mockResolvedValue([])
  p.boletoInstallment.update.mockResolvedValue({})
  p.tenant.findUnique.mockResolvedValue({
    asaasApiKey: "enc_tenant_asaas",
    mpAccessToken: "enc_tenant_mp",
  })
})

describe("isCancellableEnrollmentStatus", () => {
  it("aceita pendente de pagamento e curso não concluído", () => {
    for (const s of ["PENDING", "ACTIVE", "SUSPENDED"] as const) {
      expect(isCancellableEnrollmentStatus(s)).toBe(true)
    }
  })

  it("recusa concluído e já cancelado", () => {
    expect(isCancellableEnrollmentStatus("COMPLETED")).toBe(false)
    expect(isCancellableEnrollmentStatus("CANCELLED")).toBe(false)
  })
})

describe("cancelEnrollment — isolamento de gateway", () => {
  it("venda de REVENDA usa a chave Asaas da unidade, nunca a da conta-mãe", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ tenantId: "t1", gateway: "ASAAS", asaasSubscriptionId: "sub_1" }),
    )

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(cancelSubMock).toHaveBeenCalledWith("sub_1", "dec(enc_tenant_asaas)")
    expect(cancelSubMock).not.toHaveBeenCalledWith("sub_1", "MOTHER_ASAAS_KEY")
  })

  it("venda de REVENDA usa o token MP da unidade, nunca o da PMB", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ tenantId: "t1", gateway: "MP", mpSubscriptionId: "pre_1" }),
    )

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(cancelPreapprovalMock).toHaveBeenCalledWith("dec(enc_tenant_mp)", "pre_1")
    expect(cancelPreapprovalMock).not.toHaveBeenCalledWith("PMB_MP_TOKEN", "pre_1")
  })

  it("venda da vitrine PMB (tenantId null) usa a conta-mãe", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ tenantId: null, gateway: "ASAAS", asaasSubscriptionId: "sub_pmb" }),
    )

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(p.tenant.findUnique).not.toHaveBeenCalled()
    expect(cancelSubMock).toHaveBeenCalledWith("sub_pmb", "MOTHER_ASAAS_KEY")
  })

  it("matrícula de outra unidade vira NOT_FOUND (expectedTenantId no where)", async () => {
    p.enrollment.findFirst.mockResolvedValue(null)

    const out = await cancelEnrollment({
      enrollmentId: "e1",
      expectedTenantId: "t2",
      removeAccess: false,
      actor,
    })

    expect(out).toEqual({ ok: false, code: "NOT_FOUND" })
    expect(p.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "e1", tenantId: "t2" }),
      }),
    )
  })
})

describe("cancelEnrollment — gates de status", () => {
  it("curso concluído não é cancelável e não toca no gateway", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ status: "COMPLETED", asaasSubscriptionId: "sub_1" }),
    )

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(out).toEqual({ ok: false, code: "COMPLETED" })
    expect(cancelSubMock).not.toHaveBeenCalled()
    expect(p.enrollment.update).not.toHaveBeenCalled()
  })

  it("matrícula já cancelada devolve ALREADY_CANCELLED", async () => {
    p.enrollment.findFirst.mockResolvedValue(enrollment({ status: "CANCELLED" }))

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(out).toEqual({ ok: false, code: "ALREADY_CANCELLED" })
    expect(p.enrollment.update).not.toHaveBeenCalled()
  })
})

describe("cancelEnrollment — efeitos", () => {
  it("marca CANCELLED com cancelledAt", async () => {
    p.enrollment.findFirst.mockResolvedValue(enrollment())

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(out.ok).toBe(true)
    expect(p.enrollment.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
    })
  })

  it("primária de pacote arrasta as satélites", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ coursePackageId: "pkg1", packagePrimary: true }),
    )
    p.enrollment.findMany.mockResolvedValue([
      { id: "e2", courseId: "c2" },
      { id: "e3", courseId: "c3" },
    ])

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: true, actor })

    expect(out.ok && out.cancelledIds).toEqual(["e1", "e2", "e3"])
    expect(p.enrollment.update).toHaveBeenCalledTimes(3)
    // Remove o acesso de todos os cursos do pacote, não só o do curso primário.
    expect(unlinkMock.mock.calls.map((c) => c[1])).toEqual(["c1", "c2", "c3"])
  })

  it("satélite isolado não busca (nem cancela) a primária", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ id: "e2", coursePackageId: "pkg1", packagePrimary: false }),
    )

    const out = await cancelEnrollment({ enrollmentId: "e2", removeAccess: false, actor })

    expect(out.ok && out.cancelledIds).toEqual(["e2"])
    expect(p.enrollment.findMany).not.toHaveBeenCalled()
  })

  // Venda direta com vários cursos: a primária carrega a cobrança da compra
  // inteira, então cancelá-la tem que derrubar os cursos que vieram junto —
  // mesma regra do pacote, só que localizados por `primaryEnrollmentId`.
  it("primária de venda multi-curso arrasta as satélites", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ bundleCourseIds: ["c2", "c3"] }),
    )
    p.enrollment.findMany.mockResolvedValue([
      { id: "e2", courseId: "c2" },
      { id: "e3", courseId: "c3" },
    ])

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: true, actor })

    expect(p.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ primaryEnrollmentId: "e1" }),
      }),
    )
    expect(out.ok && out.cancelledIds).toEqual(["e1", "e2", "e3"])
    expect(p.enrollment.update).toHaveBeenCalledTimes(3)
    expect(unlinkMock.mock.calls.map((c) => c[1])).toEqual(["c1", "c2", "c3"])
  })

  it("satélite de venda multi-curso não arrasta a primária", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ id: "e2", courseId: "c2", bundleCourseIds: [] }),
    )

    const out = await cancelEnrollment({ enrollmentId: "e2", removeAccess: false, actor })

    expect(out.ok && out.cancelledIds).toEqual(["e2"])
    expect(p.enrollment.findMany).not.toHaveBeenCalled()
  })

  it("carnê: parcelas não pagas viram CANCELLED; as pagas nem entram na busca", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ gateway: "MP", status: "ACTIVE" }),
    )
    p.boletoInstallment.findMany.mockResolvedValue([
      { id: "b2", gateway: "MP", mpPaymentId: "mp_2", asaasPaymentId: null },
      { id: "b3", gateway: "MP", mpPaymentId: "mp_3", asaasPaymentId: null },
    ])

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(p.boletoInstallment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["SCHEDULED", "GENERATED", "OVERDUE"] },
        }),
      }),
    )
    expect(cancelPaymentMock).toHaveBeenCalledWith("dec(enc_tenant_mp)", "mp_2")
    expect(cancelPaymentMock).toHaveBeenCalledWith("dec(enc_tenant_mp)", "mp_3")
    expect(p.boletoInstallment.update).toHaveBeenCalledTimes(2)
  })

  it("carnê Asaas cancela pelo installment (derruba todas as parcelas de uma vez)", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ gateway: "ASAAS", asaasInstallmentId: "inst_1" }),
    )

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(deleteInstallmentMock).toHaveBeenCalledWith("inst_1", "dec(enc_tenant_asaas)")
  })

  it("cobrança avulsa só é apagada quando ainda está PENDING", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ status: "ACTIVE", asaasPaymentId: "pay_1" }),
    )

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    // Matrícula ACTIVE = já pago; apagar a cobrança apagaria o histórico.
    expect(deletePaymentMock).not.toHaveBeenCalled()
  })

  it("404 do gateway é sucesso (a cobrança já não existe lá)", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ asaasSubscriptionId: "sub_1" }),
    )
    cancelSubMock.mockRejectedValue(new AsaasApiError("not found", 404))

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(out.ok).toBe(true)
    expect(out.ok && out.gatewayError).toBeUndefined()
  })

  it("falha do gateway reporta o erro mas NÃO impede o cancelamento local", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ asaasSubscriptionId: "sub_1" }),
    )
    cancelSubMock.mockRejectedValue(new AsaasApiError("asaas fora do ar", 500))

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(out.ok).toBe(true)
    expect(out.ok && out.gatewayError).toContain("asaas fora do ar")
    expect(p.enrollment.update).toHaveBeenCalled()
  })

  it("falha ao remover acesso vira platformError sem impedir o cancelamento", async () => {
    p.enrollment.findFirst.mockResolvedValue(enrollment())
    unlinkMock.mockRejectedValue(new Error("plataforma fora do ar"))

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: true, actor })

    expect(out.ok).toBe(true)
    expect(out.ok && out.platformError).toContain("plataforma fora do ar")
    expect(p.enrollment.update).toHaveBeenCalled()
  })

  it("sem removeAccess não toca na plataforma de aulas", async () => {
    p.enrollment.findFirst.mockResolvedValue(enrollment())

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(unlinkMock).not.toHaveBeenCalled()
  })

  it("unidade sem gateway conectado reporta o motivo em vez de mentir sucesso", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ asaasSubscriptionId: "sub_1" }),
    )
    p.tenant.findUnique.mockResolvedValue({ asaasApiKey: null, mpAccessToken: null })

    const out = await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(out.ok && out.gatewayError).toBe("unidade sem gateway conectado")
    expect(cancelSubMock).not.toHaveBeenCalled()
  })
})

describe("cancelEnrollment — cota de aulas", () => {
  // Emenda entre o cancelamento e a trava de ritmo: se o aluno estava travado
  // pela cota e a matrícula que o travou é cancelada, NADA mais o reavaliaria —
  // ele ficaria em DEVEDOR (sem acesso à plataforma) para sempre.
  it("desarma o flag das canceladas e reavalia o acesso do aluno", async () => {
    p.enrollment.findFirst.mockResolvedValue(enrollment({ studentId: "s1" }))

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(clearPaceFlagsMock).toHaveBeenCalledWith(["e1"])
    expect(releasePaceMock).toHaveBeenCalledWith("s1")
  })

  it("arrasta os satélites do pacote na limpeza do flag", async () => {
    p.enrollment.findFirst.mockResolvedValue(
      enrollment({ packagePrimary: true, coursePackageId: "pkg1" }),
    )
    p.enrollment.findMany.mockResolvedValue([{ id: "e2", courseId: "c2" }])

    await cancelEnrollment({ enrollmentId: "e1", removeAccess: false, actor })

    expect(clearPaceFlagsMock).toHaveBeenCalledWith(["e1", "e2"])
  })
})
