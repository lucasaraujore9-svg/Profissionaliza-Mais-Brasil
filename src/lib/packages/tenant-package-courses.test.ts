import { describe, expect, it } from "vitest"
import {
  checkTenantPackageCourses,
  tenantPackageCourseIssue,
  type TenantPackageCourse,
} from "./tenant-package-courses"

const T = "t_rota"

function curso(over: Partial<TenantPackageCourse> = {}): TenantPackageCourse {
  return {
    id: "c1",
    nome: "Instagram para Vendas",
    status: "ATIVO",
    authorTenantId: null,
    visibilityMode: "ALL",
    allowedTenantIds: [],
    blockedTenantIds: [],
    ...over,
  }
}

describe("tenantPackageCourseIssue", () => {
  it("curso ativo, liberado e da PMB pode entrar", () => {
    expect(tenantPackageCourseIssue(curso(), T)).toBeNull()
  })

  it("curso inativo não pode", () => {
    expect(tenantPackageCourseIssue(curso({ status: "INATIVO" }), T)).toBe("COURSE_INACTIVE")
  })

  it("curso restrito a outras unidades não pode; o liberado para ela pode", () => {
    expect(
      tenantPackageCourseIssue(curso({ visibilityMode: "ALLOWLIST", allowedTenantIds: ["outra"] }), T),
    ).toBe("COURSE_NOT_AVAILABLE_FOR_TENANT")
    expect(
      tenantPackageCourseIssue(curso({ visibilityMode: "ALLOWLIST", allowedTenantIds: [T] }), T),
    ).toBeNull()
  })

  it("curso de autoria de outra unidade não pode; o da própria unidade pode", () => {
    expect(tenantPackageCourseIssue(curso({ authorTenantId: "outra" }), T)).toBe(
      "AUTHORED_COURSE_ALONE",
    )
    expect(tenantPackageCourseIssue(curso({ authorTenantId: T }), T)).toBeNull()
  })
})

describe("checkTenantPackageCourses", () => {
  it("lista válida passa", () => {
    const a = curso({ id: "a" })
    const b = curso({ id: "b", nome: "Mídias sociais" })
    expect(checkTenantPackageCourses(["a", "b"], [a, b], T)).toEqual({ ok: true })
  })

  it("id que não existe é recusado", () => {
    const r = checkTenantPackageCourses(["a", "sumiu"], [curso({ id: "a" })], T)
    expect(r).toMatchObject({ ok: false, code: "INVALID_COURSES" })
  })

  // Caso real (Rota do Aprendizado, 15/09): o pacote guardava "Técnicas de
  // Vendas", desativado depois da montagem. A recusa genérica "um ou mais
  // cursos são inválidos" não dizia qual curso travava o salvamento.
  it("curso inativo é recusado NOMEANDO o curso", () => {
    const ativo = curso({ id: "ea_40" })
    const inativo = curso({ id: "ea_31", nome: "Técnicas de Vendas", status: "INATIVO" })
    const r = checkTenantPackageCourses(["ea_40", "ea_31"], [ativo, inativo], T)
    expect(r).toMatchObject({ ok: false, code: "COURSE_INACTIVE" })
    expect(r.ok === false && r.error).toContain("Técnicas de Vendas")
  })
})
