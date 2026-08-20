import { describe, it, expect } from "vitest"
import {
  planScopeWhere,
  vitrineGateWhere,
  planCourseWhere,
  planIncludesCourseWhere,
  type PlanScopeInput,
} from "./scope"

function plan(over: Partial<PlanScopeInput> = {}): PlanScopeInput {
  return {
    scope: "ALL",
    categoryIds: [],
    courseIds: [],
    packageId: null,
    ...over,
  }
}

describe("planScopeWhere", () => {
  it("ALL nao restringe por si — quem limita e o gate de vitrine", () => {
    expect(planScopeWhere(plan({ scope: "ALL" }))).toEqual({})
  })

  it("CATEGORY casa pelo JOIN, nao pela categoria principal", () => {
    // `Course.categoryId` e so a PRINCIPAL: filtrar por ele deixaria de fora o
    // curso que esta na categoria como secundaria.
    const w = planScopeWhere(
      plan({ scope: "CATEGORY", categoryIds: ["c1", "c2"] }),
    )
    expect(w).toEqual({
      categoryLinks: { some: { categoryId: { in: ["c1", "c2"] } } },
    })
    expect(JSON.stringify(w)).not.toContain('"categoryId":"c1"')
  })

  it("CATEGORY nao materializa ids de curso (escopo dinamico)", () => {
    // A garantia do produto: curso publicado depois entra sozinho. Se o `where`
    // trouxesse uma lista de cursos, o catalogo do assinante congelaria.
    const w = planScopeWhere(plan({ scope: "CATEGORY", categoryIds: ["c1"] }))
    expect(w).not.toHaveProperty("id")
  })

  it("PACKAGE usa os cursos do pacote resolvidos pelo caller", () => {
    expect(
      planScopeWhere(
        plan({ scope: "PACKAGE", packageId: "p1", packageCourseIds: ["a", "b"] }),
      ),
    ).toEqual({ id: { in: ["a", "b"] } })
  })

  it("COURSES usa a lista fixa", () => {
    expect(
      planScopeWhere(plan({ scope: "COURSES", courseIds: ["x"] })),
    ).toEqual({ id: { in: ["x"] } })
  })

  describe("plano mal configurado e fail-closed", () => {
    // Um `where` vazio aqui liberaria o CATALOGO INTEIRO — o oposto do que um
    // plano vazio significa. Melhor nao liberar nada e alguem perceber.
    it("CATEGORY sem categoria nao casa nada", () => {
      expect(planScopeWhere(plan({ scope: "CATEGORY" }))).toEqual({
        id: { in: [] },
      })
    })
    it("PACKAGE sem cursos nao casa nada", () => {
      expect(planScopeWhere(plan({ scope: "PACKAGE", packageId: "p1" }))).toEqual(
        { id: { in: [] } },
      )
    })
    it("COURSES sem lista nao casa nada", () => {
      expect(planScopeWhere(plan({ scope: "COURSES" }))).toEqual({
        id: { in: [] },
      })
    })
    it("ids vazios/undefined sao descartados antes da decisao", () => {
      expect(
        planScopeWhere(plan({ scope: "CATEGORY", categoryIds: ["", ""] })),
      ).toEqual({ id: { in: [] } })
    })
  })
})

describe("vitrineGateWhere", () => {
  it("PMB exige curso ativo, nao oculto e COM preco", () => {
    const gates = vitrineGateWhere(null)
    expect(gates).toContainEqual({ status: "ATIVO" })
    expect(gates).toContainEqual({ hiddenMain: false })
    // COURSE_HAS_PRICE: curso sem preço não aparece na vitrine, então também
    // não pode ser liberado por assinatura.
    expect(JSON.stringify(gates)).toContain("precoVitrineMain")
  })

  it("revenda exige TenantCourse visivel e com preco proprio", () => {
    // Sem isto a unidade liberaria, via assinatura, curso que ela NAO escolheu
    // vender na vitrine dela.
    const gates = vitrineGateWhere("t1")
    expect(gates).toContainEqual({
      tenantCourses: { some: { tenantId: "t1", isVisible: true, price: { gt: 0 } } },
    })
    // E a curadoria da PMB (ALLOWLIST/DENYLIST) continua valendo.
    expect(JSON.stringify(gates)).toContain("visibilityMode")
  })

  it("revenda NAO usa o gate de preco da vitrine mae", () => {
    // Na revenda o preco efetivo e o TenantCourse.price; aplicar
    // COURSE_HAS_PRICE ali barraria curso que a unidade precifica sozinha.
    expect(JSON.stringify(vitrineGateWhere("t1"))).not.toContain(
      "precoVitrineMain",
    )
  })
})

describe("planCourseWhere", () => {
  it("compoe tudo em AND — nunca por spread", () => {
    // COURSE_HAS_PRICE e visibilityFilter usam `OR` na raiz. Num spread os dois
    // viravam um `OR` so, e o curso passaria por ter preco OU ser visivel.
    const w = planCourseWhere(plan({ scope: "ALL" }), "t1")
    expect(Object.keys(w)).toEqual(["AND"])
    expect(Array.isArray(w.AND)).toBe(true)
    expect(w).not.toHaveProperty("OR")
  })

  it("mantem o escopo E os gates juntos", () => {
    const w = planCourseWhere(
      plan({ scope: "CATEGORY", categoryIds: ["c1"] }),
      null,
    )
    const and = w.AND as unknown[]
    expect(and[0]).toEqual({
      categoryLinks: { some: { categoryId: { in: ["c1"] } } },
    })
    expect(and).toContainEqual({ status: "ATIVO" })
  })

  it("plano fail-closed continua fail-closed depois da composicao", () => {
    const w = planCourseWhere(plan({ scope: "COURSES" }), null)
    expect((w.AND as unknown[])[0]).toEqual({ id: { in: [] } })
  })
})

describe("planIncludesCourseWhere", () => {
  it("deriva de planCourseWhere — o gate nao pode divergir da listagem", () => {
    // Se a checagem de um curso reimplementasse a regra, a tela ofereceria um
    // curso que o gate recusa (403 no proprio botao que ela desenhou).
    const p = plan({ scope: "CATEGORY", categoryIds: ["c1"] })
    const listagem = planCourseWhere(p, "t1")
    const gate = planIncludesCourseWhere(p, "t1", "curso-1")
    expect((gate.AND as unknown[])[0]).toEqual({ id: "curso-1" })
    expect((gate.AND as unknown[])[1]).toEqual(listagem)
  })
})
