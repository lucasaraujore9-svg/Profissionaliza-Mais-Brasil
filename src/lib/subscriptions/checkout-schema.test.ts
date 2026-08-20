import { describe, it, expect } from "vitest"
import { PARENTESCOS } from "@/lib/students/guardian"
import { subscriptionCheckoutSchema } from "./checkout-schema"

/**
 * Trava do contrato de entrada da contratação de assinatura.
 *
 * Os dois defeitos que este arquivo existe para impedir mataram o produto
 * inteiro na revisão: o schema não declarava `nascimento` (o zod fazia strip e
 * TODA contratação voltava 400), e o formulário mandava o CPF do responsável no
 * nome errado (nenhum menor conseguia assinar).
 */

// O schema REAL da rota — não uma cópia. Um schema recriado no teste não
// protege a rota: foi assim que a falta de `nascimento` passou pela suíte.
const schema = subscriptionCheckoutSchema

/** Campos mínimos que a rota exige, fora o bloco do responsável. */
const BASE = {
  planId: "p1",
  nome: "Aluno Teste",
  email: "aluno@example.com",
  cpf: "39053344705",
  fone: "11988887777",
  paymentMethod: "PIX" as const,
  acceptedTerms: true as const,
}

const ADULTO = { ...BASE, nascimento: "1990-05-10" }

describe("schema de contratação de assinatura", () => {
  it("aceita adulto com data de nascimento", () => {
    const r = schema.safeParse(ADULTO)
    expect(r.success).toBe(true)
  })

  it("PRESERVA `nascimento` (sem a declaração, o zod fazia strip)", () => {
    // Era o defeito nº 1: sem `nascimento: nascimentoField` no objeto, o campo
    // sumia e o refine acusava "Informe a data de nascimento do aluno" mesmo
    // com a data preenchida — 400 em toda contratação.
    const r = schema.safeParse(ADULTO)
    expect(r.success && "nascimento" in r.data).toBe(true)
  })

  it("recusa quando falta a data de nascimento", () => {
    const r = schema.safeParse(BASE)
    expect(r.success).toBe(false)
  })

  it("menor SEM responsável é recusado", () => {
    const r = schema.safeParse({ ...BASE, nascimento: "2015-01-01" })
    expect(r.success).toBe(false)
  })

  it("menor COM responsável passa — e o campo é `responsavelCpf`", () => {
    // O formulário mandava `cpfResponsavel`; o schema lê `responsavelCpf`.
    // O CPF nunca chegava e nenhum menor conseguia assinar.
    const menor = {
      ...BASE,
      nascimento: "2015-01-01",
      responsavel: "Maria da Silva",
      responsavelCpf: "52998224725",
      responsavelEmail: "maria@example.com",
      responsavelFone: "11988887777",
      responsavelParentesco: "mae" as const,
    }
    expect(schema.safeParse(menor).success).toBe(true)

    const { responsavelCpf, ...semCpf } = menor
    void responsavelCpf
    expect(
      schema.safeParse({ ...semCpf, cpfResponsavel: "52998224725" }).success,
    ).toBe(false)
  })

  it("parentesco do formulário tem que existir no catálogo", () => {
    // O select oferecia "tio", "irmao" e "responsavel_legal", que não são
    // membros de PARENTESCOS — z.enum recusava e o usuário via 400 sem
    // explicação de campo.
    const base = {
      ...BASE,
      nascimento: "2015-01-01",
      responsavel: "Maria da Silva",
      responsavelCpf: "52998224725",
      responsavelEmail: "maria@example.com",
      responsavelFone: "11988887777",
    }
    for (const p of PARENTESCOS) {
      expect(
        schema.safeParse({ ...base, responsavelParentesco: p }).success,
      ).toBe(true)
    }
    for (const invalido of ["tio", "irmao", "responsavel_legal"]) {
      expect(
        schema.safeParse({ ...base, responsavelParentesco: invalido }).success,
      ).toBe(false)
    }
  })
})
