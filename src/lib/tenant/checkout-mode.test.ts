import { describe, it, expect } from "vitest"
import { tenantCheckoutMode, type CheckoutModeInput } from "./checkout-mode"

// Fonte única do gateway efetivo da unidade. O Asaas deixou de ser capability
// liberada caso a caso pelo Admin Master (`asaasGatewayEnabled`, migration
// 20260728_asaas_gateway_always_on): as duas opções valem para toda unidade e a
// única condição do Asaas é a própria unidade ter conectado a conta.

function t(over: Partial<CheckoutModeInput> = {}): CheckoutModeInput {
  return {
    salesGateway: "MP",
    asaasConnected: false,
    mpAccessToken: "enc-token",
    mpPublicKey: "pk",
    ...over,
  }
}

describe("tenantCheckoutMode", () => {
  it("salesGateway=ASAAS + conta conectada → ASAAS (sem depender de capability)", () => {
    expect(
      tenantCheckoutMode(
        t({
          salesGateway: "ASAAS",
          asaasConnected: true,
          // Unidade que nunca conectou o Mercado Pago: o Asaas basta.
          mpAccessToken: null,
          mpPublicKey: null,
        }),
      ),
    ).toBe("ASAAS")
  })

  it("salesGateway=ASAAS sem conta conectada → NONE (nunca cai no MP)", () => {
    // REGRA DE OURO: escolher o Asaas e não estar pronto leva ao formulário de
    // contato, jamais a uma cobrança na conta MP antiga que a unidade abandonou.
    expect(
      tenantCheckoutMode(t({ salesGateway: "ASAAS", asaasConnected: false })),
    ).toBe("NONE")
  })

  it("salesGateway=MP com token + public key → MP", () => {
    expect(tenantCheckoutMode(t())).toBe("MP")
  })

  it("conectou o Asaas mas continua com salesGateway=MP → MP", () => {
    // Direção que só ficou alcançável quando o Asaas passou a valer para todas:
    // qualquer unidade pode colar uma API key do Asaas sem ativá-lo. Conectar
    // NÃO troca o gateway — inverter a ordem dos ramos do helper desviaria a
    // receita de toda unidade MP que apenas experimentou o Asaas.
    expect(
      tenantCheckoutMode(t({ salesGateway: "MP", asaasConnected: true })),
    ).toBe("MP")
  })

  it("salesGateway=MP sem credenciais completas → NONE", () => {
    expect(tenantCheckoutMode(t({ mpPublicKey: null }))).toBe("NONE")
    expect(tenantCheckoutMode(t({ mpAccessToken: null }))).toBe("NONE")
  })

  it("unidade nova (nada configurado) → NONE", () => {
    expect(
      tenantCheckoutMode({
        salesGateway: "MP",
        asaasConnected: false,
        mpAccessToken: null,
        mpPublicKey: null,
      }),
    ).toBe("NONE")
  })
})
