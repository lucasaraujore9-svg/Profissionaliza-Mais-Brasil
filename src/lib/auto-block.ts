import { prisma } from "@/lib/prisma"
import {
  blockStudentInEA,
  unblockStudentInEA,
} from "@/lib/students/plataforma-actions"
import { contextLogger } from "@/lib/logger"

export interface BlockResult {
  affectedStudents: number
  affectedEnrollments: number
  errors: string[]
}

// Concorrência limitada — evita estourar rate limit da plataforma de aulas.
const BATCH_SIZE = 8

async function runInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const slice = items.slice(i, i + BATCH_SIZE)
    await Promise.all(slice.map(fn))
  }
}

/**
 * Bloqueia todos os alunos do tenant na plataforma de aulas e marca as
 * matriculas ativas como SUSPENDED. Usado quando o tenant fica inadimplente
 * em modo billingMode=AUTO.
 *
 * Cada aluno passa pelo mesmo blockStudentInEA usado nas operacoes
 * individuais — a plataforma recebe a mesma chamada (editarAluno status=bloqueado)
 * em todos os caminhos.
 */
export async function blockTenantStudents(tenantId: string): Promise<BlockResult> {
  const log = contextLogger().child({ tenantId, action: "auto-block.tenant" })
  const errors: string[] = []
  let affectedStudents = 0
  let affectedEnrollments = 0

  const students = await prisma.student.findMany({
    where: {
      tenantId,
      status: { notIn: ["BLOQUEADO", "INATIVO", "FORMADO"] },
    },
    select: { id: true, plataformaAlunoId: true },
  })

  log.info({ event: "auto-block.start", count: students.length }, "iniciando bloqueio em massa")

  await runInBatches(students, async (student) => {
    try {
      await blockStudentInEA(student.id)
      const updated = await prisma.enrollment.updateMany({
        where: { studentId: student.id, status: "ACTIVE" },
        data: { status: "SUSPENDED" },
      })
      affectedStudents += 1
      affectedEnrollments += updated.count
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro desconhecido"
      errors.push(`student ${student.id}: ${msg}`)
      log.error(
        { err: error, event: "auto-block.student_failed", studentId: student.id },
        "falha ao bloquear aluno",
      )
    }
  })

  log.info(
    {
      event: "auto-block.done",
      affectedStudents,
      affectedEnrollments,
      errorCount: errors.length,
    },
    "bloqueio em massa concluído",
  )

  return { affectedStudents, affectedEnrollments, errors }
}

/**
 * Desbloqueia alunos do tenant, reativa matriculas suspensas. Cada aluno
 * passa por unblockStudentInEA — o caminho e identico ao desbloqueio
 * individual.
 */
export async function unblockTenantStudents(tenantId: string): Promise<BlockResult> {
  const log = contextLogger().child({ tenantId, action: "auto-unblock.tenant" })
  const errors: string[] = []
  let affectedStudents = 0
  let affectedEnrollments = 0

  const students = await prisma.student.findMany({
    where: { tenantId, status: "BLOQUEADO" },
    select: { id: true, plataformaAlunoId: true },
  })

  log.info({ event: "auto-unblock.start", count: students.length }, "iniciando desbloqueio em massa")

  await runInBatches(students, async (student) => {
    try {
      await unblockStudentInEA(student.id)
      const updated = await prisma.enrollment.updateMany({
        where: { studentId: student.id, status: "SUSPENDED" },
        data: { status: "ACTIVE" },
      })
      affectedStudents += 1
      affectedEnrollments += updated.count
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro desconhecido"
      errors.push(`student ${student.id}: ${msg}`)
      log.error(
        { err: error, event: "auto-unblock.student_failed", studentId: student.id },
        "falha ao desbloquear aluno",
      )
    }
  })

  log.info(
    {
      event: "auto-unblock.done",
      affectedStudents,
      affectedEnrollments,
      errorCount: errors.length,
    },
    "desbloqueio em massa concluído",
  )

  return { affectedStudents, affectedEnrollments, errors }
}
