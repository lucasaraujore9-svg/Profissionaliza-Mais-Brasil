import { Prisma, type StudentStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export class StudentEmailConflictError extends Error {
  readonly code = "STUDENT_EMAIL_CONFLICT"
  constructor(message: string) {
    super(message)
    this.name = "StudentEmailConflictError"
  }
}

/**
 * Cria ou atualiza um Student respeitando ambos unique constraints:
 *   @@unique([tenantId, email])
 *   @@unique([tenantId, cpf])
 *
 * O `upsert` padrão do Prisma só consulta por uma chave, então quando
 * o mesmo CPF já existe com email diferente (ou vice-versa), o create
 * falha com P2002.
 *
 * Estratégia:
 *   1. Busca por CPF (constraint mais relevante para vendas).
 *   2. Se não achou, busca por email — mas só reaproveita se o CPF do
 *      registro existente NÃO conflita com o CPF informado (evita
 *      sobrescrever CPF de outro aluno que use o mesmo email — comum em
 *      famílias compartilhando email).
 *   3. Se não achou, cria.
 *   4. Em race condition (dois checkouts concorrentes do mesmo CPF/email
 *      criam ao mesmo tempo), o Prisma lança P2002 — tratamos relendo
 *      e devolvendo o registro vencedor da corrida.
 */
export interface UpsertStudentInput {
  tenantId: string
  nome: string
  email: string
  cpf: string
  fone: string
  endereco?: string | null
  polo: string
  vendedorId: string | null
  plataformaAlunoIdFallback: string // ex: `pending_<timestamp>`
  /**
   * Status inicial quando o aluno é criado. Default: ATIVO (vitrines de
   * checkout direto, onde o aluno já forneceu seus dados). Em vendas
   * iniciadas pelo painel do revendedor/admin (aguardando aluno pagar),
   * use INTERESSADO para refletir que ele ainda não confirmou interesse
   * de compra pessoalmente.
   */
  initialStatus?: StudentStatus
}

export interface UpsertedStudent {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  fone: string | null
  asaasCustomerId: string | null
}

const SELECT = {
  id: true,
  nome: true,
  email: true,
  cpf: true,
  fone: true,
  asaasCustomerId: true,
} as const

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

export async function upsertStudent(
  input: UpsertStudentInput,
): Promise<UpsertedStudent> {
  const { tenantId, nome, email, cpf, fone, endereco } = input

  // 1. Tenta encontrar por CPF
  const byCpf = await prisma.student.findFirst({
    where: { tenantId, cpf },
    select: SELECT,
  })

  if (byCpf) {
    return prisma.student.update({
      where: { id: byCpf.id },
      data: {
        nome,
        email,
        fone,
        rua: endereco ?? undefined,
      },
      select: SELECT,
    })
  }

  // 2. Não achou por CPF; tenta por email — mas só reaproveita se o CPF
  // do registro existente coincidir (ou estiver vazio). Caso contrário
  // é OUTRO aluno usando o mesmo email (família, email genérico) e
  // sobrescrever o CPF dele seria corrupção de dados.
  const byEmail = await prisma.student.findFirst({
    where: { tenantId, email },
    select: { ...SELECT, cpf: true },
  })

  if (byEmail) {
    const existingCpf = byEmail.cpf?.replace(/\D/g, "") ?? null
    const incomingCpf = cpf.replace(/\D/g, "")
    if (!existingCpf || existingCpf === incomingCpf) {
      return prisma.student.update({
        where: { id: byEmail.id },
        data: {
          nome,
          cpf,
          fone,
          rua: endereco ?? undefined,
        },
        select: SELECT,
      })
    }
    // Email compartilhado entre alunos distintos: não dá pra criar com o
    // mesmo (tenantId, email) por causa do unique. Avisa o chamador para
    // que o aluno corrija o email antes de prosseguir.
    throw new StudentEmailConflictError(
      "Esse email ja esta em uso por outro aluno desta loja. Use um email diferente para concluir a matricula.",
    )
  }

  // 3. Cria. Race: dois checkouts paralelos do mesmo CPF/email podem
  // chegar aqui simultaneamente. O Prisma lança P2002 no segundo — relemos
  // e devolvemos o vencedor (o aluno já existe, o resto do checkout segue
  // normalmente como se fosse uma recompra).
  try {
    return await prisma.student.create({
      data: {
        tenantId,
        nome,
        email,
        cpf,
        fone,
        rua: endereco ?? undefined,
        polo: input.polo,
        vendedorId: input.vendedorId,
        plataformaAlunoId: input.plataformaAlunoIdFallback,
        status: input.initialStatus ?? "ATIVO",
      },
      select: SELECT,
    })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    // Recurso já criado por outra request — reusa o existente.
    const winner =
      (await prisma.student.findFirst({
        where: { tenantId, cpf },
        select: SELECT,
      })) ??
      (await prisma.student.findFirst({
        where: { tenantId, email },
        select: SELECT,
      }))
    if (winner) return winner
    throw err
  }
}
