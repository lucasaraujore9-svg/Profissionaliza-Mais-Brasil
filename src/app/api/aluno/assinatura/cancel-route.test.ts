import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Cancelamento pedido pelo próprio aluno.
 * - para a cobrança e mantém o acesso até o fim do ciclo (o corte é da varredura);
 * - vitalícia não se cancela por aqui: não há cobrança a parar, e cancelar só
 *   revogaria o acesso comprado para sempre.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { studentSubscription: { findFirst: vi.fn() } },
}))
vi.mock("@/lib/auth/student-session", () => ({
  requireStudentSession: vi.fn(async () => ({ studentId: "st_1", email: "a@x.com", tenantId: null, sessionId: "pmb_1" })),
}))
vi.mock("@/lib/subscriptions/cancel", () => ({ cancelSubscriptionAccess: vi.fn() }))
vi.mock("@/lib/subscriptions/checkout", () => ({ createSubscriptionAtGateway: vi.fn() }))
vi.mock("@/lib/subscriptions/plans", () => ({ getPlanForCheckout: vi.fn() }))
vi.mock("@/lib/checkout/payer", () => ({ PAYER_SELECT: {}, resolvePayer: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { cancelSubscriptionAccess } from "@/lib/subscriptions/cancel"
import { DELETE } from "./route"

type Mock = ReturnType<typeof vi.fn>
const findFirst = prisma.studentSubscription.findFirst as unknown as Mock
const cancel = cancelSubscriptionAccess as unknown as Mock

beforeEach(() => vi.clearAllMocks())

function del() {
  return DELETE(new Request("http://x/api/aluno/assinatura", { method: "DELETE" }))
}

describe("DELETE /api/aluno/assinatura", () => {
  it("recorrente: para a cobrança e mantém o acesso até o fim do ciclo", async () => {
    findFirst.mockResolvedValue({ id: "sub_1", currentPeriodEnd: new Date(), interval: "MONTHLY" })
    const res = await del()
    expect(res.status).toBe(200)
    expect(cancel).toHaveBeenCalledWith("sub_1", "REQUESTED", false)
  })

  it("vitalícia é recusada sem tocar em nada", async () => {
    findFirst.mockResolvedValue({ id: "sub_1", currentPeriodEnd: null, interval: "LIFETIME" })
    const res = await del()
    expect(res.status).toBe(409)
    expect(cancel).not.toHaveBeenCalled()
  })
})
