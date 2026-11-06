import { describe, it, expect, vi, beforeEach } from "vitest"

// I4: parcelado flex da PMB no MP se paga pela rota da parcela; este process
// cobraria o finalAmount inteiro.

vi.mock("@/lib/prisma", () => ({ prisma: { enrollment: { findFirst: vi.fn() } } }))
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { publicCheckout: {} },
}))
vi.mock("@/lib/checkout/bot-guard", () => ({ rejectBot: vi.fn(async () => null) }))
vi.mock("@/lib/tenant/urls", async (orig) => ({
  ...(await orig<typeof import("@/lib/tenant/urls")>()),
  isPmbAppHost: () => true,
}))
vi.mock("@/lib/pmb-config", () => ({
  pmbMpAccessToken: vi.fn(async () => "tok"),
  pmbPlataformaPolo: () => "pmb",
  pmbPlataformaVendedorId: () => null,
  PMB_PUBLIC_NAME: "PMB",
}))
vi.mock("@/lib/mercadopago/transparent-process", async (orig) => ({
  ...(await orig<typeof import("@/lib/mercadopago/transparent-process")>()),
  processTransparentMpPayment: vi.fn(),
}))

import { prisma } from "@/lib/prisma"
import { processTransparentMpPayment } from "@/lib/mercadopago/transparent-process"
import { POST } from "./route"

const findFirst = prisma.enrollment.findFirst as unknown as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe("POST /api/checkout/mp/process — parcelado flex (I4)", () => {
  it("matrícula flex: 409 USE_PARCELA_ROUTE e nada no MP", async () => {
    findFirst.mockResolvedValue({
      id: "enr1",
      status: "PENDING",
      paymentType: "BOLETO_INSTALLMENT",
      flexInstallments: true,
      finalAmount: 400,
      installmentsTotal: 4,
      student: {},
      course: { nome: "Curso" },
    })
    const res = await POST(
      new Request("https://pmb.x/api/checkout/mp/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrollmentId: "enr1", formData: { payment_method_id: "pix" } }),
      }),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("USE_PARCELA_ROUTE")
    expect(processTransparentMpPayment).not.toHaveBeenCalled()
  })
})
