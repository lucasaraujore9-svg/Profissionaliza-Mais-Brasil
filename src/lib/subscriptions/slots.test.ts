import { describe, it, expect } from "vitest"
import type { EnrollmentStatus } from "@prisma/client"
import {
  SUBSCRIPTION_MAX_ACTIVE_COURSES,
  SLOT_OCCUPYING_STATUSES,
  canReleaseSubscriptionSlot,
  occupiesSubscriptionSlot,
  slotOccupyingWhere,
} from "./slots"

const ALL_STATUSES: EnrollmentStatus[] = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
  "COMPLETED",
]

describe("SUBSCRIPTION_MAX_ACTIVE_COURSES", () => {
  it("e 10 (decisao do dono)", () => {
    expect(SUBSCRIPTION_MAX_ACTIVE_COURSES).toBe(10)
  })
})

describe("occupiesSubscriptionSlot", () => {
  it("curso em andamento ocupa vaga", () => {
    expect(occupiesSubscriptionSlot({ status: "ACTIVE", progressStatus: "EM_ANDAMENTO" })).toBe(true)
  })

  it("curso recem-aberto, sem progresso sincronizado, ocupa vaga", () => {
    expect(occupiesSubscriptionSlot({ status: "ACTIVE", progressStatus: null })).toBe(true)
  })

  it("curso CONCLUIDO na plataforma nao ocupa, mesmo com a matricula ainda ATIVA", () => {
    // O certificado é emitido à mão em produção: a matrícula fica ACTIVE por dias
    // depois de o aluno terminar. Esperar o COMPLETED prenderia a vaga.
    expect(occupiesSubscriptionSlot({ status: "ACTIVE", progressStatus: "CONCLUIDO" })).toBe(false)
  })

  it("matricula COMPLETED nao ocupa", () => {
    expect(occupiesSubscriptionSlot({ status: "COMPLETED", progressStatus: null })).toBe(false)
  })

  it("curso tirado da lista (CANCELLED) nao ocupa", () => {
    expect(occupiesSubscriptionSlot({ status: "CANCELLED", progressStatus: null })).toBe(false)
  })

  it("PENDING e SUSPENDED ocupam: voltam a ATIVA sozinhas", () => {
    // De fora, o 11º curso voltaria por trás quando o pagamento confirmasse.
    expect(occupiesSubscriptionSlot({ status: "PENDING", progressStatus: null })).toBe(true)
    expect(occupiesSubscriptionSlot({ status: "SUSPENDED", progressStatus: null })).toBe(true)
  })
})

describe("slotOccupyingWhere · paridade com o predicado", () => {
  const where = slotOccupyingWhere("sub_1")

  it("escopa pela assinatura", () => {
    expect(where.studentSubscriptionId).toBe("sub_1")
  })

  it("usa exatamente os status do predicado", () => {
    const inWhere = (where.status as { in: EnrollmentStatus[] }).in
    for (const status of ALL_STATUSES) {
      expect(inWhere.includes(status)).toBe(
        occupiesSubscriptionSlot({ status, progressStatus: null }),
      )
    }
    expect(inWhere).toEqual(SLOT_OCCUPYING_STATUSES)
  })

  it("inclui progresso NULL explicitamente", () => {
    // `progress_status <> 'CONCLUIDO'` é NULL para quem nunca sincronizou: sem o
    // ramo `null`, todo curso recém-aberto ficaria fora da contagem e o limite
    // nunca seria atingido.
    expect(where.OR).toContainEqual({ progressStatus: null })
    expect(where.OR).toContainEqual({ progressStatus: { not: "CONCLUIDO" } })
  })
})

describe("canReleaseSubscriptionSlot", () => {
  it("curso da plataforma propria em andamento pode sair", () => {
    expect(
      canReleaseSubscriptionSlot({ status: "ACTIVE", progressStatus: null, provider: "LMS" }),
    ).toBe(true)
  })

  it("curso da plataforma legada NUNCA sai: la revogar apaga o progresso", () => {
    expect(
      canReleaseSubscriptionSlot({ status: "ACTIVE", progressStatus: null, provider: "EA" }),
    ).toBe(false)
  })

  it("curso que nao ocupa vaga nao tem o que liberar", () => {
    expect(
      canReleaseSubscriptionSlot({ status: "ACTIVE", progressStatus: "CONCLUIDO", provider: "LMS" }),
    ).toBe(false)
  })
})
