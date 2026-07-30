import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * `reconcilePendingEnrollment` é o ÚNICO caminho de confirmação que não depende
 * do webhook — sustenta o "Já fiz o pagamento" do aluno e o "Verificar
 * pagamento" da gestão (unidade e sistema mãe).
 *
 * Regressão que estes testes travam: o ramo Asaas resolvia a unidade com
 * `resolveTenantById`, que é do fluxo do Mercado Pago e devolve `null` quando a
 * unidade não tem `mpAccessToken`. Resultado: toda venda de uma unidade
 * Asaas-only respondia "unsupported" sem NUNCA consultar o Asaas — o botão de
 * verificar não destravava nada, e uma cobrança paga ficava PENDING para sempre.
 */

vi.mock("@/lib/prisma", () => {
  const prisma = {
    payment: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn(), findUnique: vi.fn() },
    tenant: { findUnique: vi.fn() },
    webhookLog: { update: vi.fn() },
  }
  return { prisma }
})
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => `dec(${s})` }))
vi.mock("./client", () => ({
  decryptTenantMpToken: (s: string) => `tok(${s})`,
  getPayment: vi.fn(),
  getAuthorizedPayment: vi.fn(),
  searchPayments: vi.fn(),
}))
vi.mock("@/lib/asaas/client", () => ({
  getPayment: vi.fn(),
  listPayments: vi.fn(),
  decryptTenantAsaasKey: (s: string) => `asaas(${s})`,
}))
vi.mock("./webhook", () => ({ validateMpWebhookSignature: vi.fn(() => true) }))
vi.mock("@/lib/pmb-config", () => ({
  pmbPlataformaPolo: () => "pmb",
  pmbPlataformaVendedorId: () => "vp",
  pmbMpAccessToken: vi.fn().mockResolvedValue("pmb-token"),
}))
vi.mock("./fulfillment", () => ({ fulfillFromMpPayment: vi.fn() }))
vi.mock("@/lib/enrollment/fulfill", () => ({ fulfillEnrollment: vi.fn() }))
vi.mock("@/lib/students/plataforma-actions", () => ({
  unlinkCourseFromStudent: vi.fn(),
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("./student-payment-emails", () => ({
  notifyStudentPaymentPending: vi.fn(),
  notifyStudentPaymentRejected: vi.fn(),
}))
vi.mock("@/lib/webhooks/transient", () => ({ isTransientWebhookError: () => false }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { getPayment as getAsaasPayment } from "@/lib/asaas/client"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { reconcilePendingEnrollment } from "./process"

const p = prisma as unknown as {
  enrollment: { findUnique: ReturnType<typeof vi.fn> }
  tenant: { findUnique: ReturnType<typeof vi.fn> }
}
const asaasGet = getAsaasPayment as unknown as ReturnType<typeof vi.fn>
const fulfillMock = fulfillEnrollment as unknown as ReturnType<typeof vi.fn>

/** Matrícula de vitrine de revenda cobrada na conta Asaas da unidade. */
const asaasEnrollment = {
  id: "e1",
  status: "PENDING",
  tenantId: "t1",
  gateway: "ASAAS",
  paymentType: "ONE_TIME",
  externalReference: "enr_e1",
  asaasPaymentId: "pay_abc",
  asaasSubscriptionId: null,
}

/** Unidade que vende SÓ pelo Asaas — nunca conectou Mercado Pago. */
const asaasOnlyTenant = {
  id: "t1",
  slug: "ceipro",
  name: "CEIPRO CURSOS",
  plataformaVendedorId: "v1",
  asaasApiKey: "enc-asaas-key",
}

beforeEach(() => {
  vi.clearAllMocks()
  p.enrollment.findUnique.mockResolvedValue(asaasEnrollment)
  p.tenant.findUnique.mockResolvedValue(asaasOnlyTenant)
  fulfillMock.mockResolvedValue(undefined)
})

describe("reconcilePendingEnrollment — venda Asaas de unidade sem Mercado Pago", () => {
  it("consulta o Asaas com a chave DA UNIDADE e efetiva a matrícula", async () => {
    asaasGet.mockResolvedValue({
      id: "pay_abc",
      status: "RECEIVED",
      value: 120,
      paymentDate: "2026-07-28",
    })

    const result = await reconcilePendingEnrollment("e1")

    expect(result).toEqual({ status: "confirmed" })
    // A chave usada é a da unidade (descriptografada), nunca a global da PMB.
    expect(asaasGet).toHaveBeenCalledWith("pay_abc", "asaas(enc-asaas-key)")
    expect(fulfillMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", slug: "ceipro", isPmbVitrine: false }),
      "e1",
      expect.objectContaining({ gateway: "ASAAS", externalPaymentId: "pay_abc", amount: 120 }),
    )
  })

  it("cobrança ainda não paga no Asaas: pending, sem efetivar", async () => {
    asaasGet.mockResolvedValue({
      id: "pay_abc",
      status: "PENDING",
      value: 120,
      paymentDate: null,
    })

    const result = await reconcilePendingEnrollment("e1")

    expect(result).toEqual({ status: "pending" })
    expect(fulfillMock).not.toHaveBeenCalled()
  })

  it("unidade sem conta Asaas conectada: pending (o webhook ainda pode chegar), sem consultar o gateway", async () => {
    p.tenant.findUnique.mockResolvedValue({ ...asaasOnlyTenant, asaasApiKey: null })

    const result = await reconcilePendingEnrollment("e1")

    expect(result).toEqual({ status: "pending" })
    expect(asaasGet).not.toHaveBeenCalled()
    expect(fulfillMock).not.toHaveBeenCalled()
  })

  it("matrícula SUSPENDED (cobrança vencida paga depois) ainda é liquidável", async () => {
    p.enrollment.findUnique.mockResolvedValue({
      ...asaasEnrollment,
      status: "SUSPENDED",
    })
    asaasGet.mockResolvedValue({
      id: "pay_abc",
      status: "CONFIRMED",
      value: 120,
      paymentDate: "2026-07-28",
    })

    const result = await reconcilePendingEnrollment("e1")

    expect(result).toEqual({ status: "confirmed" })
    expect(fulfillMock).toHaveBeenCalledTimes(1)
  })

  it("matrícula já ativa: confirma sem tocar no gateway (idempotente)", async () => {
    p.enrollment.findUnique.mockResolvedValue({
      ...asaasEnrollment,
      status: "ACTIVE",
    })

    const result = await reconcilePendingEnrollment("e1")

    expect(result).toEqual({ status: "confirmed" })
    expect(asaasGet).not.toHaveBeenCalled()
    expect(fulfillMock).not.toHaveBeenCalled()
  })
})
