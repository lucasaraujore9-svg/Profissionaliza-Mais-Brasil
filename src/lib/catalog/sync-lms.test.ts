import { describe, it, expect } from "vitest"
import {
  mapCurriculumToMatriz,
  matrizForLmsCourse,
  flattenLmsLessonTitles,
} from "./sync-lms"
import type { LmsCurriculumItem, LmsModule } from "@/lib/lms"

function item(partial: Partial<LmsCurriculumItem>): LmsCurriculumItem {
  return {
    id: "c1",
    title: "Módulo",
    workloadHours: null,
    ementa: null,
    order: 0,
    ...partial,
  }
}

describe("mapCurriculumToMatriz", () => {
  it("ordena por `order` e mapeia cada item para o seu title", () => {
    const curriculum = [
      item({ title: "Módulo 2 — Instalações", order: 1 }),
      item({ title: "Módulo 1 — Fundamentos", order: 0 }),
    ]
    expect(mapCurriculumToMatriz(curriculum)).toEqual([
      "Módulo 1 — Fundamentos",
      "Módulo 2 — Instalações",
    ])
  })

  it("descarta títulos vazios/em branco e faz trim", () => {
    const curriculum = [
      item({ title: "  Introdução  ", order: 0 }),
      item({ title: "   ", order: 1 }),
      item({ title: "", order: 2 }),
    ]
    expect(mapCurriculumToMatriz(curriculum)).toEqual(["Introdução"])
  })

  it("[] enviado = matriz limpa de propósito (array vazio)", () => {
    expect(mapCurriculumToMatriz([])).toEqual([])
  })

  it("campo ausente (undefined) = null → o sync não mexe na matriz atual", () => {
    expect(mapCurriculumToMatriz(undefined)).toBeNull()
  })
})

function mod(title: string, order: number, lessons: string[]): LmsModule {
  return {
    id: `m${order}`,
    title,
    order,
    lessons: lessons.map((t, i) => ({
      id: `l${order}-${i}`,
      title: t,
      order: i,
      durationSec: 0,
      freePreview: false,
      materialCount: 0,
    })),
  }
}

describe("flattenLmsLessonTitles", () => {
  it("achata por `order` do módulo e depois da aula", () => {
    const modules = [mod("M2", 1, ["C", "D"]), mod("M1", 0, ["A", "B"])]
    expect(flattenLmsLessonTitles(modules)).toEqual(["A", "B", "C", "D"])
  })
})

describe("matrizForLmsCourse", () => {
  const modules = [mod("Módulo 1", 0, ["Aula 1 Boas vindas", "Aula 2 - Dicas"])]

  it("com grade no LMS, a grade vence (títulos preservados, sem limpeza)", () => {
    const grade = [
      { id: "c1", title: "Módulo 1 — Fundamentos", workloadHours: 2, ementa: null, order: 0 },
    ]
    expect(matrizForLmsCourse(grade, modules)).toEqual(["Módulo 1 — Fundamentos"])
  })

  it("sem grade (`[]`), a matriz vem das AULAS — nenhum curso fica sem matriz", () => {
    expect(matrizForLmsCourse([], modules)).toEqual(["Boas vindas", "Dicas"])
  })

  it("sem grade e sem aula → null: o sync NÃO limpa a matriz atual", () => {
    expect(matrizForLmsCourse([], [])).toBeNull()
    expect(matrizForLmsCourse(undefined, [])).toBeNull()
  })

  it("grade só de rótulos (\"Módulo 1\") é placeholder: a matriz vem das AULAS", () => {
    const placeholder = [
      { id: "c1", title: "Módulo 1", workloadHours: null, ementa: null, order: 0 },
    ]
    expect(matrizForLmsCourse(placeholder, modules)).toEqual(["Boas vindas", "Dicas"])
  })

  it("grade placeholder com detalhe falho → null (preserva a atual)", () => {
    const placeholder = [
      { id: "c1", title: "Módulo 1", workloadHours: null, ementa: null, order: 0 },
    ]
    expect(matrizForLmsCourse(placeholder, null)).toBeNull()
  })

  it("detalhe do LMS falhou (`modules` null) → null, mesmo sem grade", () => {
    expect(matrizForLmsCourse([], null)).toBeNull()
  })
})
