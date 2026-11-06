import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import { InstallmentCardDeclinedTemplate } from "./installment-card-declined"

describe("InstallmentCardDeclinedTemplate", () => {
  it("diz que o cartão recusou, oferece PIX/boleto/outro cartão e leva ao link de pagamento", async () => {
    const html = await render(
      InstallmentCardDeclinedTemplate({
        studentName: "Carlos Lima",
        courseName: "Eletricista Predial",
        amount: "R$ 100,00",
        paymentUrl: "https://loja.example.com/pagar/enr1",
      }),
    )
    expect(html).toContain("Eletricista Predial")
    expect(html).toContain("R$ 100,00")
    expect(html).toContain("PIX, boleto ou outro cartão")
    expect(html).toContain("https://loja.example.com/pagar/enr1")
  })
})
