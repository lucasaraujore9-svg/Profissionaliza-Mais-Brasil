import { describe, it, expect } from "vitest"
import { buildEnrollmentCheckoutUrl } from "./checkout-link"

// Invariante coberto: o link que admin e revenda reenviam ao aluno e SEMPRE a
// pagina de pagamento da propria plataforma — nunca a pagina do gateway.
//
// Inversao registrada (2026-09-14): antes a fatura do Asaas ja emitida tinha
// prioridade ("evita cobranca duplicada", porque o checkout criava outra
// cobranca a cada volta). O checkout passou a retomar a cobranca anterior, e a
// funcao deixou de receber `asaasInvoiceUrl` — nenhum chamador consegue
// preferi-la.

const loja = { slug: "revenda1", customDomain: null, domainVerified: false }

const base = {
  status: "PENDING",
  enrollmentId: "enr_123",
  gateway: "MP",
  tenant: loja as { slug: string; customDomain: string | null; domainVerified: boolean } | null,
}

describe("buildEnrollmentCheckoutUrl", () => {
  it("retorna null para matricula nao pendente", () => {
    expect(buildEnrollmentCheckoutUrl({ ...base, status: "ACTIVE" })).toBeNull()
    expect(buildEnrollmentCheckoutUrl({ ...base, status: "CANCELLED" })).toBeNull()
  })

  it("unidade MP: /pagar no subdominio da loja", () => {
    expect(buildEnrollmentCheckoutUrl(base)).toBe(
      "https://revenda1.livrecursos.com.br/pagar/enr_123",
    )
  })

  it("unidade Asaas: /pagar da loja, mesmo com a fatura do Asaas ja emitida", () => {
    // A entrada nem aceita a fatura — o teste prende o contrato pelo tipo e
    // pelo valor: nada que nao seja /pagar sai daqui para uma unidade.
    expect(buildEnrollmentCheckoutUrl({ ...base, gateway: "ASAAS" })).toBe(
      "https://revenda1.livrecursos.com.br/pagar/enr_123",
    )
  })

  it("dominio proprio so entra quando verificado", () => {
    expect(
      buildEnrollmentCheckoutUrl({
        ...base,
        tenant: { ...loja, customDomain: "cursosjoao.com.br", domainVerified: true },
      }),
    ).toBe("https://cursosjoao.com.br/pagar/enr_123")
    expect(
      buildEnrollmentCheckoutUrl({
        ...base,
        tenant: { ...loja, customDomain: "cursosjoao.com.br", domainVerified: false },
      }),
    ).toBe("https://revenda1.livrecursos.com.br/pagar/enr_123")
  })

  it("vitrine PMB Asaas: /pagar no dominio da PMB", () => {
    const url = buildEnrollmentCheckoutUrl({ ...base, gateway: "ASAAS", tenant: null })
    expect(url).toMatch(/^https:\/\/[^/]+\/pagar\/enr_123$/)
    expect(url).not.toMatch(/livrecursos|asaas/)
    expect(
      buildEnrollmentCheckoutUrl({
        ...base,
        gateway: "ASAAS",
        tenant: { slug: "__pmb__", customDomain: null, domainVerified: false },
      }),
    ).toBe(url)
  })

  it("vitrine PMB MP: a mesma pagina da PMB (ela renderiza o checkout do MP)", () => {
    const url = buildEnrollmentCheckoutUrl({ ...base, tenant: null })
    expect(url).toMatch(/^https:\/\/[^/]+\/pagar\/enr_123$/)
    expect(url).not.toMatch(/mercadopago/)
  })
})
