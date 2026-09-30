import { describe, expect, it } from "vitest"
import { DEFAULT_POLICY } from "./policy"
import { lmsEnrollmentPolicyBody, parseOrderOverride, resolveEnrollmentPolicy } from "./order-override"

/* O que este arquivo protege: a ordem trocada num aluno depois da venda (1) vale
   para ele, (2) NAO apaga a cota nem o horario da unidade e (3) chega ao LMS
   mesmo quando o curso nao tem regra propria — sem isso o botao seria placebo. */

const unidade = { ...DEFAULT_POLICY, dailyLessonLimit: 3, accessStartMin: 480, accessEndMin: 1320 }

describe("parseOrderOverride", () => {
  it("null/lixo = sem override", () => {
    expect(parseOrderOverride(null)).toBeNull()
    expect(parseOrderOverride("x")).toBeNull()
    expect(parseOrderOverride([])).toBeNull()
  })

  it("pega so os campos da ordem", () => {
    expect(parseOrderOverride({ releaseMode: "DRIP", dripDays: 3, dripUnit: "LESSON", dailyLessonLimit: 9 })).toEqual({
      releaseMode: "DRIP",
      dripDays: 3,
      dripUnit: "LESSON",
    })
  })
})

describe("resolveEnrollmentPolicy", () => {
  it("override da matricula troca a ordem e preserva ritmo e horario", () => {
    const p = resolveEnrollmentPolicy(unidade, null, { releaseMode: "SEQUENTIAL" })
    expect(p.releaseMode).toBe("SEQUENTIAL")
    expect(p.dailyLessonLimit).toBe(3)
    expect(p.accessStartMin).toBe(480)
  })

  it("override da matricula vence o do curso", () => {
    const curso = { ...DEFAULT_POLICY, releaseMode: "DRIP", dripDays: 10 }
    const p = resolveEnrollmentPolicy(unidade, curso, { releaseMode: "FREE" })
    expect(p.releaseMode).toBe("FREE")
  })

  it("sem override segue curso/unidade", () => {
    expect(resolveEnrollmentPolicy(unidade, null, null).releaseMode).toBe("FREE")
  })
})

describe("lmsEnrollmentPolicyBody", () => {
  it("sem curso nem matricula = null (herda a unidade no LMS)", () => {
    expect(lmsEnrollmentPolicyBody(unidade, null, null)).toBeNull()
  })

  it("so com override da matricula manda a politica resolvida", () => {
    const body = lmsEnrollmentPolicyBody(unidade, null, { releaseMode: "SEQUENTIAL" })
    expect(body).toMatchObject({ releaseMode: "SEQUENTIAL", dailyLessonLimit: 3 })
  })

  it("so com curso continua mandando a regra do curso", () => {
    const curso = { ...DEFAULT_POLICY, releaseMode: "DRIP" }
    expect(lmsEnrollmentPolicyBody(unidade, curso, null)).toMatchObject({ releaseMode: "DRIP" })
  })
})
