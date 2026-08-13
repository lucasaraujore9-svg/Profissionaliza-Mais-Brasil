import { z } from "zod"
import { brDayStartUtc } from "@/lib/dates"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"

/**
 * RESPONSAVEL FINANCEIRO — fonte unica da regra.
 *
 * O problema que isto resolve: existia UMA identidade por venda. Como o gateway
 * exige um pagador adulto com CPF, os vendedores cadastravam a MAE como se fosse
 * a aluna — e o certificado, que le `Student.nome`/`Student.cpf` no ato da
 * emissao, saia no nome dela.
 *
 * A regra mora INTEIRA neste arquivo. Nenhuma rota reimplementa "e menor?" nem
 * "faltou responsavel?": elas espalham `guardianShape` no proprio z.object e
 * envolvem com `withGuardianRule`. O projeto ja pagou o preco de uma matriz
 * reimplementada a mao em 139 rotas (ver CLAUDE.md, "Papeis e permissoes do
 * sistema mae") — aqui o shape e o refine vem acoplados justamente para que
 * usar um sem o outro seja desconfortavel.
 */

export const MAIORIDADE = 18

/** Parentescos aceitos. `outro` exige `responsavelParentescoOutro`. */
export const PARENTESCOS = [
  "mae",
  "pai",
  "avo",
  "tutor",
  "outro",
] as const
export type Parentesco = (typeof PARENTESCOS)[number]

/**
 * A coluna guarda o RÓTULO ("Mãe"), não a chave — porque `outro` vira texto
 * livre. Para reabrir o select numa edição é preciso o caminho inverso; sem
 * ele, todo salvamento de um menor exigia re-escolher o parentesco e o PATCH
 * inteiro falhava com "Informe o parentesco".
 */
export function parentescoFromLabel(value: string | null): Parentesco | "" {
  if (!value) return ""
  const hit = PARENTESCOS.find(
    (p) => PARENTESCO_LABEL[p].toLowerCase() === value.trim().toLowerCase(),
  )
  return hit ?? "outro"
}

export const PARENTESCO_LABEL: Record<Parentesco, string> = {
  mae: "Mãe",
  pai: "Pai",
  avo: "Avó / Avô",
  tutor: "Tutor(a) legal",
  outro: "Outro",
}

/**
 * Anos COMPLETOS no dia civil brasileiro de `at`.
 *
 * `nascimento` e gravado como `new Date("YYYY-MM-DD")` = meia-noite UTC, e
 * `brDayStartUtc` devolve meia-noite UTC do dia civil brasileiro — os dois lados
 * sao "meia-noite UTC de uma data civil", entao a comparacao e exata.
 *
 * USAR getUTC*, NUNCA getFullYear()/getMonth() locais: o local funcionaria por
 * acidente no servidor (UTC) e erraria por um dia na maquina do dev (BRT).
 */
export function ageAtBrDay(nascimento: Date, at: Date = new Date()): number {
  const today = brDayStartUtc(at)
  const y = today.getUTCFullYear() - nascimento.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - nascimento.getUTCMonth()
  const dayDiff = today.getUTCDate() - nascimento.getUTCDate()
  // Aniversario ainda nao chegou neste ano => um ano a menos.
  // 29/02 em ano nao bissexto cai efetivamente em 01/03 (28/02 ainda e a idade
  // anterior), que e o tratamento civil usual e o que o Postgres faria.
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) return y - 1
  return y
}

/**
 * `null` significa DESCONHECIDO, nunca "adulto".
 *
 * Isso importa porque 217 dos 230 alunos em producao nao tem data de nascimento.
 * Tratar ausencia como maioridade seria uma afirmacao que nao temos como fazer;
 * tratar como minoridade travaria a recompra da maior fatia da base.
 */
export function isMinor(
  nascimento: Date | null | undefined,
  at: Date = new Date(),
): boolean | null {
  if (!nascimento) return null
  return ageAtBrDay(nascimento, at) < MAIORIDADE
}

export type GuardianRequirement = "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN"

/** UNKNOWN nunca bloqueia — cada superficie decide se cobra o preenchimento. */
export function guardianRequirement(
  nascimento: Date | null | undefined,
  at: Date = new Date(),
): GuardianRequirement {
  const minor = isMinor(nascimento, at)
  if (minor === null) return "UNKNOWN"
  return minor ? "REQUIRED" : "NOT_REQUIRED"
}

/** Um aluno "tem responsavel" quando ha nome E CPF — e o par que o gateway usa. */
export function hasGuardian(student: {
  responsavel?: string | null
  cpfResponsavel?: string | null
}): boolean {
  return Boolean(
    student.responsavel?.trim() && student.cpfResponsavel?.trim(),
  )
}

// ── Shape Zod compartilhado ────────────────────────────────────────────────

/**
 * Data de nascimento do ALUNO. Obrigatoria em toda porta de venda: sem ela nao
 * ha como saber quem e menor, e um checkbox "sou menor" seria autodeclaracao
 * (nao alimenta o certificado nem a plataforma de aulas).
 */
export const nascimentoField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento do aluno")

/** Mesma data, porem opcional — telas de edicao de cadastro legado. */
export const nascimentoFieldOptional = nascimentoField
  .optional()
  .or(z.literal(""))

/**
 * Campos do responsavel, para espalhar no z.object da rota. Todos opcionais
 * AQUI: a obrigatoriedade e condicional a idade e vive no `withGuardianRule`,
 * um lugar so.
 */
export const guardianShape = {
  responsavel: z.string().trim().min(3).max(120).optional().or(z.literal("")),
  responsavelCpf: z.string().trim().max(20).optional().or(z.literal("")),
  responsavelRg: z.string().trim().max(30).optional().or(z.literal("")),
  responsavelEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .optional()
    .or(z.literal("")),
  responsavelFone: z.string().trim().max(40).optional().or(z.literal("")),
  responsavelParentesco: z.enum(PARENTESCOS).optional(),
  responsavelParentescoOutro: z
    .string()
    .trim()
    .max(60)
    .optional()
    .or(z.literal("")),
  /**
   * Declaracao de responsabilidade legal. `docs/legal/TERMOS-DE-USO-ALUNO.md`
   * (secao 183) e a Politica de Privacidade (151) ja prometem isto ha tempos;
   * ate aqui o codigo nunca coletou.
   */
  responsavelDeclaracao: z.boolean().optional(),
} as const

export interface GuardianRawInput {
  responsavel?: string
  responsavelCpf?: string
  responsavelRg?: string
  responsavelEmail?: string
  responsavelFone?: string
  responsavelParentesco?: Parentesco
  responsavelParentescoOutro?: string
}

export interface NormalizedGuardian {
  nome: string
  cpf: string
  rg: string | null
  email: string | null
  fone: string | null
  parentesco: string
}

/** `null` = nada informado. Nao valida obrigatoriedade — isso e do refine. */
export function normalizeGuardian(
  input: GuardianRawInput,
): NormalizedGuardian | null {
  const nome = input.responsavel?.trim()
  const cpf = input.responsavelCpf ? stripCpf(input.responsavelCpf) : ""
  if (!nome && !cpf) return null

  const parentesco =
    input.responsavelParentesco === "outro"
      ? input.responsavelParentescoOutro?.trim() || "Outro"
      : input.responsavelParentesco
        ? PARENTESCO_LABEL[input.responsavelParentesco]
        : ""

  return {
    nome: nome ?? "",
    cpf,
    rg: input.responsavelRg?.trim() || null,
    email: input.responsavelEmail?.trim().toLowerCase() || null,
    fone: input.responsavelFone ? normalizePhone(input.responsavelFone) : null,
    parentesco,
  }
}

// ── Regra condicional ──────────────────────────────────────────────────────

export interface GuardianRuleOptions {
  /**
   * `true` na criacao (checkout, "novo aluno"), onde a data de nascimento e
   * obrigatoria. `false` nas telas de edicao de cadastro legado, onde exigir a
   * data retroativamente travaria 217 alunos.
   */
  requireNascimento?: boolean
  /** Declaracao de responsabilidade — exigida nas portas de VENDA. */
  requireDeclaracao?: boolean
  /**
   * Exigir e-mail/telefone/parentesco do responsavel. `true` nas portas de
   * VENDA (a cobranca precisa deles). `false` na correcao de titularidade de
   * cadastro LEGADO: ali o objetivo e consertar o NOME de um certificado
   * errado, e travar isso por um contato que a unidade nao tem em maos derruba
   * o unico caminho de remediacao que existe.
   */
  requireGuardianContact?: boolean
  /**
   * Recusar responsavel sem data de nascimento. `true` na EDICAO (limpar a data
   * mantendo o responsavel perderia o marcador que o justifica). `false` na
   * correcao de titularidade: 217 dos 230 alunos em producao NUNCA tiveram
   * data, e exigi-la ali bloquearia justamente os registros que precisam de
   * conserto.
   */
  requireNascimentoComResponsavel?: boolean
  /** Injetavel para teste; nunca passar em producao. */
  now?: Date
}

interface GuardianFields {
  nascimento?: string
  cpf?: string
  responsavel?: string
  responsavelCpf?: string
  responsavelEmail?: string
  responsavelFone?: string
  responsavelParentesco?: Parentesco
  responsavelParentescoOutro?: string
  responsavelDeclaracao?: boolean
}

/**
 * Aplica a regra do responsavel a um schema que ja espalhou `guardianShape` e
 * `nascimentoField`. Este e o UNICO lugar que decide "faltou responsavel".
 */
export function withGuardianRule<T extends GuardianFields>(
  schema: z.ZodType<T>,
  options: GuardianRuleOptions = {},
) {
  const {
    requireNascimento = true,
    requireDeclaracao = false,
    requireGuardianContact = true,
    requireNascimentoComResponsavel = true,
  } = options

  return schema.superRefine((data, ctx) => {
    const now = options.now ?? new Date()

    // ── Sanidade da data ────────────────────────────────────────────────
    let nascimento: Date | null = null
    if (data.nascimento) {
      nascimento = new Date(`${data.nascimento}T00:00:00.000Z`)
      if (Number.isNaN(nascimento.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nascimento"],
          message: "Data de nascimento inválida",
        })
        return
      }
      const today = brDayStartUtc(now)
      if (nascimento.getTime() > today.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nascimento"],
          message: "A data de nascimento não pode ser no futuro",
        })
        return
      }
      // O editSchema antigo aceitava 2999-01-01 sem reclamar.
      if (ageAtBrDay(nascimento, now) > 120) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nascimento"],
          message: "Data de nascimento inválida",
        })
        return
      }
    } else if (requireNascimento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nascimento"],
        message: "Informe a data de nascimento do aluno",
      })
    }

    const guardian = normalizeGuardian(data)
    const requirement = guardianRequirement(nascimento, now)

    // ── Limpar a data de nascimento mantendo o responsavel ──────────────
    // Sem isto, um menor perderia o marcador que justifica o responsavel e o
    // roteamento da cobranca ficaria orfao de explicacao.
    if (!nascimento && guardian && requireNascimentoComResponsavel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nascimento"],
        message:
          "Informe a data de nascimento do aluno para manter o responsável financeiro.",
      })
    }

    if (requirement === "REQUIRED" && !guardian) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavel"],
        message:
          "Aluno menor de 18 anos: informe o responsável financeiro. O certificado continua saindo no nome do aluno.",
      })
      return
    }

    if (!guardian) return

    // ── Validacao do bloco, quando existe (menor OU adulto pagando por outro)
    if (!guardian.nome || guardian.nome.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavel"],
        message: "Informe o nome completo do responsável",
      })
    }

    if (!guardian.cpf) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavelCpf"],
        message: "Informe o CPF do responsável",
      })
    } else if (!isValidCpf(guardian.cpf)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavelCpf"],
        message: "CPF do responsável inválido",
      })
    } else if (data.cpf && stripCpf(data.cpf) === guardian.cpf) {
      // SEM ISTO A SEPARACAO VIRA NO-OP: o findOrCreateAsaasCustomer deduplica
      // por cpfCnpj, entao aluno e responsavel com o mesmo CPF resolveriam para
      // o MESMO customer. E, na pratica, e o erro que produziu este projeto.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavelCpf"],
        message:
          "O CPF do responsável precisa ser diferente do CPF do aluno. O certificado sai no nome do ALUNO — o nome de quem paga vai em Responsável financeiro.",
      })
    }

    if (requireGuardianContact && !guardian.parentesco) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavelParentesco"],
        message: "Informe o parentesco",
      })
    }

    // Email e telefone do responsavel sao o contato da COBRANCA. O Mercado Pago
    // recusa a preferencia sem email do pagador (PAYER_EMAIL_MISSING) e o Asaas
    // manda o telefone na analise de risco do cartao.
    if (!guardian.email) {
      if (requireGuardianContact) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["responsavelEmail"],
          message:
            "Informe o e-mail do responsável (é para onde vai a cobrança)",
        })
      }
    } else if (!z.string().email().safeParse(guardian.email).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavelEmail"],
        message: "E-mail do responsável inválido",
      })
    }

    if (!guardian.fone) {
      if (requireGuardianContact) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["responsavelFone"],
          message: "Informe o telefone do responsável",
        })
      }
    } else if (!isValidPhone(guardian.fone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavelFone"],
        message: "Telefone do responsável inválido",
      })
    }

    if (requireDeclaracao && !data.responsavelDeclaracao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsavelDeclaracao"],
        message:
          "É preciso declarar que o responsável assume a contratação e o pagamento.",
      })
    }
  })
}

// ── Escrita tri-estado ─────────────────────────────────────────────────────

/**
 * `undefined` = nao coletado, NAO tocar as colunas (recompra, webhooks).
 * `null`      = coletado e ausente, LIMPAR as colunas (aluno virou maior).
 * objeto      = gravar + carimbar `responsavelDefinidoEm`.
 *
 * A distincao entre `undefined` e `null` e o que impede um update parcial de
 * apagar dado bom — e o que impede um dado obsoleto de sobreviver.
 */
export type GuardianWrite = undefined | null | NormalizedGuardian

/** Fragmento de `data` do Prisma. `{}` quando nao ha nada a escrever. */
export function guardianData(write: GuardianWrite): {
  responsavel?: string | null
  cpfResponsavel?: string | null
  rgResponsavel?: string | null
  responsavelEmail?: string | null
  responsavelFone?: string | null
  responsavelParentesco?: string | null
  responsavelDefinidoEm?: Date | null
} {
  if (write === undefined) return {}
  if (write === null) {
    return {
      responsavel: null,
      cpfResponsavel: null,
      rgResponsavel: null,
      responsavelEmail: null,
      responsavelFone: null,
      responsavelParentesco: null,
      responsavelDefinidoEm: null,
      // responsavelAsaasCustomerId NAO e limpo aqui de proposito: e bookkeeping
      // de gateway, nao PII do momento. Limpa-lo com carne em aberto obrigaria a
      // re-resolver o customer no meio de uma cobranca. So a anonimizacao LGPD
      // o apaga (src/lib/students/pii.ts).
    }
  }
  return {
    responsavel: write.nome,
    cpfResponsavel: write.cpf,
    rgResponsavel: write.rg,
    responsavelEmail: write.email,
    responsavelFone: write.fone,
    responsavelParentesco: write.parentesco,
    responsavelDefinidoEm: new Date(),
  }
}

/**
 * Traduz o corpo ja validado para o par (nascimento, guardian) que
 * `upsertStudent` e `applyStudentEdit` consomem.
 *
 * `collected` distingue "o formulario nao tem esses campos" (recompra) de "o
 * formulario tem e veio vazio" (remocao deliberada).
 */
export function buildGuardianWrite(
  data: GuardianFields,
  options: {
    /** `false` quando o formulario nao tem os campos (recompra, webhooks). */
    collected?: boolean
    /**
     * `false` = o fluxo pode ADICIONAR responsavel, mas nunca REMOVER.
     *
     * Usado nos checkouts PUBLICOS: eles sao anonimos, e qualquer pessoa com o
     * CPF/e-mail de um aluno poderia refazer o checkout digitando uma data de
     * adulto e apagar o responsavel ja verificado — mandando a proxima cobranca
     * para o CPF do menor. Remocao e ato de bastidor (telas de gestao).
     */
    allowClear?: boolean
  } = {},
): { nascimento: Date | null | undefined; guardian: GuardianWrite } {
  const { collected = true, allowClear = true } = options
  if (!collected) return { nascimento: undefined, guardian: undefined }
  const nascimento = data.nascimento
    ? new Date(`${data.nascimento}T00:00:00.000Z`)
    : null
  const guardian = normalizeGuardian(data)
  return {
    nascimento,
    // `undefined` faz o upsert nao mencionar as colunas — preserva o que existe.
    guardian: guardian ?? (allowClear ? null : undefined),
  }
}
