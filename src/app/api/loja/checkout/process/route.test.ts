import { describe, it, expect, vi, beforeEach } from "vitest"

// I4: venda direta parcelada (flexInstallments) se paga linha a linha pela rota
// do plano (flex-pay.ts), nunca pelo checkout legado — que cobraria fora do
// flexOffer (meio errado, parcela fora da vez ou o total).

vi.mock("@/lib/prisma", () => ({ prisma: { enrollment: { findUnique: vi.fn() } } }))
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { publicCheckout: {} },
}))
vi.mock("@/lib/checkout/bot-guard", () => ({ rejectBot: vi.fn(async () => null) }))
vi.mock("@/lib/asaas/transparent-process", async (orig) => ({
  ...(await orig<typeof import("@/lib/asaas/transparent-process")>()),
  processExistingAsaasInstallmentPayment: vi.fn(),
  processTransparentAsaasPayment: vi.fn(),
}))
vi.mock("@/lib/mercadopago/transparent-process", async (orig) => ({
  ...(await orig<typeof import("@/lib/mercadopago/transparent-process")>()),
  processTransparentMpPayment: vi.fn(),
}))

import { prisma } from "@/lib/prisma"
import * as asaasTp from "@/lib/asaas/transparent-process"
import * as mpTp from "@/lib/mercadopago/transparent-process"
import { POST } from "./route"

const findUnique = prisma.enrollment.findUnique as unknown as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe("POST /api/loja/checkout/process — parcelado flex (I4)", () => {
  it("matrícula flex: 409 USE_PARCELA_ROUTE e nenhuma cobrança", async () => {
    findUnique.mockResolvedValue({
      id: "enr1",
      status: "PENDING",
      tenantId: "t1",
      gateway: "ASAAS",
      paymentType: "BOLETO_INSTALLMENT",
      flexInstallments: true,
      finalAmount: 400,
      boletoInstallments: [{ id: "r1", number: 1, status: "SCHEDULED", dueDate: new Date(), amount: 100 }],
      student: {},
      course: { nome: "Curso" },
      tenant: { id: "t1", slug: "loja", status: "ACTIVE" },
    })
    const res = await POST(
      new Request("http://loja.x/api/loja/checkout/process", {
        method: "POST",
        headers: { "x-tenant-id": "t1", "content-type": "application/json" },
        body: JSON.stringify({ enrollmentId: "enr1", boletoInstallmentId: "r1", formData: { method: "PIX" } }),
      }),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("USE_PARCELA_ROUTE")
    expect(asaasTp.processExistingAsaasInstallmentPayment).not.toHaveBeenCalled()
    expect(asaasTp.processTransparentAsaasPayment).not.toHaveBeenCalled()
    expect(mpTp.processTransparentMpPayment).not.toHaveBeenCalled()
  })
})
