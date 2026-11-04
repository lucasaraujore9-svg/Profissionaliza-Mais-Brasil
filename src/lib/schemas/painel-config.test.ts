import { describe, expect, it } from "vitest"
import { painelConfigUpdateSchema } from "./painel-config"

// Login por CPF para conta de revenda (caso vanguardacursos, 2026-07-14): o
// CPF salvo aqui vira o identificador que o authorize consulta (User.cpf,
// unique, só dígitos). O contrato do schema: máscara é aceita mas o valor
// normaliza para 11 dígitos; vazio/ausente vira null (apagável); CPF com
// dígito verificador inválido é rejeitado.

const base = {
  name: "Maria da Silva",
  email: "Maria@Exemplo.com.br",
  companyName: "Vanguarda Cursos",
}

describe("painelConfigUpdateSchema — cpf", () => {
  it("aceita CPF com máscara e normaliza para 11 dígitos", () => {
    const parsed = painelConfigUpdateSchema.parse({
      ...base,
      cpf: "529.982.247-25",
    })
    expect(parsed.cpf).toBe("52998224725")
  })

  it("cpf ausente ou vazio vira null (campo apagável)", () => {
    expect(painelConfigUpdateSchema.parse(base).cpf).toBeNull()
    expect(painelConfigUpdateSchema.parse({ ...base, cpf: "" }).cpf).toBeNull()
    expect(painelConfigUpdateSchema.parse({ ...base, cpf: "  " }).cpf).toBeNull()
  })

  it("rejeita CPF com dígito verificador inválido", () => {
    const result = painelConfigUpdateSchema.safeParse({
      ...base,
      cpf: "123.456.789-00",
    })
    expect(result.success).toBe(false)
  })

  it("rejeita CPF de dígitos repetidos (111.111.111-11)", () => {
    const result = painelConfigUpdateSchema.safeParse({
      ...base,
      cpf: "111.111.111-11",
    })
    expect(result.success).toBe(false)
  })

  it("email normaliza para lower-case (comportamento preservado)", () => {
    const parsed = painelConfigUpdateSchema.parse(base)
    expect(parsed.email).toBe("maria@exemplo.com.br")
  })
})

// Telefone (User.phone): era coletado no cadastro da unidade e não tinha
// nenhuma tela onde pudesse ser conferido ou corrigido. Mesmo contrato do CPF —
// máscara aceita, valor normalizado, vazio apaga.
describe("painelConfigUpdateSchema — phone", () => {
  it("aceita máscara e normaliza para DDD + número", () => {
    expect(
      painelConfigUpdateSchema.parse({ ...base, phone: "(11) 99999-9999" }).phone,
    ).toBe("11999999999")
    expect(
      painelConfigUpdateSchema.parse({ ...base, phone: "+55 11 3333-4444" }).phone,
    ).toBe("1133334444")
  })

  it("telefone ausente ou vazio vira null (campo apagável)", () => {
    expect(painelConfigUpdateSchema.parse(base).phone).toBeNull()
    expect(painelConfigUpdateSchema.parse({ ...base, phone: "" }).phone).toBeNull()
    expect(painelConfigUpdateSchema.parse({ ...base, phone: "  " }).phone).toBeNull()
  })

  it("rejeita telefone incompleto", () => {
    expect(
      painelConfigUpdateSchema.safeParse({ ...base, phone: "99999-9999" }).success,
    ).toBe(false)
  })
})

// CNPJ da empresa (caso Meraki, 2026-11-04): o CNPJ era digitado no campo de
// CPF e o PUT respondia 400 "CPF inválido". Agora tem campo próprio.
describe("painelConfigUpdateSchema — cnpj", () => {
  it("aceita CNPJ com máscara e normaliza para 14 dígitos", () => {
    const parsed = painelConfigUpdateSchema.parse({ ...base, cnpj: "69.942.034/0001-00" })
    expect(parsed.cnpj).toBe("69942034000100")
  })

  it("ausente = não mexe (undefined); vazio = apaga (null)", () => {
    expect(painelConfigUpdateSchema.parse(base).cnpj).toBeUndefined()
    expect(painelConfigUpdateSchema.parse({ ...base, cnpj: "" }).cnpj).toBeNull()
  })

  it("rejeita CNPJ com dígito verificador inválido", () => {
    expect(painelConfigUpdateSchema.safeParse({ ...base, cnpj: "69.942.034/0001-01" }).success).toBe(false)
  })

  it("CNPJ continua recusado no campo de CPF (login de pessoa física)", () => {
    expect(painelConfigUpdateSchema.safeParse({ ...base, cpf: "69.942.034/0001-00" }).success).toBe(false)
  })
})
