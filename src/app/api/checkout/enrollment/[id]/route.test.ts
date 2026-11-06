import { describe, it, expect, vi, beforeEach } from "vitest"

// I4: retomada de cobrança PMB não emite nada para parcelado flex.

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
vi.mock("@/lib/checkout/issue-pmb-asaas-charge", () => ({ issuePmbAsaasCharge: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { issuePmbAsaasCharge } from "@/lib/checkout/issue-pmb-asaas-charge"
import { POST } from "./route"

const findFirst = prisma.enrollment.findFirst as unknown as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe("POST /api/checkout/enrollment/[id] — parcelado flex (I4)", () => {
  it("matrícula flex: 409 USE_PARCELA_ROUTE e nenhuma cobrança", async () => {
    findFirst.mockResolvedValue({
      id: "enr1",
      status: "PENDING",
      paymentType: "BOLETO_INSTALLMENT",
      flexInstallments: true,
      finalAmount: 400,
      boletoInstallments: [],
      student: {},
      course: { nome: "Curso" },
    })
    const res = await POST(
      new Request("https://pmb.x/api/checkout/enrollment/enr1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentMethod: "PIX", acceptedTerms: true }),
      }),
      { params: Promise.resolve({ id: "enr1" }) },
    )
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("USE_PARCELA_ROUTE")
    expect(issuePmbAsaasCharge).not.toHaveBeenCalled()
  })
})
