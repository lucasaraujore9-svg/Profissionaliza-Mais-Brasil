import { describe, expect, it } from "vitest"
import {
  asaasCustomerColumn,
  asaasCustomerUpdate,
  resolvePayer,
  type PayerSource,
} from "./payer"

const aluno: PayerSource = {
  id: "stu_1",
  nome: "João Pedro da Silva",
  email: "joao@exemplo.com",
  cpf: "52998224725",
  fone: "31988887777",
  responsavel: null,
  cpfResponsavel: null,
  responsavelEmail: null,
  responsavelFone: null,
  asaasCustomerId: "cus_aluno",
  responsavelAsaasCustomerId: null,
}

const comResponsavel: PayerSource = {
  ...aluno,
  responsavel: "Maria da Silva",
  cpfResponsavel: "39053344705",
  responsavelEmail: "maria@exemplo.com",
  responsavelFone: "31999998888",
  responsavelAsaasCustomerId: "cus_mae",
}

describe("resolvePayer", () => {
  it("sem responsavel, quem paga e o aluno", () => {
    const p = resolvePayer(aluno)
    expect(p.kind).toBe("STUDENT")
    expect(p.nome).toBe("João Pedro da Silva")
    expect(p.cpf).toBe("52998224725")
    expect(p.asaasCustomerId).toBe("cus_aluno")
  })

  it("com responsavel, quem paga e o responsavel", () => {
    const p = resolvePayer(comResponsavel)
    expect(p.kind).toBe("GUARDIAN")
    expect(p.nome).toBe("Maria da Silva")
    expect(p.cpf).toBe("39053344705")
    expect(p.email).toBe("maria@exemplo.com")
    expect(p.fone).toBe("31999998888")
  })

  it("NUNCA devolve o customer do aluno quando quem paga e o responsavel", () => {
    // Se estes se misturassem, o aluno passaria a cobrar na mae para sempre —
    // inclusive depois dos 18 — e o reuso do customer esconderia o erro.
    const p = resolvePayer(comResponsavel)
    expect(p.asaasCustomerId).toBe("cus_mae")
    expect(p.asaasCustomerId).not.toBe("cus_aluno")
  })

  it("exige nome E cpf do responsavel — so o nome nao basta", () => {
    expect(
      resolvePayer({ ...comResponsavel, cpfResponsavel: null }).kind,
    ).toBe("STUDENT")
    expect(resolvePayer({ ...comResponsavel, responsavel: null }).kind).toBe(
      "STUDENT",
    )
  })

  it("cai no contato do aluno se o responsavel nao tiver o seu", () => {
    // Melhor uma cobranca que chega no e-mail da familia do que uma que nao sai.
    const p = resolvePayer({
      ...comResponsavel,
      responsavelEmail: null,
      responsavelFone: null,
    })
    expect(p.email).toBe("joao@exemplo.com")
    expect(p.fone).toBe("31988887777")
  })

  it("e DATA-DRIVEN, nao CLOCK-DRIVEN", () => {
    // Nao ha parametro de data: o aluno que faz 18 no meio de um carne continua
    // cobrando o mesmo customer, sem assinatura orfa.
    expect(resolvePayer(comResponsavel).kind).toBe("GUARDIAN")
    expect(resolvePayer.length).toBe(1)
  })
})

describe("asaasCustomerColumn / asaasCustomerUpdate", () => {
  it("grava na coluna do aluno quando o aluno paga", () => {
    const p = resolvePayer(aluno)
    expect(asaasCustomerColumn(p)).toBe("asaasCustomerId")
    expect(asaasCustomerUpdate(p, "cus_novo")).toEqual({
      asaasCustomerId: "cus_novo",
    })
  })

  it("grava na coluna do responsavel quando o responsavel paga", () => {
    const p = resolvePayer(comResponsavel)
    expect(asaasCustomerColumn(p)).toBe("responsavelAsaasCustomerId")
    expect(asaasCustomerUpdate(p, "cus_novo")).toEqual({
      responsavelAsaasCustomerId: "cus_novo",
    })
    // A coluna do aluno NAO pode ser tocada.
    expect(asaasCustomerUpdate(p, "cus_novo")).not.toHaveProperty(
      "asaasCustomerId",
    )
  })
})
