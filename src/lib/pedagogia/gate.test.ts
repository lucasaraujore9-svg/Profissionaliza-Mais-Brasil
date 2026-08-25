import { describe, expect, it } from "vitest"
import { parsePolicy, type PedagogyPolicy } from "./policy"
import { dripUnlockAt, lessonGate, nextWindowOpensAt, windowState, type LessonState } from "./gate"
import { brMinutesOfDay, brWeekday } from "./br-time"

/* O que este arquivo protege: as tres travas pedagogicas e a ORDEM entre elas.
   Todos os instantes sao construidos em UTC e afirmados no relogio BRASILEIRO —
   e ai que os erros aparecem: o servidor roda em UTC e uma janela "18:00 as
   22:00" comparada em UTC fecharia o acesso das 15h as 19h. */

/** 2026-08-25 e uma TERCA-feira. 12:00 BRT = 15:00 UTC. */
const ter12h = new Date("2026-08-25T15:00:00.000Z")
const ter08h = new Date("2026-08-25T11:00:00.000Z")
const ter23h = new Date("2026-08-26T02:00:00.000Z")

const P = (over: Partial<PedagogyPolicy> = {}) => parsePolicy({ ...over })

const state = (over: Partial<LessonState> = {}): LessonState => ({
  index: 0,
  moduleIndex: 0,
  done: false,
  previousDone: true,
  grantedAt: new Date("2026-08-24T12:00:00.000Z"), // vespera da terca de referencia
  completedToday: 0,
  ...over,
})

describe("br-time", () => {
  it("le o relogio brasileiro, nao o do servidor", () => {
    expect(brMinutesOfDay(ter12h)).toBe(12 * 60)
    expect(brWeekday(ter12h)).toBe(2) // terca
    // 02:00 UTC de quarta ainda e TERCA 23:00 no Brasil.
    expect(brWeekday(ter23h)).toBe(2)
    expect(brMinutesOfDay(ter23h)).toBe(23 * 60)
  })
})

describe("windowState", () => {
  it("sem dias e sem horas nunca fecha", () => {
    expect(windowState(P(), ter23h).open).toBe(true)
  })

  it("dentro e fora da faixa de horario", () => {
    const p = P({ accessStartMin: 9 * 60, accessEndMin: 18 * 60 })
    expect(windowState(p, ter12h).open).toBe(true)
    expect(windowState(p, ter08h).open).toBe(false)
    expect(windowState(p, ter23h).open).toBe(false)
  })

  it("o fim da janela e EXCLUSIVO — as 18:00 em ponto ja fechou", () => {
    const p = P({ accessStartMin: 9 * 60, accessEndMin: 18 * 60 })
    const dezoito = new Date("2026-08-25T21:00:00.000Z")
    expect(windowState(p, dezoito).open).toBe(false)
    expect(windowState(p, new Date(dezoito.getTime() - 60_000)).open).toBe(true)
  })

  it("dia da semana nao liberado fecha mesmo dentro do horario", () => {
    const p = P({ accessDays: [1, 3, 5], accessStartMin: 9 * 60, accessEndMin: 18 * 60 })
    expect(windowState(p, ter12h).open).toBe(false) // terca (2) fora da lista
  })

  it("fechado sempre diz QUANDO abre", () => {
    const p = P({ accessStartMin: 9 * 60, accessEndMin: 18 * 60 })
    const { opensAt } = windowState(p, ter08h)
    expect(opensAt).not.toBeNull()
    expect(brMinutesOfDay(opensAt!)).toBe(9 * 60)
    expect(opensAt!.toISOString()).toBe("2026-08-25T12:00:00.000Z")
  })

  it("depois de fechar, a abertura e no dia SEGUINTE", () => {
    const p = P({ accessStartMin: 9 * 60, accessEndMin: 18 * 60 })
    const at = nextWindowOpensAt(p, ter23h)!
    expect(at.toISOString()).toBe("2026-08-26T12:00:00.000Z")
  })

  it("pula os dias nao liberados ate achar o proximo", () => {
    // Terca 23h, aulas so as quintas (4).
    const p = P({ accessDays: [4], accessStartMin: 19 * 60 })
    const at = nextWindowOpensAt(p, ter23h)!
    expect(brWeekday(at)).toBe(4)
    expect(brMinutesOfDay(at)).toBe(19 * 60)
    expect(at.toISOString()).toBe("2026-08-27T22:00:00.000Z")
  })

  it("um unico dia da semana ja passado hoje volta so na semana seguinte", () => {
    // Terca 23h, janela so as tercas 09:00-18:00 — ja fechou hoje.
    const p = P({ accessDays: [2], accessStartMin: 9 * 60, accessEndMin: 18 * 60 })
    const at = nextWindowOpensAt(p, ter23h)!
    expect(at.toISOString()).toBe("2026-09-01T12:00:00.000Z")
  })
})

describe("gotejamento", () => {
  it("a primeira posicao abre na matricula — nao `dripDays` depois", () => {
    const p = P({ releaseMode: "DRIP", dripDays: 7 })
    const granted = new Date("2026-08-01T12:00:00.000Z")
    expect(dripUnlockAt(p, 0, granted).toISOString()).toBe(granted.toISOString())
    expect(dripUnlockAt(p, 2, granted).toISOString()).toBe("2026-08-15T12:00:00.000Z")
  })

  it("dripUnit MODULE libera o modulo inteiro de uma vez", () => {
    const p = P({ releaseMode: "DRIP", dripDays: 7, dripUnit: "MODULE" })
    // Aula 5 (index 4) do modulo 1: pela posicao do MODULO, e a 2a leva.
    const g = lessonGate(p, state({ index: 4, moduleIndex: 1 }), ter12h)
    expect(g.open).toBe(false)
    expect(g.reason).toBe("DRIP")
    expect(g.unlockAt!.toISOString()).toBe("2026-08-31T12:00:00.000Z")
    // Mesma aula, passados os 7 dias do modulo 1. A aula 1 do MESMO modulo abre
    // junto: e isso que "um modulo por semana" significa.
    const depois = new Date("2026-09-01T12:00:00.000Z")
    expect(lessonGate(p, state({ index: 4, moduleIndex: 1 }), depois).open).toBe(true)
    expect(lessonGate(p, state({ index: 3, moduleIndex: 1 }), ter12h).open).toBe(false)
  })

  it("dripUnit LESSON conta aula a aula", () => {
    const p = P({ releaseMode: "DRIP", dripDays: 1, dripUnit: "LESSON" })
    // Mesmo modulo, aulas diferentes: aqui a posicao que conta e a da AULA.
    const s = state({ index: 3, moduleIndex: 0 })
    expect(lessonGate(p, s, new Date("2026-08-26T12:00:00.000Z")).open).toBe(false)
    expect(lessonGate(p, s, new Date("2026-08-27T12:00:00.000Z")).open).toBe(true)
  })
})

describe("lessonGate", () => {
  it("politica aberta libera tudo", () => {
    expect(lessonGate(P(), state({ index: 9, previousDone: false }), ter23h).open).toBe(true)
  })

  it("sequencial exige a anterior concluida", () => {
    const p = P({ releaseMode: "SEQUENTIAL" })
    expect(lessonGate(p, state({ previousDone: false }), ter12h)).toMatchObject({
      open: false,
      reason: "SEQUENTIAL",
      unlockAt: null,
    })
    expect(lessonGate(p, state({ previousDone: true }), ter12h).open).toBe(true)
  })

  it("a cota diaria barra a proxima e diz que volta na virada do dia BR", () => {
    const p = P({ dailyLessonLimit: 3 })
    const g = lessonGate(p, state({ completedToday: 3 }), ter23h)
    expect(g).toMatchObject({ open: false, reason: "DAILY_LIMIT" })
    // Virada do dia BRASILEIRO: 00:00 BRT = 03:00 UTC.
    expect(g.unlockAt!.toISOString()).toBe("2026-08-26T03:00:00.000Z")
    expect(lessonGate(p, state({ completedToday: 2 }), ter23h).open).toBe(true)
  })

  it("REVISAO nunca e barrada por sequencia, gotejamento ou cota", () => {
    const p = P({ releaseMode: "SEQUENTIAL", dailyLessonLimit: 1 })
    const s = state({ done: true, previousDone: false, completedToday: 50 })
    expect(lessonGate(p, s, ter12h).open).toBe(true)

    const drip = P({ releaseMode: "DRIP", dripDays: 30 })
    expect(lessonGate(drip, state({ done: true, index: 9, moduleIndex: 9 }), ter12h).open).toBe(true)
  })

  it("mas a JANELA vale tambem para a revisao — ela e sobre QUANDO se estuda", () => {
    const p = P({ accessStartMin: 9 * 60, accessEndMin: 18 * 60 })
    expect(lessonGate(p, state({ done: true }), ter23h)).toMatchObject({
      open: false,
      reason: "WINDOW",
    })
  })

  it("a janela vem ANTES da sequencia — nao manda o aluno fazer algo que tambem nao vai funcionar", () => {
    const p = P({ releaseMode: "SEQUENTIAL", accessStartMin: 9 * 60, accessEndMin: 18 * 60 })
    const g = lessonGate(p, state({ previousDone: false }), ter23h)
    expect(g.reason).toBe("WINDOW")
    expect(g.unlockAt).not.toBeNull()
  })

  it("toda trava tem data OU uma acao clara — nenhuma fica sem saida", () => {
    const casos: [PedagogyPolicy, LessonState][] = [
      [P({ releaseMode: "SEQUENTIAL" }), state({ previousDone: false })],
      [P({ releaseMode: "DRIP", dripDays: 7 }), state({ index: 3, moduleIndex: 3 })], // libera so em 14/09
      [P({ dailyLessonLimit: 1 }), state({ completedToday: 1 })],
      [P({ accessStartMin: 9 * 60, accessEndMin: 18 * 60 }), state()],
    ]
    for (const [p, s] of casos) {
      const g = lessonGate(p, s, ter23h)
      expect(g.open).toBe(false)
      expect(g.reason === "SEQUENTIAL" || g.unlockAt instanceof Date).toBe(true)
    }
  })
})
