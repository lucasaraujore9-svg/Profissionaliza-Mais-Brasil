import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import { InstallmentAvailableTemplate } from "./installment-available"

describe("InstallmentAvailableTemplate", () => {
  it("avisa que a parcela está disponível, com valor, vencimento e o link de pagamento", async () => {
    const html = await render(
      InstallmentAvailableTemplate({
        studentName: "Ana Souza",
        courseName: "Eletricista Predial",
        amount: "R$ 150,00",
        dueDate: "15/11/2026",
        paymentUrl: "https://loja.example.com/pagar/enr1",
      }),
    )
    expect(html).toContain("Eletricista Predial")
    expect(html).toContain("R$ 150,00")
    expect(html).toContain("15/11/2026")
    expect(html).toContain("https://loja.example.com/pagar/enr1")
  })
})
