import { describe, it, expect } from "vitest"
import {
  competenciaPagamento,
  dataPagamentoCliente,
  resolverCompetencia,
} from "./competencia"

const dia = (d: Date | null) => d?.toISOString().slice(0, 10)

describe("competenciaPagamento — max(vencimento, pagamento)", () => {
  it("ANTECIPADO fica no mês da FATURA (caso Lira's)", () => {
    // Venceu 02/08 e pagou 30/07. Pela data do pagamento a mensalidade cairia
    // em julho e agosto ficaria sem ela — quem paga a fatura de agosto pagou
    // agosto, tenha adiantado ou não.
    expect(
      dia(
        competenciaPagamento({
          dueDate: "2026-08-02",
          clientPaymentDate: "2026-07-30",
          paymentDate: "2026-07-30",
        }),
      ),
    ).toBe("2026-08-02")
  })

  it("ATRASADO anda para o mês do PAGAMENTO (caso otymus)", () => {
    // Venceu 31/08 e pagou 05/09. Pelo vencimento cairia em agosto — mês que já
    // teria sido fechado e pago sem esse dinheiro.
    expect(
      dia(
        competenciaPagamento({
          dueDate: "2026-08-31",
          clientPaymentDate: "2026-09-05",
          paymentDate: "2026-09-05",
        }),
      ),
    ).toBe("2026-09-05")
  })

  it("no CARTÃO vale a data do cliente, não a do crédito em D+32", () => {
    // Cliente pagou 03/08 a fatura de 03/08; o Asaas creditou 04/09. Sem a data
    // do cliente a mensalidade seria lida como atrasada e iria para setembro.
    expect(
      dia(
        competenciaPagamento({
          dueDate: "2026-08-03",
          clientPaymentDate: "2026-08-03",
          paymentDate: "2026-09-04",
        }),
      ),
    ).toBe("2026-08-03")
  })

  it("pagou no dia do vencimento: os dois lados dão o mesmo mês", () => {
    expect(
      dia(
        competenciaPagamento({
          dueDate: "2026-08-10",
          clientPaymentDate: "2026-08-10",
          paymentDate: "2026-08-10",
        }),
      ),
    ).toBe("2026-08-10")
  })

  it("fatura em aberto NÃO tem competência", () => {
    // Gravar o vencimento sozinho faria uma fatura não paga contar como receita
    // do mês — exatamente o que a regra de comissão existe para impedir.
    expect(
      competenciaPagamento({
        dueDate: "2026-09-10",
        clientPaymentDate: null,
        paymentDate: null,
      }),
    ).toBeNull()
  })

  it("vencimento inválido não descarta o pagamento", () => {
    expect(
      dia(
        competenciaPagamento({
          dueDate: "",
          clientPaymentDate: "2026-08-03",
          paymentDate: null,
        }),
      ),
    ).toBe("2026-08-03")
  })
})

describe("dataPagamentoCliente", () => {
  it("prefere a data do cliente e cai no crédito quando ela falta", () => {
    expect(
      dia(
        dataPagamentoCliente({
          dueDate: "2026-08-01",
          clientPaymentDate: "2026-08-03",
          paymentDate: "2026-09-04",
        }),
      ),
    ).toBe("2026-08-03")
    expect(
      dia(
        dataPagamentoCliente({
          dueDate: "2026-08-01",
          clientPaymentDate: null,
          paymentDate: "2026-08-19",
        }),
      ),
    ).toBe("2026-08-19")
  })
})

describe("resolverCompetencia", () => {
  it("é o max das duas datas", () => {
    const venc = new Date("2026-08-02")
    const antes = new Date("2026-07-30")
    const depois = new Date("2026-09-05")
    expect(resolverCompetencia(venc, antes)).toBe(venc)
    expect(resolverCompetencia(venc, depois)).toBe(depois)
  })
})
