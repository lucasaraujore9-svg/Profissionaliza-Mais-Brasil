import { describe, it, expect } from "vitest"
import {
  ordenarCarteira,
  parseDirecao,
  parseOrdem,
  proximaDirecao,
  type LinhaOrdenavel,
} from "./relatorio-ordem"

function linha(over: Partial<LinhaOrdenavel> & { name: string }): LinhaOrdenavel {
  return {
    status: "ACTIVE",
    entrouEm: new Date("2026-01-01T00:00:00Z"),
    pagamentosNoMes: [],
    recebidoNoMes: 0,
    naConta: false,
    valorNaConta: 0,
    ...over,
  }
}

const CARTEIRA: LinhaOrdenavel[] = [
  linha({ name: "Beta", status: "CANCELLED", recebidoNoMes: 0 }),
  linha({
    name: "Alfa",
    naConta: true,
    valorNaConta: 75,
    recebidoNoMes: 239,
    entrouEm: new Date("2026-07-10T00:00:00Z"),
  }),
  linha({
    name: "Gama",
    status: "SUSPENDED",
    naConta: true,
    valorNaConta: 75,
    recebidoNoMes: 100,
    entrouEm: new Date("2026-08-02T00:00:00Z"),
  }),
]

describe("parse", () => {
  it("coluna desconhecida cai no padrao — a URL vem do usuario", () => {
    expect(parseOrdem("select * from")).toBe("padrao")
    expect(parseOrdem(undefined)).toBe("padrao")
    expect(parseOrdem("recebido")).toBe("recebido")
  })

  it("direcao invalida vira desc", () => {
    expect(parseDirecao("qualquer")).toBe("desc")
    expect(parseDirecao("asc")).toBe("asc")
  })
})

describe("ordenarCarteira", () => {
  it("nao muta a lista recebida", () => {
    const antes = CARTEIRA.map((l) => l.name)
    ordenarCarteira(CARTEIRA, "nome", "asc")
    expect(CARTEIRA.map((l) => l.name)).toEqual(antes)
  })

  it("padrao abre pela conta, do maior valor ao menor", () => {
    const out = ordenarCarteira(CARTEIRA, "padrao", "desc")
    expect(out.map((l) => l.name)).toEqual(["Alfa", "Gama", "Beta"])
  })

  it("status ordena por SITUACAO: ativa antes, cancelada por ultimo", () => {
    const out = ordenarCarteira(CARTEIRA, "status", "desc")
    expect(out.map((l) => l.status)).toEqual([
      "ACTIVE",
      "SUSPENDED",
      "CANCELLED",
    ])
    // Alfabeticamente CANCELLED viria antes de SUSPENDED e a cancelada cairia
    // no meio da carteira viva.
    expect(out[2].status).toBe("CANCELLED")
  })

  it("recebido ordena por valor e inverte com a direcao", () => {
    expect(
      ordenarCarteira(CARTEIRA, "recebido", "desc").map((l) => l.name),
    ).toEqual(["Alfa", "Gama", "Beta"])
    expect(
      ordenarCarteira(CARTEIRA, "recebido", "asc").map((l) => l.name),
    ).toEqual(["Beta", "Gama", "Alfa"])
  })

  it("entrada ordena por data", () => {
    expect(
      ordenarCarteira(CARTEIRA, "entrada", "desc").map((l) => l.name),
    ).toEqual(["Gama", "Alfa", "Beta"])
  })

  it("nome desc e A→Z", () => {
    expect(ordenarCarteira(CARTEIRA, "nome", "desc").map((l) => l.name)).toEqual(
      ["Alfa", "Beta", "Gama"],
    )
  })

  it("empate desempata por nome — a ordem nao pode variar entre consultas", () => {
    // Duas linhas iguais em tudo menos no nome: sem o desempate, a ordem viria
    // do banco e o mesmo relatorio abriria diferente a cada carregamento.
    const empatadas = [
      linha({ name: "Zeta" }),
      linha({ name: "Alfa" }),
      linha({ name: "Mega" }),
    ]
    expect(
      ordenarCarteira(empatadas, "recebido", "desc").map((l) => l.name),
    ).toEqual(["Alfa", "Mega", "Zeta"])
  })
})

describe("proximaDirecao", () => {
  it("coluna nova comeca em desc (maior primeiro)", () => {
    expect(proximaDirecao("nome", "recebido", "asc")).toBe("desc")
  })

  it("clicar de novo na mesma coluna inverte", () => {
    expect(proximaDirecao("recebido", "recebido", "desc")).toBe("asc")
    expect(proximaDirecao("recebido", "recebido", "asc")).toBe("desc")
  })
})

describe("ordenar por 'Pago em'", () => {
  const comData = (name: string, iso: string | null) =>
    linha({
      name,
      pagamentosNoMes: iso ? [new Date(iso)] : [],
      recebidoNoMes: iso ? 239 : 0,
    })

  it("ordena pelo pagamento mais recente da competência", () => {
    const lista = [
      comData("Cedo", "2026-08-02T00:00:00Z"),
      comData("Tarde", "2026-08-28T00:00:00Z"),
      comData("Meio", "2026-08-15T00:00:00Z"),
    ]
    expect(ordenarCarteira(lista, "pagamento", "desc").map((l) => l.name)).toEqual(
      ["Tarde", "Meio", "Cedo"],
    )
    expect(ordenarCarteira(lista, "pagamento", "asc").map((l) => l.name)).toEqual(
      ["Cedo", "Meio", "Tarde"],
    )
  })

  it("quem NÃO pagou vai para o fim nas DUAS direções", () => {
    // Data ausente não é "muito antiga": no topo ela empurraria para baixo
    // justamente as linhas que a coluna existe para mostrar.
    const lista = [
      comData("SemPagamento", null),
      comData("Pagou", "2026-08-15T00:00:00Z"),
    ]
    expect(ordenarCarteira(lista, "pagamento", "desc").map((l) => l.name)).toEqual(
      ["Pagou", "SemPagamento"],
    )
    expect(ordenarCarteira(lista, "pagamento", "asc").map((l) => l.name)).toEqual(
      ["Pagou", "SemPagamento"],
    )
  })

  it("com duas faturas na competência, vale a mais recente", () => {
    const lista = [
      linha({
        name: "Duas",
        pagamentosNoMes: [
          new Date("2026-08-05T00:00:00Z"),
          new Date("2026-08-30T00:00:00Z"),
        ],
      }),
      comData("Uma", "2026-08-20T00:00:00Z"),
    ]
    expect(ordenarCarteira(lista, "pagamento", "desc").map((l) => l.name)).toEqual(
      ["Duas", "Uma"],
    )
  })
})
