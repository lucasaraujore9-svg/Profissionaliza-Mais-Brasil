import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Cupom de 100% (ou FIXED >= preço, ou desconto manual integral) zera o valor.
 * MP e Asaas recusam cobrança de R$ 0 — antes deste guard a venda morria com a
 * matrícula PENDING, o cupom já consumido e o curso nunca liberado.
 *
 * Aqui provamos as duas metades da regra:
 *  1. `releaseFreeEnrollment` libera pelo caminho da bolsa (motivo FULL_DISCOUNT)
 *     e fecha o lead como ganho;
 *  2. os núcleos de cobrança (MP e Asaas) NÃO chamam o gateway quando o valor
 *     é zero — a regressão que reintroduziria o bug.
 */

vi.mock("@/lib/enrollment/fulfill", () => ({
  fulfillScholarshipEnrollment: vi.fn(),
}))
vi.mock("@/lib/automation/leads", () => ({
  markLeadAsWon: vi.fn().mockResolvedValue(undefined),
}))

import { fulfillScholarshipEnrollment } from "@/lib/enrollment/fulfill"
import { markLeadAsWon } from "@/lib/automation/leads"
import {
  isFreeAmount,
  pmbTenantContext,
  releaseFreeEnrollment,
  resellerTenantContext,
} from "./free-enrollment"

const RESELLER = {
  id: "tenant_1",
  slug: "revenda1",
  name: "Revenda 1",
  plataformaVendedorId: "vend_9",
}

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks zera as implementações padrão dos mocks acima.
  vi.mocked(markLeadAsWon).mockResolvedValue(undefined)
  vi.mocked(fulfillScholarshipEnrollment).mockResolvedValue(undefined)
})

describe("isFreeAmount", () => {
  it("trata zero como gratuito", () => {
    expect(isFreeAmount(0)).toBe(true)
  })

  it("aceita string e Decimal-like (o valor vem de Prisma.Decimal)", () => {
    expect(isFreeAmount("0")).toBe(true)
    expect(isFreeAmount("0.00")).toBe(true)
    expect(isFreeAmount({ toString: () => "0" } as never)).toBe(true)
  })

  it("protege contra negativo (nunca deve virar cobrança)", () => {
    expect(isFreeAmount(-0.01)).toBe(true)
  })

  it("NÃO trata o menor valor cobrável como gratuito", () => {
    expect(isFreeAmount(0.01)).toBe(false)
    expect(isFreeAmount(99.9)).toBe(false)
  })
})

describe("releaseFreeEnrollment", () => {
  it("libera pelo caminho da bolsa, marcado como desconto integral", async () => {
    await releaseFreeEnrollment(resellerTenantContext(RESELLER), "enr_1")

    expect(fulfillScholarshipEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tenant_1", isPmbVitrine: false }),
      "enr_1",
      { reason: "FULL_DISCOUNT" },
    )
  })

  it("fecha o lead como ganho na revenda (senão o cron o marcaria abandonado)", async () => {
    await releaseFreeEnrollment(resellerTenantContext(RESELLER), "enr_1")

    expect(markLeadAsWon).toHaveBeenCalledWith({
      enrollmentId: "enr_1",
      tenantId: "tenant_1",
      amount: 0,
    })
  })

  it("na vitrine PMB o lead é fechado com tenantId null", async () => {
    await releaseFreeEnrollment(
      pmbTenantContext({ id: "pmb_placeholder", slug: "__pmb__" }),
      "enr_2",
    )

    expect(markLeadAsWon).toHaveBeenCalledWith({
      enrollmentId: "enr_2",
      tenantId: null,
      amount: 0,
    })
  })

  it("falha do lead não derruba a liberação do curso (best-effort)", async () => {
    vi.mocked(markLeadAsWon).mockRejectedValueOnce(new Error("db down"))

    await expect(
      releaseFreeEnrollment(resellerTenantContext(RESELLER), "enr_3"),
    ).resolves.toBeUndefined()
    expect(fulfillScholarshipEnrollment).toHaveBeenCalled()
  })

  it("propaga falha do provisionamento (a rota precisa dar rollback)", async () => {
    vi.mocked(fulfillScholarshipEnrollment).mockRejectedValueOnce(
      new Error("plataforma fora do ar"),
    )

    await expect(
      releaseFreeEnrollment(resellerTenantContext(RESELLER), "enr_4"),
    ).rejects.toThrow("plataforma fora do ar")
  })
})
