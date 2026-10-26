import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * Cancelar uma fatura que ainda nao tem espelho no banco (o webhook
 * PAYMENT_CREATED nao chegou, ou chegou depois da tela abrir): a rota le as
 * cobrancas da unidade no Asaas, cria o vinculo e so entao cancela. Antes ela
 * cancelava "solta" e a linha nunca existia para o PAYMENT_DELETED gravar.
 */

const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  tenantPayment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const requireAdmin = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin }))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const reconcile = vi.hoisted(() => vi.fn())
vi.mock("@/lib/asaas/reconcile", () => ({ reconcileTenantPayments: reconcile }))

const deletePayment = vi.hoisted(() => vi.fn())
const AsaasApiError = vi.hoisted(
  () =>
    class AsaasApiError extends Error {
      constructor(
        message: string,
        public statusCode: number,
      ) {
        super(message)
      }
    },
)
vi.mock("@/lib/asaas/client", () => ({
  deletePayment,
  updatePayment: vi.fn(),
  getPayment: vi.fn(),
  AsaasApiError,
}))

import { DELETE } from "@/app/api/admin/revendedores/[id]/payments/[paymentId]/route"
import { adminGuardFor } from "@/test/admin-ctx"

function cancelar(paymentId: string) {
  return DELETE(new Request("http://x", { method: "DELETE" }), {
    params: Promise.resolve({ id: "t1", paymentId }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockImplementation(adminGuardFor().requireAdmin)
  db.tenant.findUnique.mockResolvedValue({
    id: "t1",
    accountManagerId: null,
    salesUserId: null,
    asaasCustomerId: "cus_1",
    asaasSubscriptionId: "sub_1",
  })
  db.tenantPayment.findUnique.mockResolvedValue({ status: "PENDING", notes: null })
  db.tenantPayment.update.mockResolvedValue({})
})

describe("DELETE /api/admin/revendedores/[id]/payments/[paymentId]", () => {
  it("sem espelho local: reconcilia, vincula e cancela no Asaas", async () => {
    db.tenantPayment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "novo", asaasPaymentId: "pay_1" })
    const res = await cancelar("pay_1")
    expect(res.status).toBe(200)
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(deletePayment).toHaveBeenCalledWith("pay_1")
    // A linha NUNCA e apagada: vira DELETING com o historico de quem cancelou,
    // ANTES de o Asaas apagar (o webhook pode chegar no meio).
    const [[arg]] = db.tenantPayment.update.mock.calls as [[{ where: unknown; data: { status: string; notes: string } }]]
    expect(arg.where).toEqual({ id: "novo" })
    expect(arg.data.status).toBe("DELETING")
    expect(arg.data.notes).toMatch(/Cancelada no PMB por /)
    expect(db.tenantPayment.update.mock.invocationCallOrder[0]).toBeLessThan(
      deletePayment.mock.invocationCallOrder[0],
    )
  })

  it("Asaas recusa o cancelamento: 502 e a linha volta ao que era", async () => {
    db.tenantPayment.findFirst.mockResolvedValueOnce({ id: "local-1", asaasPaymentId: "pay_1" })
    deletePayment.mockRejectedValueOnce(new AsaasApiError("recusado", 400))
    expect((await cancelar("local-1")).status).toBe(502)
    const calls = db.tenantPayment.update.mock.calls as { data: unknown }[][]
    expect(calls.at(-1)?.[0].data).toEqual({ status: "PENDING", notes: null })
  })

  it("id do BANCO na URL: cancela pelo id do Asaas da linha", async () => {
    db.tenantPayment.findFirst.mockResolvedValueOnce({ id: "local-1", asaasPaymentId: "pay_9" })
    expect((await cancelar("local-1")).status).toBe(200)
    expect(reconcile).not.toHaveBeenCalled()
    expect(deletePayment).toHaveBeenCalledWith("pay_9")
  })

  it("cobranca de outra unidade: 404 e nada e cancelado", async () => {
    db.tenantPayment.findFirst.mockResolvedValue(null)
    expect((await cancelar("pay_alheia")).status).toBe(404)
    expect(deletePayment).not.toHaveBeenCalled()
  })

  it("Asaas fora do ar: 503 e nada e cancelado", async () => {
    db.tenantPayment.findFirst.mockResolvedValue(null)
    reconcile.mockRejectedValueOnce(new Error("asaas down"))
    expect((await cancelar("pay_1")).status).toBe(503)
    expect(deletePayment).not.toHaveBeenCalled()
  })
})
