import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Corte de acesso ao cancelar uma assinatura.
 *
 * As invariantes aqui são de produto, não de implementação: certificado que já
 * circulou não pode ser revogado, curso comprado avulso não pode cair junto, e
 * uma matrícula só é marcada como cancelada se a fornecedora confirmou.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentSubscription: { findUnique: vi.fn(), update: vi.fn() },
    enrollment: { findMany: vi.fn(), updateMany: vi.fn() },
    certificate: { updateMany: vi.fn() },
  },
}))
vi.mock("@/lib/students/plataforma-actions", () => ({
  unlinkCourseFromStudent: vi.fn(),
  blockStudentInEA: vi.fn(),
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/asaas/client", () => ({
  cancelSubscription: vi.fn(async () => ({ deleted: true, id: "sub_asaas" })),
  motherAsaasKey: () => "mother-key",
}))
vi.mock("@/lib/mercadopago/client", () => ({ cancelPreapproval: vi.fn() }))
vi.mock("@/lib/enrollment/gateway-credentials", () => ({
  resolveEnrollmentGatewayKeys: vi.fn(async () => ({ mpAccessToken: "mp-token" })),
}))
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { prisma } from "@/lib/prisma"
import {
  unlinkCourseFromStudent,
  blockStudentInEA,
} from "@/lib/students/plataforma-actions"
import { cancelSubscription as cancelAsaasSubscription } from "@/lib/asaas/client"
import { cancelPreapproval } from "@/lib/mercadopago/client"
import { cancelSubscriptionAccess } from "./cancel"

const findSub = prisma.studentSubscription.findUnique as unknown as ReturnType<typeof vi.fn>
const findEnr = prisma.enrollment.findMany as unknown as ReturnType<typeof vi.fn>
const updateMany = prisma.enrollment.updateMany as unknown as ReturnType<typeof vi.fn>
const unlink = unlinkCourseFromStudent as unknown as ReturnType<typeof vi.fn>
const blockEA = blockStudentInEA as unknown as ReturnType<typeof vi.fn>
const cancelAsaas = cancelAsaasSubscription as unknown as ReturnType<typeof vi.fn>
const cancelMp = cancelPreapproval as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  findSub.mockResolvedValue({
    id: "sub_1",
    studentId: "st_1",
    tenantId: null,
    status: "PAST_DUE",
    gateway: "ASAAS",
    asaasSubscriptionId: "sub_asaas",
    mpPreapprovalId: null,
    plan: { name: "Plano Total" },
  })
  findEnr.mockResolvedValue([
    { id: "e1", courseId: "c1" },
    { id: "e2", courseId: "c2" },
  ])
  updateMany.mockResolvedValue({ count: 2 })
  unlink.mockResolvedValue(undefined)
})

describe("cancelSubscriptionAccess", () => {
  it("revoga os cursos e cancela as matriculas da assinatura", async () => {
    const r = await cancelSubscriptionAccess("sub_1", "PAST_DUE")
    expect(unlink).toHaveBeenCalledTimes(2)
    expect(r.revoked).toBe(2)
    expect(r.enrollmentsCancelled).toBe(2)
  })

  it("NUNCA bloqueia o aluno inteiro na plataforma de aulas", async () => {
    // O login da EA é por CPF e carrega também os cursos COMPRADOS avulso:
    // bloquear derrubaria o que a pessoa pagou à parte.
    await cancelSubscriptionAccess("sub_1", "PAST_DUE")
    expect(blockEA).not.toHaveBeenCalled()
  })

  it("nao toca em certificados ja emitidos", async () => {
    // Revogar faria /validar/{code} responder "não encontrado" — lê como fraude.
    await cancelSubscriptionAccess("sub_1", "REQUESTED")
    expect(prisma.certificate.updateMany).not.toHaveBeenCalled()
  })

  it("alcanca tambem as matriculas COMPLETED", async () => {
    // Emitir certificado promove a matrícula a COMPLETED, e o SSO aceita
    // COMPLETED: deixá-la de fora manteria o acesso de quem mais usou o plano.
    await cancelSubscriptionAccess("sub_1", "PAST_DUE")
    const where = findEnr.mock.calls[0][0].where
    expect(where.status.in).toContain("COMPLETED")
    expect(where.status.in).toContain("ACTIVE")
  })

  it("so alcanca matriculas DESTA assinatura", async () => {
    await cancelSubscriptionAccess("sub_1", "PAST_DUE")
    expect(findEnr.mock.calls[0][0].where.studentSubscriptionId).toBe("sub_1")
  })

  it("nao marca como cancelada a matricula que a fornecedora recusou revogar", async () => {
    // Marcar assim mesmo esconderia o vazamento: a tela diria "sem acesso" e o
    // aluno seguiria assistindo.
    unlink.mockImplementation(async (_s: string, courseId: string) => {
      if (courseId === "c2") throw new Error("EA fora do ar")
    })
    updateMany.mockResolvedValue({ count: 1 })

    const r = await cancelSubscriptionAccess("sub_1", "PAST_DUE")
    expect(r.revoked).toBe(1)
    expect(r.errors).toHaveLength(1)
    expect(updateMany.mock.calls[0][0].where.id.in).toEqual(["e1"])
  })

  it("revokeAccess=false encerra a cobranca e PRESERVA o acesso", async () => {
    // Cancelamento pedido para o fim do ciclo: ele já pagou o mês corrente.
    const r = await cancelSubscriptionAccess("sub_1", "REQUESTED", false)
    expect(unlink).not.toHaveBeenCalled()
    expect(r.enrollmentsCancelled).toBe(0)
    expect(prisma.studentSubscription.update).toHaveBeenCalled()
  })

  it("PARA a recorrencia no gateway", async () => {
    // Sem isto o Asaas/MP seguia cobrando todo mês para sempre enquanto o aluno
    // ficava sem acesso nenhum — a parte do cancelamento que custa dinheiro.
    await cancelSubscriptionAccess("sub_1", "PAST_DUE")
    expect(cancelAsaas).toHaveBeenCalledWith("sub_asaas", "mother-key")
  })

  it("cancela no MP quando a recorrencia e de la", async () => {
    findSub.mockResolvedValue({
      id: "sub_1",
      studentId: "st_1",
      tenantId: "t1",
      status: "ACTIVE",
      gateway: "MP",
      asaasSubscriptionId: null,
      mpPreapprovalId: "pre_1",
      plan: { name: "Plano Total" },
    })
    await cancelSubscriptionAccess("sub_1", "REQUESTED")
    expect(cancelMp).toHaveBeenCalledWith("mp-token", "pre_1")
    expect(cancelAsaas).not.toHaveBeenCalled()
  })

  it("para a recorrencia MESMO com revokeAccess=false", async () => {
    // Cancelamento para o fim do ciclo: o acesso fica, mas a COBRANÇA para.
    await cancelSubscriptionAccess("sub_1", "REQUESTED", false)
    expect(cancelAsaas).toHaveBeenCalledTimes(1)
    expect(unlink).not.toHaveBeenCalled()
  })

  it("falha no gateway nao impede o corte de acesso, mas alerta", async () => {
    cancelAsaas.mockRejectedValueOnce(new Error("Asaas fora do ar"))
    const r = await cancelSubscriptionAccess("sub_1", "PAST_DUE")
    expect(r.errors.some((e) => e.startsWith("gateway:"))).toBe(true)
    expect(unlink).toHaveBeenCalled()
  })

  it("assinatura inexistente e no-op", async () => {
    findSub.mockResolvedValue(null)
    const r = await cancelSubscriptionAccess("nope", "REQUESTED")
    expect(r.revoked).toBe(0)
    expect(prisma.studentSubscription.update).not.toHaveBeenCalled()
  })
})
