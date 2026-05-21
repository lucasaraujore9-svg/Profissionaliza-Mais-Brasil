import { prisma } from "@/lib/prisma"

/**
 * Cria ou atualiza um Student respeitando ambos unique constraints:
 *   @@unique([tenantId, email])
 *   @@unique([tenantId, cpf])
 *
 * O `upsert` padrão do Prisma só consulta por uma chave, então quando
 * o mesmo CPF já existe com email diferente (ou vice-versa), o create
 * falha com P2002.
 *
 * Estratégia (mesma ordem que `/api/painel/vendas` usava):
 *   1. Busca por CPF (constraint mais relevante para vendas).
 *   2. Se não achou, busca por email (mesmo tenant).
 *   3. Se achou em qualquer um, atualiza os outros campos.
 *   4. Se não achou, cria.
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

  // 2. Não achou por CPF; tenta por email
  const byEmail = await prisma.student.findFirst({
    where: { tenantId, email },
    select: { id: true },
  })

  if (byEmail) {
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

  // 3. Cria
  return prisma.student.create({
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
      status: "ATIVO",
    },
    select: SELECT,
  })
}
