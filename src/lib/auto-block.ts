import { prisma } from "@/lib/prisma"
import { editarAluno } from "@/lib/escola-avancada/client"

export interface BlockResult {
  affectedStudents: number
  affectedEnrollments: number
  errors: string[]
}

/**
 * Bloqueia todos os alunos do tenant na Escola Avancada e marca as
 * matriculas ativas como SUSPENDED. Usado quando o tenant fica inadimplente
 * em modo billingMode=AUTO.
 */
export async function blockTenantStudents(tenantId: string): Promise<BlockResult> {
  const errors: string[] = []
  let affectedStudents = 0
  let affectedEnrollments = 0

  const students = await prisma.student.findMany({
    where: {
      tenantId,
      status: { notIn: ["BLOQUEADO", "INATIVO", "FORMADO"] },
    },
    select: { id: true, eaAlunoId: true, nome: true },
  })

  for (const student of students) {
    const eaId = Number.parseInt(student.eaAlunoId, 10)
    if (!Number.isFinite(eaId)) {
      errors.push(`student ${student.id}: ea_aluno_id invalido (${student.eaAlunoId})`)
      continue
    }

    try {
      await editarAluno({
        id_aluno: eaId,
        status: "bloqueado",
        apostila: "bloquear",
      })

      await prisma.student.update({
        where: { id: student.id },
        data: { status: "BLOQUEADO", apostila: "BLOQUEADA" },
      })

      const updated = await prisma.enrollment.updateMany({
        where: { studentId: student.id, status: "ACTIVE" },
        data: { status: "SUSPENDED" },
      })

      affectedStudents += 1
      affectedEnrollments += updated.count
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro desconhecido"
      errors.push(`student ${student.id}: ${msg}`)
    }
  }

  return { affectedStudents, affectedEnrollments, errors }
}

/**
 * Desbloqueia alunos do tenant, reativa matriculas suspensas.
 */
export async function unblockTenantStudents(tenantId: string): Promise<BlockResult> {
  const errors: string[] = []
  let affectedStudents = 0
  let affectedEnrollments = 0

  const students = await prisma.student.findMany({
    where: { tenantId, status: "BLOQUEADO" },
    select: { id: true, eaAlunoId: true },
  })

  for (const student of students) {
    const eaId = Number.parseInt(student.eaAlunoId, 10)
    if (!Number.isFinite(eaId)) {
      errors.push(`student ${student.id}: ea_aluno_id invalido`)
      continue
    }

    try {
      await editarAluno({
        id_aluno: eaId,
        status: "ativo",
        apostila: "liberar",
      })

      await prisma.student.update({
        where: { id: student.id },
        data: { status: "ATIVO", apostila: "LIBERADA" },
      })

      const updated = await prisma.enrollment.updateMany({
        where: { studentId: student.id, status: "SUSPENDED" },
        data: { status: "ACTIVE" },
      })

      affectedStudents += 1
      affectedEnrollments += updated.count
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro desconhecido"
      errors.push(`student ${student.id}: ${msg}`)
    }
  }

  return { affectedStudents, affectedEnrollments, errors }
}
