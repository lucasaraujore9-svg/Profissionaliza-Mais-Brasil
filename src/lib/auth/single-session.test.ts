import { describe, it, expect } from "vitest"
import {
  lmsLoginEndsPmbSession,
  newStudentSessionId,
  studentSessionIsCurrent,
} from "./single-session"

describe("newStudentSessionId", () => {
  it("gera um id novo a cada login", () => {
    const a = newStudentSessionId()
    const b = newStudentSessionId()
    expect(a).not.toBe(b)
    expect(a.startsWith("pmb_")).toBe(true)
  })
})

describe("studentSessionIsCurrent", () => {
  it("a sessao do login mais recente vale", () => {
    expect(studentSessionIsCurrent({ sid: "pmb_2" }, "pmb_2")).toBe(true)
  })

  it("a sessao de um login ANTERIOR (outro aparelho) e recusada", () => {
    expect(studentSessionIsCurrent({ sid: "pmb_1" }, "pmb_2")).toBe(false)
  })

  it("JWT sem sid (emitido antes da regra) e recusado", () => {
    // Aceitar manteria vivos, por até 30 dias, os aparelhos que já dividem a
    // conta no dia do deploy.
    expect(studentSessionIsCurrent({}, "pmb_2")).toBe(false)
    expect(studentSessionIsCurrent({ sid: null }, null)).toBe(false)
  })

  it("sessao encerrada por login direto na plataforma (null no banco) e recusada", () => {
    expect(studentSessionIsCurrent({ sid: "pmb_1" }, null)).toBe(false)
  })

  it("'entrar como' do suporte nao disputa o lugar do aluno", () => {
    expect(studentSessionIsCurrent({ impersonatedBy: "user_admin" }, "pmb_2")).toBe(true)
    expect(studentSessionIsCurrent({ impersonatedBy: "user_admin" }, null)).toBe(true)
  })
})

describe("lmsLoginEndsPmbSession", () => {
  const login = new Date("2026-09-14T12:00:00Z")

  it("sessao daqui anterior ao login de la cai", () => {
    expect(
      lmsLoginEndsPmbSession(
        { activeSessionId: "pmb_1", activeSessionAt: new Date("2026-09-14T11:59:59Z") },
        login,
      ),
    ).toBe(true)
  })

  it("sessao daqui POSTERIOR ao login de la continua", () => {
    expect(
      lmsLoginEndsPmbSession(
        { activeSessionId: "pmb_1", activeSessionAt: new Date("2026-09-14T12:00:01Z") },
        login,
      ),
    ).toBe(false)
  })

  it("sem sessao ativa nao ha o que encerrar", () => {
    expect(lmsLoginEndsPmbSession({ activeSessionId: null, activeSessionAt: null }, login)).toBe(false)
  })
})
