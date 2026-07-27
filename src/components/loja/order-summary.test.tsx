import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { OrderSummary } from "./order-summary"

describe("OrderSummary", () => {
  it("exibe o número e o valor reais das parcelas de um carnê", () => {
    const html = renderToStaticMarkup(
      <OrderSummary
        courseName="Combo educação"
        courseCategory="Pacote"
        courseHours={null}
        basePrice={300}
        discountAmount={0}
        finalPrice={300}
        couponCode={null}
        parcelasSugeridas={null}
        installmentPlan={{ count: 3, amount: 100, currentNumber: 1 }}
      />,
    )

    expect(html).toContain("Combo educação")
    expect(html).toContain("Parcela 1 de 3")
    expect(html).toContain("3x")
    expect(html).toContain("100,00")
    expect(html).toContain("total")
  })

  it("mantém o total separado do valor de cada parcela", () => {
    const html = renderToStaticMarkup(
      <OrderSummary
        courseName="Combo educação"
        courseCategory="Pacote"
        courseHours={null}
        basePrice={300}
        discountAmount={0}
        finalPrice={300}
        couponCode={null}
        parcelasSugeridas={null}
        installmentPlan={{ count: 3, amount: 100, currentNumber: 1 }}
      />,
    )

    expect(html).toContain("300,00")
    expect(html).toContain("100,00")
  })
})
