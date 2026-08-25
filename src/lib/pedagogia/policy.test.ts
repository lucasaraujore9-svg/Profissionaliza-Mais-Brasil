import { describe, expect, it } from "vitest"
import { DEFAULT_POLICY, isPolicyOpen, parsePolicy, resolvePolicy } from "./policy"

/* O que este arquivo protege: a POLITICA nunca pode nascer mais restritiva do
   que a unidade pediu. Todo campo invalido cai no lado destravado — um JSON
   corrompido no banco travaria alunos que pagaram, e o aluno nao tem como
   reclamar de uma regra que ninguem configurou. */

describe("parsePolicy", () => {
  it("lixo vira a politica aberta (comportamento historico)", () => {
    for (const raw of [null, undefined, 0, "", [], "FREE", { nope: 1 }]) {
      expect(parsePolicy(raw)).toEqual(DEFAULT_POLICY)
    }
  })

  it("modo desconhecido cai em FREE, nao em sequencial", () => {
    expect(parsePolicy({ releaseMode: "SEQUENCIAL" }).releaseMode).toBe("FREE")
    expect(parsePolicy({ releaseMode: "SEQUENTIAL" }).releaseMode).toBe("SEQUENTIAL")
  })

  it("cota de 0 ou negativa vira SEM cota — nunca uma trava permanente", () => {
    expect(parsePolicy({ dailyLessonLimit: 0 }).dailyLessonLimit).toBeNull()
    expect(parsePolicy({ dailyLessonLimit: -3 }).dailyLessonLimit).toBeNull()
    expect(parsePolicy({ dailyLessonLimit: 2.9 }).dailyLessonLimit).toBe(2)
    expect(parsePolicy({ dailyLessonLimit: 9999 }).dailyLessonLimit).toBe(100)
  })

  it("os sete dias marcados sao guardados como 'todos os dias'", () => {
    const p = parsePolicy({ accessDays: [0, 1, 2, 3, 4, 5, 6] })
    expect(p.accessDays).toEqual([])
    expect(isPolicyOpen(p)).toBe(true)
  })

  it("dias fora de 0..6 sao descartados e a lista sai unica e ordenada", () => {
    expect(parsePolicy({ accessDays: [5, 1, 1, 9, -2, 3.5] }).accessDays).toEqual([1, 5])
  })

  it("janela invertida e descartada INTEIRA — guardar meia janela fecharia 24h", () => {
    const p = parsePolicy({ accessStartMin: 1320, accessEndMin: 120 })
    expect(p.accessStartMin).toBeNull()
    expect(p.accessEndMin).toBeNull()
  })

  it("janela de duracao zero tambem e descartada", () => {
    const p = parsePolicy({ accessStartMin: 600, accessEndMin: 600 })
    expect(p.accessStartMin).toBeNull()
  })

  it("meia janela e valida: so 'a partir das' ou so 'ate as'", () => {
    expect(parsePolicy({ accessStartMin: 480 }).accessStartMin).toBe(480)
    expect(parsePolicy({ accessEndMin: 1320 }).accessEndMin).toBe(1320)
  })
})

describe("resolvePolicy", () => {
  it("o curso vence a unidade quando tem politica propria", () => {
    const r = resolvePolicy({ releaseMode: "SEQUENTIAL" }, { releaseMode: "DRIP", dripDays: 3 })
    expect(r.releaseMode).toBe("DRIP")
    expect(r.dripDays).toBe(3)
  })

  it("null no curso HERDA a unidade — nao significa 'sem regra'", () => {
    expect(resolvePolicy({ releaseMode: "SEQUENTIAL" }, null).releaseMode).toBe("SEQUENTIAL")
    expect(resolvePolicy({ releaseMode: "SEQUENTIAL" }, undefined).releaseMode).toBe("SEQUENTIAL")
  })

  it("override do curso NAO se mistura com o da unidade — vale inteiro", () => {
    // A unidade limita a 2 aulas/dia; o curso so define a ordem. O curso vence
    // por INTEIRO: herdar a cota daria uma terceira regra que ninguem escreveu.
    const r = resolvePolicy(
      { releaseMode: "FREE", dailyLessonLimit: 2 },
      { releaseMode: "SEQUENTIAL" },
    )
    expect(r.releaseMode).toBe("SEQUENTIAL")
    expect(r.dailyLessonLimit).toBeNull()
  })
})
