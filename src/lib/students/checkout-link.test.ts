import { describe, it, expect } from "vitest"
import { buildEnrollmentCheckoutUrl } from "./checkout-link"

// Invariante coberto: admin (sistema mae) e revenda conseguem recuperar o link
// de checkout de uma cobranca PENDENTE (venda direta ou carrinho abandonado),
// com a fonte do link variando por gateway/tenant.

const base = {
  status: "PENDING",
  enrollmentId: "enr_123",
  gateway: "MP",
  asaasInvoiceUrl: null as string | null,
  tenantSlug: "revenda1",
  tenantCustomDomain: null as string | null,
}

describe("buildEnrollmentCheckoutUrl", () => {
  it("retorna null para matricula nao pendente", () => {
    expect(buildEnrollmentCheckoutUrl({ ...base, status: "ACTIVE" })).toBeNull()
    expect(buildEnrollmentCheckoutUrl({ ...base, status: "CANCELLED" })).toBeNull()
  })

  it("prioriza a fatura Asaas quando existe", () => {
    expect(
      buildEnrollmentCheckoutUrl({
        ...base,
        asaasInvoiceUrl: "https://asaas.com/i/abc",
      }),
    ).toBe("https://asaas.com/i/abc")
  })

  it("monta a pagina /pagar da revenda MP no subdominio da vitrine", () => {
    expect(buildEnrollmentCheckoutUrl(base)).toBe(
      "https://revenda1.livrecursos.com.br/pagar/enr_123",
    )
  })

  it("usa o dominio proprio da revenda quando configurado", () => {
    expect(
      buildEnrollmentCheckoutUrl({
        ...base,
        tenantCustomDomain: "cursosjoao.com.br",
      }),
    ).toBe("https://cursosjoao.com.br/pagar/enr_123")
  })

  it("retorna null para PMB sem fatura Asaas ainda (nao usa /pagar)", () => {
    // Sistema mae nunca cai na pagina /pagar (que e so do MP transparente das
    // revendas). Sem asaasInvoiceUrl, fica sem link ate a fatura existir.
    expect(
      buildEnrollmentCheckoutUrl({ ...base, tenantSlug: "__pmb__" }),
    ).toBeNull()
  })

  it("nao oferece a pagina /pagar (MP-only) para revenda Asaas abandonada sem fatura", () => {
    // Revenda Asaas com carrinho abandonado: ainda sem asaasInvoiceUrl. A /pagar
    // so monta o Brick do MP, entao link nenhum e melhor que link MP quebrado.
    expect(
      buildEnrollmentCheckoutUrl({ ...base, gateway: "ASAAS" }),
    ).toBeNull()
  })

  it("usa a fatura Asaas da revenda quando ja existe", () => {
    expect(
      buildEnrollmentCheckoutUrl({
        ...base,
        gateway: "ASAAS",
        asaasInvoiceUrl: "https://asaas.com/i/rev",
      }),
    ).toBe("https://asaas.com/i/rev")
  })
})
