import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import { PaymentPendingTemplate } from "./payment-pending"

const baseProps = {
  studentName: "Carlos Lima",
  courseName: "Eletricista Predial",
  amount: "R$ 149,90",
  methodLabel: "boleto",
}

describe("PaymentPendingTemplate", () => {
  it("mostra curso, valor, método e botão de concluir quando há URL", async () => {
    const html = await render(
      PaymentPendingTemplate({
        ...baseProps,
        paymentUrl: "https://mp.example.com/boleto",
        dueDate: "30/06/2026",
      }),
    )
    expect(html).toContain("Eletricista Predial")
    expect(html).toContain("R$ 149,90")
    expect(html).toContain("boleto")
    expect(html).toContain("Concluir pagamento")
    expect(html).toContain("https://mp.example.com/boleto")
    expect(html).toContain("30/06/2026")
  })

  it("sem paymentUrl não renderiza o botão", async () => {
    const html = await render(
      PaymentPendingTemplate({ ...baseProps, paymentUrl: null }),
    )
    expect(html).not.toContain("Concluir pagamento")
  })
})
