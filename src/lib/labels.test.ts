import { describe, expect, it } from "vitest"
import {
  enrollmentStatusLabel,
  paymentGatewayLabel,
  paymentStatusLabel,
  paymentTypeLabel,
  referralCommissionStatusLabel,
  referralPayoutMethodLabel,
  referralPayoutStatusLabel,
  studentStatusLabel,
} from "./labels"

describe("rótulos dos enums", () => {
  it("traduz os valores crus do banco", () => {
    expect(enrollmentStatusLabel("PENDING")).toBe("Pendente")
    expect(paymentStatusLabel("CHARGED_BACK")).toBe("Chargeback")
    expect(paymentGatewayLabel("MP")).toBe("Mercado Pago")
    expect(referralPayoutMethodLabel("ASAAS_PIX")).toBe("PIX")
    expect(referralPayoutStatusLabel("REQUESTED")).toBe("Solicitado")
    expect(referralCommissionStatusLabel("AVAILABLE")).toBe("Disponível")
    expect(studentStatusLabel("DEVEDOR")).toBe("Inadimplente")
  })

  it("cobre PaymentType inteiro — o mapa antigo só conhecia ONE_TIME", () => {
    // O helper local que este módulo substituiu mapeava "INSTALLMENTS" e
    // "SUBSCRIPTION", que não existem no enum: MONTHLY, BOLETO_INSTALLMENT e
    // CARD_INSTALLMENT vazavam crus para a tela.
    expect(paymentTypeLabel("ONE_TIME")).toBe("Único")
    expect(paymentTypeLabel("MONTHLY")).toBe("Mensal")
    expect(paymentTypeLabel("BOLETO_INSTALLMENT")).toBe("Carnê (boleto)")
    expect(paymentTypeLabel("CARD_INSTALLMENT")).toBe("Parcelado no cartão")
  })

  it("rotula o status derivado PENDENTE do aluno", () => {
    expect(studentStatusLabel("PENDENTE")).toBe("Pendente")
  })

  it("mostra o valor cru em vez de sumir com o dado quando é desconhecido", () => {
    expect(enrollmentStatusLabel("FUTURO_STATUS")).toBe("FUTURO_STATUS")
  })

  it("usa travessão para ausência de valor", () => {
    expect(paymentGatewayLabel(null)).toBe("—")
    expect(paymentGatewayLabel(undefined)).toBe("—")
    expect(paymentGatewayLabel("")).toBe("—")
  })
})
