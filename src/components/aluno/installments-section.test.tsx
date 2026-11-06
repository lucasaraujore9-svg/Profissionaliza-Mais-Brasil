import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { InstallmentsSection, type InstallmentView } from "./installments-section"

const row = (over: Partial<InstallmentView>): InstallmentView => ({
  number: 2,
  amount: 100,
  dueDateISO: "2026-12-10T12:00:00.000Z",
  status: "GENERATED",
  available: false,
  availableFromISO: null,
  invoiceUrl: null,
  digitableLine: null,
  ...over,
})

const render = (p: InstallmentView) =>
  renderToStaticMarkup(
    <InstallmentsSection carnes={[{ id: "e1", courseName: "Curso", parcelas: [p] }]} />,
  )

describe("InstallmentsSection", () => {
  it("usa o rótulo da linha quando vem um", () => {
    expect(render(row({ label: "Entrada" }))).toContain("Entrada ·")
    expect(render(row({}))).toContain("Parcela 2 ·")
  })

  it("linha com cartão recusado e não paga mostra o estado; paga não", () => {
    const declined = "2026-12-01T00:00:00.000Z"
    expect(render(row({ cardDeclinedAt: declined }))).toContain("Cartão recusado")
    expect(render(row({ cardDeclinedAt: declined, status: "PAID" }))).not.toContain(
      "Cartão recusado",
    )
  })
})
