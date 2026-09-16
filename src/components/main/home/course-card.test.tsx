import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CourseCard, type Course } from "./course-card"
import { interestFreeInstallmentText } from "@/lib/mercadopago/installments"

function course(over: Partial<Course> = {}): Course {
  return {
    slug: "excel",
    categoria: "Administrativo",
    titulo: "Excel",
    horas: "40h",
    preco: "R$ 100,00",
    parcelas: "",
    accent: "gold",
    ...over,
  }
}

// O Intl separa "R$" do número com espaço não quebrável; normaliza para ler.
const render = (c: Course) =>
  renderToStaticMarkup(<CourseCard course={c} />).replace(/ /g, " ")

describe("CourseCard — valor da parcela", () => {
  it("pagamento único mostra o preço E a parcela sem juros", () => {
    // O caso do pedido: R$ 100 com até 10x sem juros. O preço à vista continua
    // no card — a parcela é a alternativa, não substitui o total.
    const html = render(
      course({ parcelas: interestFreeInstallmentText(100, 10) ?? "" }),
    )
    expect(html).toContain("R$ 100,00")
    expect(html).toContain("ou 10x de R$ 10,00 sem juros")
  })

  it("sem parcela sem juros a anunciar, não desenha a linha", () => {
    const html = render(course({ parcelas: "" }))
    expect(html).toContain("R$ 100,00")
    expect(html).not.toContain("ou ")
    expect(html).not.toContain("sem juros")
  })

  it("mensalidade mantém a quantidade, sem o 'ou' da parcela", () => {
    const html = render(
      course({ preco: "R$ 39,90", parcelas: "10 mensalidades", paymentType: "MONTHLY" }),
    )
    expect(html).toContain("/mês")
    expect(html).toContain("10 mensalidades")
    expect(html).not.toContain("ou 10 mensalidades")
  })
})
