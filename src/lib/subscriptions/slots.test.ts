import { describe, it, expect } from "vitest"
import type { EnrollmentStatus } from "@prisma/client"
import {
  SUBSCRIPTION_MAX_ACTIVE_COURSES,
  SLOT_OCCUPYING_STATUSES,
  canReleaseSubscriptionSlot,
  hasStartedCourse,
  occupiesSubscriptionSlot,
  slotOccupyingWhere,
  slotReleaseKeepsProgress,
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

describe("hasStartedCourse", () => {
  it("0% e AGUARDANDO: nunca abriu", () => {
    expect(hasStartedCourse({ progressPercent: 0, progressStatus: "AGUARDANDO" })).toBe(false)
  })

  it("0% e EM_ANDAMENTO: abriu a primeira aula e nao terminou — ja comecou", () => {
    // A legada arredonda para baixo: em producao havia 105 matriculas assim.
    expect(hasStartedCourse({ progressPercent: 0, progressStatus: "EM_ANDAMENTO" })).toBe(true)
  })

  it("qualquer percentual acima de zero ja comecou", () => {
    expect(hasStartedCourse({ progressPercent: 1, progressStatus: "AGUARDANDO" })).toBe(true)
  })

  it("sem progresso sincronizado nao prova nada — conta como nao comecado", () => {
    // Quem decide antes de desvincular e a conferencia AO VIVO do release.
    expect(hasStartedCourse({ progressPercent: null, progressStatus: null })).toBe(false)
  })
})

describe("slotReleaseKeepsProgress", () => {
  it("so a plataforma propria guarda o progresso fora da lista", () => {
    expect(slotReleaseKeepsProgress("LMS")).toBe(true)
    expect(slotReleaseKeepsProgress("EA")).toBe(false)
  })
})

describe("canReleaseSubscriptionSlot", () => {
  const base = { status: "ACTIVE" as const, progressStatus: null, progressPercent: null }

  it("curso da plataforma propria em andamento pode sair", () => {
    expect(
      canReleaseSubscriptionSlot({
        ...base,
        progressStatus: "EM_ANDAMENTO",
        progressPercent: 60,
        provider: "LMS",
      }),
    ).toBe(true)
  })

  it("curso da plataforma legada NAO COMECADO pode sair (nada a perder)", () => {
    expect(
      canReleaseSubscriptionSlot({
        ...base,
        progressStatus: "AGUARDANDO",
        progressPercent: 0,
        provider: "EA",
      }),
    ).toBe(true)
    expect(canReleaseSubscriptionSlot({ ...base, provider: "EA" })).toBe(true)
  })

  it("curso da plataforma legada JA COMECADO nao sai: la revogar apaga o progresso", () => {
    expect(
      canReleaseSubscriptionSlot({
        ...base,
        progressStatus: "EM_ANDAMENTO",
        progressPercent: 0,
        provider: "EA",
      }),
    ).toBe(false)
    expect(
      canReleaseSubscriptionSlot({
        ...base,
        progressStatus: "EM_ANDAMENTO",
        progressPercent: 35,
        provider: "EA",
      }),
    ).toBe(false)
  })

  it("curso que nao ocupa vaga nao tem o que liberar", () => {
    expect(
      canReleaseSubscriptionSlot({ ...base, progressStatus: "CONCLUIDO", provider: "LMS" }),
    ).toBe(false)
  })
})
