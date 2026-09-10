import { describe, expect, it } from "vitest"
import { carteiraResumo, contarCarteira } from "./relatorio-carteira"

const linhas = (...status: string[]) => status.map((s) => ({ status: s }))

describe("contarCarteira", () => {
  it("conta cada status separadamente", () => {
    const c = contarCarteira(
      linhas("ACTIVE", "ACTIVE", "SUSPENDED", "CANCELLED", "PENDING"),
    )
    expect(c).toEqual({
      total: 5,
      ativas: 2,
      pendentes: 1,
      suspensas: 1,
      canceladas: 1,
      outras: 0,
    })
  })

  it("status desconhecido cai em `outras` em vez de sumir do total", () => {
    const c = contarCarteira(linhas("ACTIVE", "MARCIANO"))
    expect(c.outras).toBe(1)
    expect(c.ativas + c.pendentes + c.suspensas + c.canceladas + c.outras).toBe(
      c.total,
    )
  })
})

describe("carteiraResumo", () => {
  /**
   * O caso que originou o modulo: a CDA tinha 19 ativas, 2 SUSPENDED e 10
   * canceladas, e o resumo antigo dizia "19 ativas · 31 no total · 10
   * canceladas" — faltavam 2 e ninguem sabia onde estavam.
   */
  it("as situacoes exibidas somam o total (as suspensas nao somem)", () => {
    const c = contarCarteira([
      ...linhas(...Array(19).fill("ACTIVE")),
      ...linhas("SUSPENDED", "SUSPENDED"),
      ...linhas(...Array(10).fill("CANCELLED")),
    ])
    const { valor, hint } = carteiraResumo(c)

    expect(valor).toBe("19 ativas")
    expect(hint).toBe("31 no total · 2 suspensas · 10 canceladas")

    const exibidas = [...hint.matchAll(/(\d+) (?!no total)/g)].reduce(
      (acc, m) => acc + Number(m[1]),
      0,
    )
    expect(exibidas + c.ativas).toBe(c.total)
  })

  it("omite a situacao que nao existe naquela carteira", () => {
    const { hint } = carteiraResumo(contarCarteira(linhas("ACTIVE", "ACTIVE")))
    expect(hint).toBe("2 no total")
  })

  it("concorda em numero com o singular", () => {
    const { valor, hint } = carteiraResumo(
      contarCarteira(linhas("ACTIVE", "SUSPENDED", "CANCELLED", "PENDING")),
    )
    expect(valor).toBe("1 ativa")
    expect(hint).toBe("4 no total · 1 pendente · 1 suspensa · 1 cancelada")
  })

  it("mostra o status desconhecido em vez de esconde-lo", () => {
    const { hint } = carteiraResumo(contarCarteira(linhas("ACTIVE", "MARCIANO")))
    expect(hint).toBe("2 no total · 1 em outro estado")
  })
})
