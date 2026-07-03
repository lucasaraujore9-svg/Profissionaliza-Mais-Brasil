import { describe, it, expect, vi, beforeEach } from "vitest"

// QA-013: roteamento do webhook MP (processMpWebhook). O dinheiro entra por aqui
// antes de chegar ao fulfill: idempotência (payment já processado → no-op),
// resolução de tenant + HMAC, e o switch por status do pagamento
// (approved → fulfill; rejected → aviso; refunded/charged_back → revoke). Todos
// os clients externos (MP, plataforma, notificações) são mockados.

vi.mock("@/lib/prisma", () => {
  const prisma = {
    payment: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn() },
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
  decryptTenantAsaasKey: (s: string) => `dec(${s})`,
}))
vi.mock("./webhook", () => ({ validateMpWebhookSignature: vi.fn(() => true) }))
vi.mock("@/lib/pmb-config", () => ({
  pmbPlataformaPolo: () => "pmb",
  pmbPlataformaVendedorId: () => "vp",
  pmbMpAccessToken: vi.fn().mockResolvedValue("pmb-token"),
}))
vi.mock("./fulfillment", () => ({ fulfillFromMpPayment: vi.fn() }))
vi.mock("@/lib/enrollment/fulfill", () => ({ fulfillEnrollment: vi.fn() }))
vi.mock("@/lib/students/plataforma-actions", () => ({ unlinkCourseFromStudent: vi.fn() }))
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
import { getPayment } from "./client"
import { fulfillFromMpPayment } from "./fulfillment"
import { createNotification } from "@/lib/notifications"
import {
  notifyStudentPaymentPending,
  notifyStudentPaymentRejected,
} from "./student-payment-emails"
import { validateMpWebhookSignature } from "./webhook"
import { processMpWebhook } from "./process"

const p = prisma as unknown as {
  payment: { findUnique: ReturnType<typeof vi.fn> }
  enrollment: { findFirst: ReturnType<typeof vi.fn> }
  tenant: { findUnique: ReturnType<typeof vi.fn> }
  webhookLog: { update: ReturnType<typeof vi.fn> }
}
const getPaymentMock = getPayment as unknown as ReturnType<typeof vi.fn>
const fulfillMock = fulfillFromMpPayment as unknown as ReturnType<typeof vi.fn>
const notifyMock = createNotification as unknown as ReturnType<typeof vi.fn>
const rejectedMock = notifyStudentPaymentRejected as unknown as ReturnType<typeof vi.fn>
const pendingMock = notifyStudentPaymentPending as unknown as ReturnType<typeof vi.fn>
const hmacMock = validateMpWebhookSignature as unknown as ReturnType<typeof vi.fn>

function args(overrides: Record<string, unknown> = {}) {
  return {
    logId: "log1",
    paymentId: "pay_1",
    xSignature: "sig",
    xRequestId: "req",
    dataId: "pay_1",
    tenantSlug: "loja1",
    topic: "payment",
    ...overrides,
  }
}

function mpPayment(status: string) {
  return {
    id: "pay_1",
    status,
    external_reference: "ext_1",
    transaction_amount: 100,
    payment_type_id: "credit_card",
    status_detail: "accredited",
    date_approved: "2026-07-03T00:00:00.000Z",
  }
}

const revendaTenant = {
  id: "t1",
  name: "Loja 1",
  slug: "loja1",
  plataformaVendedorId: "v1",
  mpAccessToken: "enc-token",
  mpWebhookSecret: "enc-secret",
  primaryColor: "#000",
}

beforeEach(() => {
  vi.clearAllMocks()
  hmacMock.mockReturnValue(true)
  p.webhookLog.update.mockResolvedValue({})
  p.payment.findUnique.mockResolvedValue(null)
  p.tenant.findUnique.mockResolvedValue(revendaTenant)
  p.enrollment.findFirst.mockResolvedValue({ id: "e1" })
  notifyMock.mockResolvedValue(undefined)
})

describe("processMpWebhook — roteamento do dinheiro (QA-013)", () => {
  it("idempotência: payment já processado → markLog e não resolve tenant nem chama fulfill", async () => {
    p.payment.findUnique.mockResolvedValue({ id: "pmt-existente" })

    await processMpWebhook(args())

    expect(p.tenant.findUnique).not.toHaveBeenCalled()
    expect(fulfillMock).not.toHaveBeenCalled()
    expect(p.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    )
  })

  it("aprovado: chama fulfillFromMpPayment com o tenant resolvido e marca processed=true", async () => {
    getPaymentMock.mockResolvedValue(mpPayment("approved"))

    await processMpWebhook(args())

    expect(fulfillMock).toHaveBeenCalledTimes(1)
    expect(fulfillMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1" }),
      "e1",
      expect.objectContaining({ status: "approved" }),
    )
    // markLog final de sucesso.
    expect(p.webhookLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true, error: null }) }),
    )
  })

  it("rejeitado: avisa o aluno e NÃO chama fulfill", async () => {
    getPaymentMock.mockResolvedValue(mpPayment("rejected"))

    await processMpWebhook(args())

    expect(rejectedMock).toHaveBeenCalledTimes(1)
    expect(fulfillMock).not.toHaveBeenCalled()
  })

  it("pending: envia instruções ao aluno e não efetiva matrícula", async () => {
    getPaymentMock.mockResolvedValue(mpPayment("pending"))

    await processMpWebhook(args())

    expect(pendingMock).toHaveBeenCalledTimes(1)
    expect(fulfillMock).not.toHaveBeenCalled()
  })

  it("HMAC inválido: markLog(false) e não chama fulfill (nem getPayment)", async () => {
    hmacMock.mockReturnValue(false)

    await processMpWebhook(args())

    expect(getPaymentMock).not.toHaveBeenCalled()
    expect(fulfillMock).not.toHaveBeenCalled()
    expect(p.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: false, error: "hmac invalid" }) }),
    )
  })

  it("tenant não resolvido: markLog(false) + alerta SUPER_ADMIN, sem fulfill", async () => {
    p.tenant.findUnique.mockResolvedValue(null)

    await processMpWebhook(args())

    expect(fulfillMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ roleTarget: "SUPER_ADMIN", title: "Webhook MP sem tenant" }),
    )
    expect(p.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: false }) }),
    )
  })

  it("enrollment não encontrado por external_reference: markLog(true) sem fulfill", async () => {
    getPaymentMock.mockResolvedValue(mpPayment("approved"))
    p.enrollment.findFirst.mockResolvedValue(null)

    await processMpWebhook(args())

    expect(fulfillMock).not.toHaveBeenCalled()
    expect(p.webhookLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processed: true, error: expect.stringContaining("enrollment nao encontrado") }),
      }),
    )
  })
})
