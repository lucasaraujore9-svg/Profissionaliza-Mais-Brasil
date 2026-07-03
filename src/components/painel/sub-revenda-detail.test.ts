import { describe, it, expect } from "vitest"
import type { SubRevendaPayment } from "./sub-revenda-detail"

// SAAS-009: garante que o payload de pagamento da sub-revenda exposto ao
// indicador NÃO carrega invoiceUrl/bankSlipUrl (links de fatura/boleto da
// mensalidade que a sub-revenda paga à PMB — o indicador não é o pagador).
// Regressão travada em tempo de compilação: HasKey<"invoiceUrl"> volta a `true`
// se alguém reintroduzir o campo no tipo, e a atribuição `: false = ...` quebra
// o tsc.
type HasKey<K extends string> = K extends keyof SubRevendaPayment ? true : false

describe("SAAS-009 — sub-revenda não expõe links de fatura ao indicador", () => {
  it("SubRevendaPayment não tem invoiceUrl/bankSlipUrl", () => {
    const hasInvoiceUrl: HasKey<"invoiceUrl"> = false
    const hasBankSlipUrl: HasKey<"bankSlipUrl"> = false
    expect(hasInvoiceUrl).toBe(false)
    expect(hasBankSlipUrl).toBe(false)

    // Um payload válido não precisa desses campos.
    const p: SubRevendaPayment = {
      id: "1",
      asaasPaymentId: "pay_1",
      amount: 209,
      status: "RECEIVED",
      billingType: "PIX",
      dueDate: "2026-07-01T00:00:00.000Z",
      paidAt: "2026-07-01T00:00:00.000Z",
    }
    expect(Object.keys(p)).not.toContain("invoiceUrl")
    expect(Object.keys(p)).not.toContain("bankSlipUrl")
  })
})
