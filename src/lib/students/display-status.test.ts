import { describe, it, expect } from "vitest"
import type { EnrollmentStatus } from "@prisma/client"
import {
  isPaidEnrollment,
  deriveStudentDisplayStatus,
  countEnrollmentStatuses,
} from "./display-status"

// QA-008: status EXIBIDO do aluno é derivado (Student.status é manual, nasce
// ATIVO e não reflete pagamento). "PENDENTE" só aparece quando o aluno ainda
// ATIVO não tem matrícula paga mas tem pendente.

describe("isPaidEnrollment", () => {
  it("ACTIVE e COMPLETED contam como pagas", () => {
    expect(isPaidEnrollment("ACTIVE")).toBe(true)
    expect(isPaidEnrollment("COMPLETED")).toBe(true)
  })
  it("PENDING/CANCELLED/SUSPENDED não são pagas", () => {
    for (const s of ["PENDING", "CANCELLED", "SUSPENDED"] as EnrollmentStatus[]) {
      expect(isPaidEnrollment(s)).toBe(false)
    }
  })
})

describe("deriveStudentDisplayStatus", () => {
  it("status manual não-ATIVO tem prioridade e é preservado", () => {
    for (const s of ["BLOQUEADO", "DEVEDOR", "INATIVO", "FORMADO", "INTERESSADO"] as const) {
      expect(
        deriveStudentDisplayStatus(s, { paidEnrollments: 5, pendingEnrollments: 0 }),
      ).toBe(s)
    }
  })
  it("ATIVO com matrícula paga → ATIVO", () => {
    expect(
      deriveStudentDisplayStatus("ATIVO", { paidEnrollments: 1, pendingEnrollments: 3 }),
    ).toBe("ATIVO")
  })
  it("ATIVO sem paga mas com pendente → PENDENTE", () => {
    expect(
      deriveStudentDisplayStatus("ATIVO", { paidEnrollments: 0, pendingEnrollments: 1 }),
    ).toBe("PENDENTE")
  })
  it("ATIVO sem nenhuma matrícula (lead manual) → ATIVO", () => {
    expect(
      deriveStudentDisplayStatus("ATIVO", { paidEnrollments: 0, pendingEnrollments: 0 }),
    ).toBe("ATIVO")
  })
})

describe("countEnrollmentStatuses", () => {
  it("separa pagas de pendentes; ignora canceladas/suspensas na contagem de pendentes", () => {
    const counts = countEnrollmentStatuses([
      { status: "ACTIVE" },
      { status: "COMPLETED" },
      { status: "PENDING" },
      { status: "CANCELLED" },
      { status: "SUSPENDED" },
    ])
    expect(counts.paidEnrollments).toBe(2)
    expect(counts.pendingEnrollments).toBe(1)
  })
  it("lista vazia → zeros", () => {
    expect(countEnrollmentStatuses([])).toEqual({ paidEnrollments: 0, pendingEnrollments: 0 })
  })
})
