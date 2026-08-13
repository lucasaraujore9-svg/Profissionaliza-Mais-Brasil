import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  ageAtBrDay,
  buildGuardianWrite,
  guardianData,
  guardianRequirement,
  guardianShape,
  hasGuardian,
  isMinor,
  nascimentoField,
  normalizeGuardian,
  withGuardianRule,
} from "./guardian"

/** Data de NASCIMENTO: meia-noite UTC, igual ao que o Prisma grava. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/**
 * Instante "agora". Meio-dia UTC = 09:00 em Sao Paulo, entao o dia civil
 * brasileiro e inequivocamente `iso`. Usar meia-noite UTC aqui seria 21:00 do
 * dia ANTERIOR no Brasil — a armadilha que estes testes existem para pegar.
 */
const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe("ageAtBrDay", () => {
  it("conta anos completos", () => {
    expect(ageAtBrDay(d("2000-05-10"), at("2026-05-10"))).toBe(26)
  })

  it("nao adianta o aniversario: vespera ainda e a idade anterior", () => {
    expect(ageAtBrDay(d("2008-08-14"), at("2026-08-13"))).toBe(17)
    expect(ageAtBrDay(d("2008-08-13"), at("2026-08-13"))).toBe(18)
  })

  it("29/02 em ano nao bissexto vira 01/03", () => {
    // 28/02/2026 ainda e 17; 01/03/2026 ja e 18.
    expect(ageAtBrDay(d("2008-02-29"), at("2026-02-28"))).toBe(17)
    expect(ageAtBrDay(d("2008-02-29"), at("2026-03-01"))).toBe(18)
  })

  it("usa o DIA CIVIL BRASILEIRO, nao o UTC do servidor", () => {
    // 2026-08-13T02:00Z = 2026-08-12 23:00 em Sao Paulo. Quem faz 18 em 13/08
    // AINDA nao fez — o servidor em UTC diria que sim.
    const instante = new Date("2026-08-13T02:00:00.000Z")
    expect(ageAtBrDay(d("2008-08-13"), instante)).toBe(17)
  })
})

describe("isMinor / guardianRequirement", () => {
  it("null significa DESCONHECIDO, nunca adulto", () => {
    expect(isMinor(null)).toBeNull()
    expect(guardianRequirement(null)).toBe("UNKNOWN")
    expect(guardianRequirement(undefined)).toBe("UNKNOWN")
  })

  it("no dia do 18o aniversario a pessoa NAO e menor", () => {
    expect(isMinor(d("2008-08-13"), at("2026-08-13"))).toBe(false)
    expect(guardianRequirement(d("2008-08-13"), at("2026-08-13"))).toBe(
      "NOT_REQUIRED",
    )
  })

  it("um dia antes ainda e menor", () => {
    expect(isMinor(d("2008-08-14"), at("2026-08-13"))).toBe(true)
    expect(guardianRequirement(d("2008-08-14"), at("2026-08-13"))).toBe(
      "REQUIRED",
    )
  })
})

describe("hasGuardian", () => {
  it("exige nome E cpf — o par que o gateway usa", () => {
    expect(hasGuardian({ responsavel: "Maria", cpfResponsavel: "1" })).toBe(true)
    expect(hasGuardian({ responsavel: "Maria", cpfResponsavel: null })).toBe(
      false,
    )
    expect(hasGuardian({ responsavel: "  ", cpfResponsavel: "1" })).toBe(false)
    expect(hasGuardian({})).toBe(false)
  })
})

describe("normalizeGuardian", () => {
  it("devolve null quando nada foi informado", () => {
    expect(normalizeGuardian({})).toBeNull()
    expect(normalizeGuardian({ responsavel: "", responsavelCpf: "" })).toBeNull()
  })

  it("tira mascara do CPF e normaliza telefone", () => {
    const g = normalizeGuardian({
      responsavel: " Maria da Silva ",
      responsavelCpf: "529.982.247-25",
      responsavelFone: "+55 (31) 99999-8888",
      responsavelParentesco: "mae",
    })
    expect(g).toMatchObject({
      nome: "Maria da Silva",
      cpf: "52998224725",
      fone: "31999998888",
      parentesco: "Mãe",
    })
  })

  it("parentesco 'outro' usa o texto livre", () => {
    expect(
      normalizeGuardian({
        responsavel: "Ana",
        responsavelCpf: "52998224725",
        responsavelParentesco: "outro",
        responsavelParentescoOutro: "Madrinha",
      })?.parentesco,
    ).toBe("Madrinha")
  })
})

// ── A regra condicional ────────────────────────────────────────────────────

const CPF_ALUNO = "52998224725"
const CPF_RESP = "39053344705"
const NOW = at("2026-08-13")

const baseSchema = z.object({
  nome: z.string(),
  cpf: z.string(),
  nascimento: nascimentoField,
  ...guardianShape,
})

const schema = withGuardianRule(baseSchema, { now: NOW })

const menor = {
  nome: "João Pedro",
  cpf: CPF_ALUNO,
  nascimento: "2012-01-01",
}
const maior = { nome: "Ana", cpf: CPF_ALUNO, nascimento: "1990-01-01" }
const respOk = {
  responsavel: "Maria da Silva",
  responsavelCpf: CPF_RESP,
  responsavelEmail: "maria@exemplo.com",
  responsavelFone: "31999998888",
  responsavelParentesco: "mae" as const,
}

type ParseResult = { success: true } | { success: false; error: z.ZodError }

function erros(result: ParseResult): Record<string, string[] | undefined> {
  return result.success ? {} : z.flattenError(result.error).fieldErrors
}

describe("withGuardianRule", () => {
  it("maior de idade passa sem responsavel", () => {
    expect(schema.safeParse(maior).success).toBe(true)
  })

  it("MENOR SEM RESPONSAVEL E REJEITADO", () => {
    const r = schema.safeParse(menor)
    expect(r.success).toBe(false)
    expect(erros(r).responsavel?.[0]).toContain("menor de 18")
  })

  it("menor com responsavel completo passa", () => {
    expect(schema.safeParse({ ...menor, ...respOk }).success).toBe(true)
  })

  it("CPF do responsavel IGUAL ao do aluno e rejeitado", () => {
    // Sem esta trava a separacao vira no-op: o Asaas deduplica customer por
    // cpfCnpj e os dois papeis colapsariam no mesmo registro.
    const r = schema.safeParse({
      ...menor,
      ...respOk,
      responsavelCpf: CPF_ALUNO,
    })
    expect(r.success).toBe(false)
    expect(erros(r).responsavelCpf?.[0]).toContain("diferente")
  })

  it("CPF do responsavel invalido e rejeitado", () => {
    const r = schema.safeParse({
      ...menor,
      ...respOk,
      responsavelCpf: "11111111111",
    })
    expect(erros(r).responsavelCpf?.[0]).toContain("inválido")
  })

  it("exige email e telefone do responsavel (cobranca depende deles)", () => {
    const r = schema.safeParse({
      ...menor,
      ...respOk,
      responsavelEmail: "",
      responsavelFone: "",
    })
    expect(erros(r).responsavelEmail).toBeDefined()
    expect(erros(r).responsavelFone).toBeDefined()
  })

  it("data futura e rejeitada", () => {
    const r = schema.safeParse({ ...maior, nascimento: "2030-01-01" })
    expect(erros(r).nascimento?.[0]).toContain("futuro")
  })

  it("data absurda e rejeitada (o editSchema antigo aceitava 2999)", () => {
    const r = schema.safeParse({ ...maior, nascimento: "1800-01-01" })
    expect(erros(r).nascimento).toBeDefined()
  })

  it("adulto PODE ter responsavel (avo pagando pelo neto de 22)", () => {
    expect(schema.safeParse({ ...maior, ...respOk }).success).toBe(true)
  })

  it("remover a data de nascimento mantendo o responsavel e rejeitado", () => {
    const opcional = withGuardianRule(
      z.object({
        cpf: z.string(),
        nascimento: z.string().optional().or(z.literal("")),
        ...guardianShape,
      }),
      { requireNascimento: false, now: NOW },
    )
    const r = opcional.safeParse({ cpf: CPF_ALUNO, nascimento: "", ...respOk })
    expect(r.success).toBe(false)
    expect(erros(r).nascimento).toBeDefined()
  })

  it("sem data e sem responsavel passa quando a data e opcional (legado)", () => {
    const opcional = withGuardianRule(
      z.object({
        cpf: z.string(),
        nascimento: z.string().optional().or(z.literal("")),
        ...guardianShape,
      }),
      { requireNascimento: false, now: NOW },
    )
    expect(opcional.safeParse({ cpf: CPF_ALUNO, nascimento: "" }).success).toBe(
      true,
    )
  })

  it("declaracao e exigida quando pedida", () => {
    const comDecl = withGuardianRule(baseSchema, {
      now: NOW,
      requireDeclaracao: true,
    })
    expect(erros(comDecl.safeParse({ ...menor, ...respOk })).responsavelDeclaracao)
      .toBeDefined()
    expect(
      comDecl.safeParse({
        ...menor,
        ...respOk,
        responsavelDeclaracao: true,
      }).success,
    ).toBe(true)
  })
})

// ── Escrita tri-estado ─────────────────────────────────────────────────────

describe("guardianData", () => {
  it("undefined NAO menciona as colunas (update parcial nao apaga dado bom)", () => {
    expect(guardianData(undefined)).toEqual({})
  })

  it("null limpa as colunas explicitamente", () => {
    const data = guardianData(null)
    expect(data.responsavel).toBeNull()
    expect(data.cpfResponsavel).toBeNull()
    expect(data.responsavelDefinidoEm).toBeNull()
  })

  it("NAO limpa o customer Asaas do responsavel", () => {
    // E bookkeeping de gateway, nao PII do momento: limpa-lo com carne em aberto
    // obrigaria a re-resolver o customer no meio de uma cobranca.
    expect(guardianData(null)).not.toHaveProperty("responsavelAsaasCustomerId")
  })

  it("objeto grava e carimba a data de coleta", () => {
    const data = guardianData({
      nome: "Maria",
      cpf: CPF_RESP,
      rg: null,
      email: "m@e.com",
      fone: "31999998888",
      parentesco: "Mãe",
    })
    expect(data.responsavel).toBe("Maria")
    expect(data.responsavelDefinidoEm).toBeInstanceOf(Date)
  })
})

describe("buildGuardianWrite", () => {
  it("collected=false devolve tudo undefined (recompra nao recoleta)", () => {
    expect(buildGuardianWrite({ nascimento: "2012-01-01" }, { collected: false })).toEqual({
      nascimento: undefined,
      guardian: undefined,
    })
  })

  it("collected=true sem responsavel devolve null (remocao deliberada)", () => {
    const w = buildGuardianWrite({ nascimento: "1990-01-01" })
    expect(w.guardian).toBeNull()
    expect(w.nascimento).toEqual(d("1990-01-01"))
  })

  it("allowClear=false NUNCA remove — checkout publico so adiciona", () => {
    // Um checkout anonimo com data de adulto nao pode apagar o responsavel ja
    // verificado de um menor: a proxima cobranca iria para o CPF da crianca.
    const w = buildGuardianWrite(
      { nascimento: "1990-01-01" },
      { allowClear: false },
    )
    expect(w.guardian).toBeUndefined()
  })
})
