import { describe, it, expect } from "vitest"
import { mapCurriculumToMatriz } from "./sync-lms"
import type { LmsCurriculumItem } from "@/lib/lms"

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
