import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import { NotificationTemplate } from "./notification"

describe("NotificationTemplate", () => {
  it("renderiza título, corpo e CTA com label customizado", async () => {
    const html = await render(
      NotificationTemplate({
        title: "Mensalidade 2/12 confirmada",
        body: "Pagamento de R$ 49,90 confirmado.",
        ctaUrl: "https://loja.example.com/aluno/pagamentos",
        ctaLabel: "Ver pagamentos",
      }),
    )
    expect(html).toContain("Mensalidade 2/12 confirmada")
    expect(html).toContain("Pagamento de R$ 49,90 confirmado.")
    expect(html).toContain("Ver pagamentos")
    expect(html).toContain("https://loja.example.com/aluno/pagamentos")
  })

  it("sem ctaUrl não renderiza botão; usa label default quando há URL sem label", async () => {
    const semBotao = await render(
      NotificationTemplate({ title: "Aviso", ctaUrl: null }),
    )
    expect(semBotao).not.toContain("Abrir")

    const comDefault = await render(
      NotificationTemplate({ title: "Aviso", ctaUrl: "https://x.example.com/y" }),
    )
    expect(comDefault).toContain("Abrir")
  })
})
