import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { guardianRequirement, hasGuardian } from "@/lib/students/guardian"
import type {
  TitularityCandidate,
  TitularitySignal,
} from "./types"

export type { TitularityCandidate, TitularitySignal } from "./types"
export { SIGNAL_LABEL } from "./types"

/**
 * TITULARIDADE — encontrar cadastros em que o ALUNO é, na verdade, o
 * responsável (quase sempre a mãe).
 *
 * SEJA HONESTO SOBRE O LIMITE: não existe campo que diga "este registro está
 * errado". O nome da mãe é um nome de aluno perfeitamente válido. Tudo aqui
 * produz SUSPEITA, nunca verdade — a máquina ordena a fila, a pessoa decide.
 * Nada é corrigido automaticamente.
 *
 * O que NÃO funciona, registrado para ninguém propor de novo:
 *  - Idade pelo CPF: o CPF não codifica data de nascimento (o 9º dígito é
 *    região fiscal, não ano).
 *  - Mesmo CPF/e-mail com nomes diferentes no MESMO tenant: impossível por
 *    construção — `@@unique([tenantId, email])` e `@@unique([tenantId, cpf])`
 *    já impedem.
 *  - Divergência com o titular do cartão: `ccHolderName` não é persistido.
 *
 * Dimensionamento (produção, ago/2026): 230 alunos, 51 certificados em 17
 * alunos. Por isso os sinais são calculados NA HORA, sem model de fila nem cron
 * de varredura — seria over-engineering para uma tabela deste tamanho.
 */

/**
 * Telefone digitado pela própria unidade em vários cadastros. Acima deste corte
 * o número é claramente da loja, não de uma família — sem ele o sinal vira
 * ruído puro (a unidade que põe o próprio WhatsApp em tudo geraria dezenas de
 * falsos positivos).
 */
const MAX_FONE_OCORRENCIAS = 5

const NOME_CONTAMINADO =
  /\b(m[aã]e|pai|respons[aá]vel|tutor[a]?|filh[oa]|resp\.)\b/i

const PESO: Record<TitularitySignal, number> = {
  // Certificado emitido é o que dói: o documento errado já está na mão de
  // alguém. Vai para o topo mesmo sem nenhum outro sinal.
  CERTIFICADO_EMITIDO: 50,
  NOME_CONTAMINADO: 40,
  CPF_MULTI_NOME: 25,
  TELEFONE_REPETIDO: 15,
  MENOR_SEM_RESPONSAVEL: 60,
}

export interface ScanOptions {
  /** `null` = rede inteira (admin com `unidades.viewAll`). */
  tenantId: string | null
  /** Inclui os já marcados como revisados. */
  includeReviewed?: boolean
  /**
   * Recorte de CARTEIRA (`ctx.scope.alunos` no painel). Sem ele, o preset de
   * Vendedor — que tem `alunos.view`/`manage` e NÃO tem `alunos.viewAll` —
   * listaria nome, e-mail e CPF de TODOS os alunos da unidade, e poderia
   * reescrever qualquer um deles. Todas as outras rotas /api/painel/alunos*
   * aplicam este filtro.
   */
  scopeWhere?: Prisma.StudentWhereInput
}

export async function findTitularityCandidates(
  options: ScanOptions,
): Promise<TitularityCandidate[]> {
  const where: Prisma.StudentWhereInput = {
    ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    ...(options.scopeWhere ?? {}),
  }

  const students = await prisma.student.findMany({
    where,
    select: {
      id: true,
      nome: true,
      email: true,
      cpf: true,
      fone: true,
      nascimento: true,
      responsavel: true,
      cpfResponsavel: true,
      tenantId: true,
      titularidadeRevisadaEm: true,
      tenant: { select: { name: true } },
      _count: {
        select: {
          certificates: { where: { revokedAt: null } },
          enrollments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Agrupamentos em memória: a tabela é pequena (centenas de linhas) e um
  // groupBy por telefone normalizado não é expressável em Prisma sem SQL cru.
  const porFone = new Map<string, string[]>()
  const porCpf = new Map<string, Set<string>>()
  for (const s of students) {
    const fone = (s.fone ?? "").replace(/\D/g, "")
    if (fone.length >= 10) {
      porFone.set(fone, [...(porFone.get(fone) ?? []), s.nome])
    }
    const cpf = (s.cpf ?? "").replace(/\D/g, "")
    if (cpf.length === 11) {
      const set = porCpf.get(cpf) ?? new Set<string>()
      set.add(s.nome.trim().toLowerCase())
      porCpf.set(cpf, set)
    }
  }

  const out: TitularityCandidate[] = []
  for (const s of students) {
    const signals: TitularitySignal[] = []

    if (s._count.certificates > 0) signals.push("CERTIFICADO_EMITIDO")
    if (NOME_CONTAMINADO.test(s.nome)) signals.push("NOME_CONTAMINADO")

    const fone = (s.fone ?? "").replace(/\D/g, "")
    const nomesNoFone = fone.length >= 10 ? (porFone.get(fone) ?? []) : []
    if (
      nomesNoFone.length > 1 &&
      nomesNoFone.length <= MAX_FONE_OCORRENCIAS &&
      new Set(nomesNoFone.map((n) => n.trim().toLowerCase())).size > 1
    ) {
      signals.push("TELEFONE_REPETIDO")
    }

    const cpf = (s.cpf ?? "").replace(/\D/g, "")
    if (cpf.length === 11 && (porCpf.get(cpf)?.size ?? 0) > 1) {
      signals.push("CPF_MULTI_NOME")
    }

    // Só pega quem já tem data — ou seja, cadastros do fluxo novo. A base
    // legada (217 de 230 sem data) não é alcançada por este sinal, e é por isso
    // que a fila também lista quem tem certificado.
    if (guardianRequirement(s.nascimento) === "REQUIRED" && !hasGuardian(s)) {
      signals.push("MENOR_SEM_RESPONSAVEL")
    }

    if (signals.length === 0) continue
    if (!options.includeReviewed && s.titularidadeRevisadaEm) continue

    out.push({
      id: s.id,
      nome: s.nome,
      email: s.email,
      cpf: s.cpf,
      nascimento: s.nascimento ? s.nascimento.toISOString().slice(0, 10) : null,
      responsavel: s.responsavel,
      tenantId: s.tenantId,
      tenantName: s.tenant?.name ?? null,
      certificatesCount: s._count.certificates,
      enrollmentsCount: s._count.enrollments,
      signals,
      score: signals.reduce((acc, sig) => acc + PESO[sig], 0),
      revisadaEm: s.titularidadeRevisadaEm?.toISOString() ?? null,
    })
  }

  return out.sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome))
}
