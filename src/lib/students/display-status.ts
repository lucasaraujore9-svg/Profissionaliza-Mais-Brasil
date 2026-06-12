import type { StudentStatus, EnrollmentStatus } from "@prisma/client"

/**
 * Status exibido do aluno: o enum manual do banco (`StudentStatus`) + o estado
 * derivado `PENDENTE` (pagamento ainda não confirmado).
 */
export type StudentDisplayStatus = StudentStatus | "PENDENTE"

/** Matrícula efetivamente paga: ativa ou já concluída. */
const PAID_ENROLLMENT_STATUSES: EnrollmentStatus[] = ["ACTIVE", "COMPLETED"]

export function isPaidEnrollment(status: EnrollmentStatus): boolean {
  return PAID_ENROLLMENT_STATUSES.includes(status)
}

/**
 * Deriva o status que deve aparecer na gestão de alunos.
 *
 * `Student.status` é um campo manual que nasce `ATIVO` por padrão e NUNCA é
 * atualizado pelo pagamento — quem só tem matrícula `PENDING` (nada pago)
 * continuava aparecendo como "Ativo". A regra:
 *
 * - Status definidos manualmente (`BLOQUEADO`, `DEVEDOR`, `INATIVO`, `FORMADO`,
 *   `INTERESSADO`) têm prioridade e são preservados como estão.
 * - Aluno ainda `ATIVO` com pelo menos uma matrícula paga → `ATIVO`.
 * - Aluno ainda `ATIVO`, sem matrícula paga, mas com matrícula pendente →
 *   `PENDENTE` (pagamento não confirmado).
 * - Aluno `ATIVO` sem nenhuma matrícula (lead cadastrado à mão) → `ATIVO`.
 */
export function deriveStudentDisplayStatus(
  storedStatus: StudentStatus,
  counts: { paidEnrollments: number; pendingEnrollments: number },
): StudentDisplayStatus {
  if (storedStatus !== "ATIVO") return storedStatus
  if (counts.paidEnrollments > 0) return "ATIVO"
  if (counts.pendingEnrollments > 0) return "PENDENTE"
  return "ATIVO"
}

/** Conta matrículas pagas/pendentes a partir de uma lista de status. */
export function countEnrollmentStatuses(
  enrollments: { status: EnrollmentStatus }[],
): { paidEnrollments: number; pendingEnrollments: number } {
  let paidEnrollments = 0
  let pendingEnrollments = 0
  for (const e of enrollments) {
    if (isPaidEnrollment(e.status)) paidEnrollments += 1
    else if (e.status === "PENDING") pendingEnrollments += 1
  }
  return { paidEnrollments, pendingEnrollments }
}
