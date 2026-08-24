import { describe, it, expect } from "vitest"
import {
  DEFAULT_RESELLER_SORT,
  RESELLER_SORT_FIRST_DIR,
  RESELLER_SORT_KEYS,
  RESELLER_SORT_LABELS,
  compareNextDue,
  parseResellerSort,
  resellerOrderBy,
  toggleResellerSort,
} from "./sort"

/*
 * A ordenação da lista de unidades.
 *
 * O que estes testes protegem não é o clique no cabeçalho: é o CONTRATO com o
 * route. Ele escolhe a estratégia de carregamento pelo `null` de
 * `resellerOrderBy` — coluna do banco ordena e corta na mesma consulta;
 * "vencimento" precisa ler as cobranças de TODAS as unidades do filtro antes de
 * decidir a página. Um `orderBy` inventado para "vencimento" (ou um `null`
 * novo em outra coluna) trocaria a estratégia em silêncio e a tela passaria a
 * mostrar "as 200 mais novas reordenadas" prometendo "as 200 mais atrasadas".
 */

function params(qs: string): URLSearchParams {
  return new URLSearchParams(qs)
}

describe("leitura da ordenação da query string", () => {
  it("sem parâmetros usa o padrão histórico da lista", () => {
    expect(parseResellerSort(params(""))).toEqual(DEFAULT_RESELLER_SORT)
  })

  it("coluna inventada cai no padrão em vez de derrubar a listagem", () => {
    expect(parseResellerSort(params("sort=senha&dir=asc"))).toEqual(
      DEFAULT_RESELLER_SORT,
    )
  })

  it("coluna válida sem direção assume a direção útil daquela coluna", () => {
    // MRR desce (a maior primeiro), vencimento sobe (a mais atrasada primeiro).
    expect(parseResellerSort(params("sort=mrr"))).toEqual({ key: "mrr", dir: "desc" })
    expect(parseResellerSort(params("sort=vencimento"))).toEqual({
      key: "vencimento",
      dir: "asc",
    })
  })

  it("direção inválida não vira filtro — volta para a padrão da coluna", () => {
    expect(parseResellerSort(params("sort=nome&dir=DROP"))).toEqual({
      key: "nome",
      dir: "asc",
    })
  })

  it("respeita a direção explícita", () => {
    expect(parseResellerSort(params("sort=nome&dir=desc"))).toEqual({
      key: "nome",
      dir: "desc",
    })
  })
})

describe("clique no cabeçalho", () => {
  it("mesma coluna inverte a direção", () => {
    expect(toggleResellerSort({ key: "mrr", dir: "desc" }, "mrr")).toEqual({
      key: "mrr",
      dir: "asc",
    })
  })

  it("coluna nova começa pela direção útil dela, não pela que estava na tela", () => {
    expect(toggleResellerSort({ key: "nome", dir: "desc" }, "alunos")).toEqual({
      key: "alunos",
      dir: "desc",
    })
    expect(toggleResellerSort({ key: "mrr", dir: "desc" }, "nome")).toEqual({
      key: "nome",
      dir: "asc",
    })
  })
})

describe("contrato com o route", () => {
  it("SÓ vencimento não é ordenável no banco", () => {
    const semOrderBy = RESELLER_SORT_KEYS.filter(
      (key) => resellerOrderBy({ key, dir: "asc" }) === null,
    )
    expect(semOrderBy).toEqual(["vencimento"])
  })

  it("toda coluna do banco desempata pelo cadastro (página determinística)", () => {
    for (const key of RESELLER_SORT_KEYS) {
      const orderBy = resellerOrderBy({ key, dir: "asc" })
      if (!orderBy) continue
      expect(orderBy.at(-1)).toHaveProperty("createdAt")
    }
  })

  it("a direção pedida chega ao banco", () => {
    expect(resellerOrderBy({ key: "mrr", dir: "asc" })?.[0]).toEqual({ planValue: "asc" })
    expect(resellerOrderBy({ key: "mrr", dir: "desc" })?.[0]).toEqual({ planValue: "desc" })
    expect(resellerOrderBy({ key: "alunos", dir: "desc" })?.[0]).toEqual({
      students: { _count: "desc" },
    })
    expect(resellerOrderBy({ key: "gerente", dir: "asc" })?.[0]).toEqual({
      accountManager: { name: "asc" },
    })
  })

  it("toda coluna tem rótulo e direção inicial — o seletor do mobile lista todas", () => {
    for (const key of RESELLER_SORT_KEYS) {
      expect(RESELLER_SORT_LABELS[key]).toBeTruthy()
      expect(["asc", "desc"]).toContain(RESELLER_SORT_FIRST_DIR[key])
    }
  })
})

describe("ordem por vencimento", () => {
  const a = { dueDate: "2026-08-01T00:00:00.000Z" }
  const b = { dueDate: "2026-09-01T00:00:00.000Z" }

  it("ascendente traz a mais atrasada primeiro", () => {
    expect(compareNextDue(a, b, "asc")).toBeLessThan(0)
  })

  it("descendente inverte", () => {
    expect(compareNextDue(a, b, "desc")).toBeGreaterThan(0)
  })

  it('"sem cobrança" fica por último NOS DOIS sentidos', () => {
    // A armadilha: nulo por último só no asc põe quem não deve nada no topo do
    // desc — e o clique de quem procura devedor mostra a lista errada.
    expect(compareNextDue(undefined, a, "asc")).toBeGreaterThan(0)
    expect(compareNextDue(undefined, a, "desc")).toBeGreaterThan(0)
    expect(compareNextDue(a, undefined, "asc")).toBeLessThan(0)
    expect(compareNextDue(a, undefined, "desc")).toBeLessThan(0)
    expect(compareNextDue(undefined, undefined, "asc")).toBe(0)
  })
})
