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
