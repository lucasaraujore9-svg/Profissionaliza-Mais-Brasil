import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { LeadInquiryCard } from "./lead-inquiry-card"
import { CheckoutInquiryForm } from "./checkout-inquiry-form"

// LGPD-007: o checkbox de consentimento de contato deve nascer DESMARCADO
// (opt-in ativo), com o submit bloqueado até o titular marcar.
describe("consentimento de contato — default opt-in (LGPD-007)", () => {
  it("LeadInquiryCard: checkbox não vem marcado e o submit nasce desabilitado", () => {
    const html = renderToStaticMarkup(
      createElement(LeadInquiryCard, {
        courseSlug: "curso-x",
        courseName: "Curso X",
        escolaName: "Escola Y",
      }),
    )
    // consent=false → React omite o atributo `checked` do input do checkbox.
    expect(html).not.toContain("checked")
    // Submit bloqueado por !consent.
    expect(html).toContain("disabled")
  })

  it("CheckoutInquiryForm: checkbox não vem marcado e o submit nasce desabilitado", () => {
    const html = renderToStaticMarkup(
      createElement(CheckoutInquiryForm, {
        courseId: "c1",
        courseName: "Curso X",
        escolaName: "Escola Y",
      }),
    )
    expect(html).not.toContain("checked")
    expect(html).toContain("disabled")
  })
})
