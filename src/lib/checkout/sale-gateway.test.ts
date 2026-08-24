import { describe, it, expect } from "vitest"
import { resolveSaleGateway, type SaleGatewayInput } from "./sale-gateway"

function input(over: Partial<SaleGatewayInput> = {}): SaleGatewayInput {
  return {
    mode: "MP",
    salesGateway: "MP",
    asaasWebhookToken: null,
    finalAmount: 197,
    ...over,
  }
}

describe("resolveSaleGateway", () => {
  it("unidade SEM conta conectada: cobrança é recusada", () => {
    const r = resolveSaleGateway(input({ mode: "NONE", finalAmount: 197 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("CHECKOUT_UNAVAILABLE")
  })

  it("unidade SEM conta conectada: valor zerado PASSA (cupom de 100% vira bolsa)", () => {
    const r = resolveSaleGateway(input({ mode: "NONE", finalAmount: 0 }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.free).toBe(true)
  })

  it("valor zerado rotula o gateway ESCOLHIDO pela unidade, não o efetivo", () => {
    // Sem cobrança nenhuma sai por ele, mas a coluna alimenta o BI: gravar "MP"
    // numa unidade que escolheu Asaas mentiria no relatório de vendas.
    const r = resolveSaleGateway(
      input({ mode: "NONE", salesGateway: "ASAAS", finalAmount: 0 }),
    )
    expect(r.ok && r.gateway).toBe("ASAAS")
  })

  it("desconto PARCIAL numa unidade sem conta continua recusado", () => {
    // O buraco a evitar: relaxar o gate por existir cupom, e não por o valor
    // ter zerado. R$ 0,01 ainda precisa de gateway.
    const r = resolveSaleGateway(input({ mode: "NONE", finalAmount: 0.01 }))
    expect(r.ok).toBe(false)
  })

  it("Asaas sem token de webhook recusa a cobrança", () => {
    const r = resolveSaleGateway(
      input({ mode: "ASAAS", salesGateway: "ASAAS", asaasWebhookToken: null }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("ASAAS_NOT_CONFIGURED")
  })

  it("Asaas sem token de webhook NÃO trava a liberação gratuita", () => {
    // Nenhuma cobrança é criada, então não há confirmação de webhook a esperar.
    const r = resolveSaleGateway(
      input({
        mode: "ASAAS",
        salesGateway: "ASAAS",
        asaasWebhookToken: null,
        finalAmount: 0,
      }),
    )
    expect(r.ok).toBe(true)
  })

  it("curso de autoria de outra unidade sai sempre pelo Asaas", () => {
    const r = resolveSaleGateway(input({ mode: "MP", requiresSplit: true }))
    expect(r.ok && r.gateway).toBe("ASAAS")
  })

  it("venda comum devolve o gateway efetivo da unidade", () => {
    const r = resolveSaleGateway(
      input({ mode: "ASAAS", salesGateway: "ASAAS", asaasWebhookToken: "wh" }),
    )
    expect(r.ok && r.gateway).toBe("ASAAS")
  })
})
