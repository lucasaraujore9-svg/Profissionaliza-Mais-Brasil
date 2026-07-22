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

  it("sistema mae (PMB) Asaas: usa a tela /pagar propria (nao a fatura crua)", () => {
    // Mesmo com asaasInvoiceUrl ja persistida, preferimos a tela de checkout da
    // marca PMB (dominio app) que retoma a cobranca — (main)/pagar/[id].
    const url = buildEnrollmentCheckoutUrl({
      ...base,
      tenantSlug: "__pmb__",
      gateway: "ASAAS",
      asaasInvoiceUrl: "https://asaas.com/i/pmb",
    })
    expect(url).toMatch(/\/pagar\/enr_123$/)
    expect(url).not.toBe("https://asaas.com/i/pmb")
  })

  it("retorna null para PMB MP sem init_point (nao usa /pagar de revenda)", () => {
    // PMB via MP: a /pagar de revenda e MP-tenant-scoped; o init_point do PMB nao
    // e persistido. Sem asaasInvoiceUrl, fica sem link na lista.
    expect(
      buildEnrollmentCheckoutUrl({ ...base, tenantSlug: "__pmb__" }),
    ).toBeNull()
  })

  it("revenda Asaas sem fatura ainda emitida: monta a /pagar da vitrine", () => {
    // Venda direta / carrinho abandonado de unidade Asaas: o asaasInvoiceUrl so
    // nasce quando o aluno escolhe a forma de pagamento, mas a /pagar ja ramifica
    // por gateway e renderiza o formulario Asaas. Sem isto, TODA venda direta das
    // unidades Asaas ficava sem link reenviavel no painel.
    expect(buildEnrollmentCheckoutUrl({ ...base, gateway: "ASAAS" })).toBe(
      "https://revenda1.livrecursos.com.br/pagar/enr_123",
    )
  })

  it("revenda Asaas com dominio proprio: /pagar no dominio da loja", () => {
    expect(
      buildEnrollmentCheckoutUrl({
        ...base,
        gateway: "ASAAS",
        tenantCustomDomain: "cursosjoao.com.br",
      }),
    ).toBe("https://cursosjoao.com.br/pagar/enr_123")
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
