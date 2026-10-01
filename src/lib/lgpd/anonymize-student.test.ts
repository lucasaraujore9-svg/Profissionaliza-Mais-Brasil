import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Exclusão de conta pelo titular. O defeito que este arquivo trava é de
 * DINHEIRO: a conta era anonimizada e a assinatura seguia ACTIVE, com a
 * autorização de Pix Automático viva — o ciclo seguinte seria debitado de uma
 * conta que não existe mais (Capacita Pró Brasil, 01/10/2026).
 */

const order = vi.hoisted(() => [] as string[])

const db = vi.hoisted(() => ({
  student: { findUnique: vi.fn(), update: vi.fn() },
  studentSubscription: { findMany: vi.fn() },
  certificate: { findMany: vi.fn(), updateMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/students/plataforma-actions", () => ({ blockStudentInEA: vi.fn(async () => undefined) }))
vi.mock("@/lib/lgpd/erasure-propagation", () => ({ propagateStudentErasure: vi.fn(async () => null) }))
vi.mock("@/lib/certificates/storage", () => ({
  extractCertificatePath: vi.fn(),
  deleteCertificatePdf: vi.fn(),
}))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))
vi.mock("@/lib/subscriptions/cancel", () => ({ cancelSubscriptionAccess: vi.fn() }))

import { cancelSubscriptionAccess } from "@/lib/subscriptions/cancel"
import { logAudit } from "@/lib/audit"
import { anonymizeStudentAccount } from "./anonymize-student"

const cancel = cancelSubscriptionAccess as unknown as ReturnType<typeof vi.fn>
const audit = logAudit as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  db.student.findUnique.mockResolvedValue({ id: "stu_12345678", tenantId: "ten_1", status: "ATIVO" })
  db.student.update.mockImplementation(async () => void order.push("wipe"))
  db.studentSubscription.findMany.mockResolvedValue([{ id: "sub_1" }, { id: "sub_2" }])
  db.certificate.findMany.mockResolvedValue([])
  db.certificate.updateMany.mockResolvedValue({ count: 0 })
  cancel.mockImplementation(async (id: string) => {
    order.push(`cancel:${id}`)
    return { enrollmentsCancelled: 0, revoked: 0, errors: [] }
  })
})

describe("anonymizeStudentAccount", () => {
  it("cancela toda assinatura viva (e revoga o acesso) ANTES de apagar os dados", async () => {
    await anonymizeStudentAccount("stu_12345678", { role: "STUDENT" })

    expect(db.studentSubscription.findMany.mock.calls[0][0].where).toEqual({
      studentId: "stu_12345678",
      status: { notIn: ["CANCELLED", "EXPIRED"] },
    })
    expect(cancel).toHaveBeenCalledWith("sub_1", "REQUESTED", true)
    expect(cancel).toHaveBeenCalledWith("sub_2", "REQUESTED", true)
    expect(order).toEqual(["cancel:sub_1", "cancel:sub_2", "wipe"])
    expect(audit.mock.calls[0][0].payloadAfter).toMatchObject({ subscriptionsCancelled: 2 })
  })

  it("cancelamento que estoura não impede a exclusão (LGPD) — o próprio cancelamento já alerta", async () => {
    cancel.mockRejectedValueOnce(new Error("gateway fora"))
    await anonymizeStudentAccount("stu_12345678", { role: "STUDENT" })
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(db.student.update).toHaveBeenCalledTimes(1)
  })
})
