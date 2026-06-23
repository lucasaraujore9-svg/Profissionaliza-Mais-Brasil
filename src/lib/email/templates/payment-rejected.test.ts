import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import { PaymentRejectedTemplate } from "./payment-rejected"

const baseProps = {
  studentName: "Carlos Lima",
  courseName: "Eletricista Predial",
}

describe("PaymentRejectedTemplate", () => {
  it("convida a tentar de novo e mostra o motivo quando informado", async () => {
    const html = await render(
      PaymentRejectedTemplate({
        ...baseProps,
        retryUrl: "https://loja.example.com/curso/eletricista",
        reason: "o cartão foi recusado",
      }),
    )
    expect(html).toContain("Eletricista Predial")
    expect(html).toContain("Tentar novamente")
    expect(html).toContain("o cartão foi recusado")
    expect(html).toContain("https://loja.example.com/curso/eletricista")
  })

  it("sem retryUrl não renderiza o botão", async () => {
    const html = await render(
      PaymentRejectedTemplate({ ...baseProps, retryUrl: null }),
    )
    expect(html).not.toContain("Tentar novamente")
  })
})
