import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * Baixa manual e estorno recebem o id da linha do historico, que pode ser o do
 * banco OU o do Asaas (fatura que o webhook nunca espelhou). Incidente
 * 26/10/2026 (PraxisPb): fatura de 25/10 so existia no Asaas e a baixa
 * respondia 404 "Cobranca nao encontrada".
 */

const db = vi.hoisted(() => ({ tenantPayment: { findFirst: vi.fn() } }))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
const reconcile = vi.hoisted(() => vi.fn())
vi.mock("@/lib/asaas/reconcile", () => ({ reconcileTenantPayments: reconcile }))

import { resolveTenantPayment } from "./resolve-payment"

const tenant = { id: "t1", asaasCustomerId: "cus_1", asaasSubscriptionId: "sub_1" }

beforeEach(() => vi.clearAllMocks())

describe("resolveTenantPayment", () => {
  it("acha pelo id do banco ou do Asaas, sempre escopado pela unidade", async () => {
    db.tenantPayment.findFirst.mockResolvedValueOnce({ id: "local-1", asaasPaymentId: "pay_1" })
    expect(await resolveTenantPayment(tenant, "pay_1")).toEqual({ id: "local-1", asaasPaymentId: "pay_1" })
    expect(db.tenantPayment.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: "t1",
      OR: [{ id: "pay_1" }, { asaasPaymentId: "pay_1" }],
    })
    expect(reconcile).not.toHaveBeenCalled()
  })

  it("fatura so no Asaas: reconcilia a unidade e devolve a linha importada", async () => {
    db.tenantPayment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "novo", asaasPaymentId: "pay_so_asaas" })
    expect(await resolveTenantPayment(tenant, "pay_so_asaas")).toEqual({ id: "novo", asaasPaymentId: "pay_so_asaas" })
    expect(reconcile).toHaveBeenCalledWith(tenant)
  })

  it("nao existe nem depois de reconciliar (ou e de outra unidade): null", async () => {
    db.tenantPayment.findFirst.mockResolvedValue(null)
    expect(await resolveTenantPayment(tenant, "pay_outra")).toBeNull()
  })

  it("Asaas fora do ar propaga o erro (503 no chamador, nunca 404)", async () => {
    db.tenantPayment.findFirst.mockResolvedValue(null)
    reconcile.mockRejectedValueOnce(new Error("asaas down"))
    await expect(resolveTenantPayment(tenant, "pay_1")).rejects.toThrow("asaas down")
  })

  it("unidade sem Asaas nao consulta o gateway", async () => {
    db.tenantPayment.findFirst.mockResolvedValue(null)
    const semAsaas = { id: "t1", asaasCustomerId: null, asaasSubscriptionId: null }
    expect(await resolveTenantPayment(semAsaas, "x")).toBeNull()
    expect(reconcile).not.toHaveBeenCalled()
  })
})
