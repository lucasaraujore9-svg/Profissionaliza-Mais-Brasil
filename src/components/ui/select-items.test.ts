/**
 * O `<Select.Value>` do Base UI resolve o rótulo contra a prop `items` do Root.
 * Sem ela cai em `String(value)` e a tela mostra o valor cru do banco — o enum
 * ("consultant" no lugar de "Vendedor") ou o id ("cmb3x…" no lugar do nome).
 * O wrapper `Select` monta `items` a partir do JSX; é essa derivação que está
 * coberta aqui.
 */
import { createElement, Fragment, type ReactNode } from "react"
import { describe, expect, it } from "vitest"
import {
  collectSelectItems,
  nodeText,
  selectItemsSignature,
  serializeItemValue,
} from "./select-items"

/** Dublês dos componentes reais — a derivação só compara identidade de tipo. */
function ItemStub(_props: { value?: unknown; children?: ReactNode }) {
  return null
}
function ContentStub(_props: { children?: ReactNode }) {
  return null
}
function GroupStub(_props: { children?: ReactNode }) {
  return null
}

const isItem = (type: unknown) => type === ItemStub

function item(value: unknown, label: ReactNode) {
  return createElement(ItemStub, { key: String(value), value }, label)
}

describe("collectSelectItems", () => {
  it("mapeia o valor para o rótulo do item (enum -> nome legível)", () => {
    const children = createElement(
      ContentStub,
      null,
      item("manager", "Gerente"),
      item("consultant", "Vendedor"),
    )

    expect(collectSelectItems(children, isItem)).toEqual([
      { value: "manager", label: "Gerente" },
      { value: "consultant", label: "Vendedor" },
    ])
  })

  it("encontra itens gerados por .map(), o padrão das listas vindas do banco", () => {
    const membros = [
      { id: "cmb3xk10", nome: "Ana" },
      { id: "cmb3xk11", nome: "Bruno" },
    ]
    const children = createElement(
      ContentStub,
      null,
      membros.map((m) => item(m.id, m.nome)),
    )

    // O id nunca pode sobrar como rótulo — era exatamente o sintoma relatado.
    expect(collectSelectItems(children, isItem)).toEqual([
      { value: "cmb3xk10", label: "Ana" },
      { value: "cmb3xk11", label: "Bruno" },
    ])
  })

  it("desce por fragments e grupos aninhados", () => {
    const children = createElement(
      ContentStub,
      null,
      createElement(
        Fragment,
        null,
        createElement(GroupStub, null, item("MP", "Mercado Pago")),
      ),
      item("ASAAS", "Asaas"),
    )

    expect(collectSelectItems(children, isItem)).toEqual([
      { value: "MP", label: "Mercado Pago" },
      { value: "ASAAS", label: "Asaas" },
    ])
  })

  it("ignora elementos que não são itens e itens sem value", () => {
    const children = createElement(
      ContentStub,
      null,
      createElement("span", null, "cabeçalho"),
      createElement(ItemStub, { key: "sem-value" }, "sem value"),
      item("ok", "Ok"),
    )

    expect(collectSelectItems(children, isItem)).toEqual([
      { value: "ok", label: "Ok" },
    ])
  })

  it("não confunde o valor 0 com ausência de value", () => {
    const children = createElement(ContentStub, null, item(0, "Sem parcelamento"))

    expect(collectSelectItems(children, isItem)).toEqual([
      { value: 0, label: "Sem parcelamento" },
    ])
  })
})

describe("selectItemsSignature", () => {
  it("é estável quando os pares valor/rótulo não mudam", () => {
    const build = () =>
      collectSelectItems(
        createElement(ContentStub, null, item("a", "Ana"), item("b", "Bruno")),
        isItem,
      )

    expect(selectItemsSignature(build())).toBe(selectItemsSignature(build()))
  })

  it("muda quando um rótulo muda", () => {
    const antes = collectSelectItems(
      createElement(ContentStub, null, item("a", "Ana")),
      isItem,
    )
    const depois = collectSelectItems(
      createElement(ContentStub, null, item("a", "Ana Paula")),
      isItem,
    )

    expect(selectItemsSignature(antes)).not.toBe(selectItemsSignature(depois))
  })

  it("distingue itens diferentes que concatenariam igual sem separador", () => {
    const a = collectSelectItems(
      createElement(ContentStub, null, item("ab", "c")),
      isItem,
    )
    const b = collectSelectItems(
      createElement(ContentStub, null, item("a", "bc")),
      isItem,
    )

    expect(selectItemsSignature(a)).not.toBe(selectItemsSignature(b))
  })
})

describe("nodeText", () => {
  it("extrai o texto ignorando elementos sem conteúdo textual", () => {
    const label = createElement(
      Fragment,
      null,
      createElement("svg", null),
      "Mercado ",
      createElement("strong", null, "Pago"),
    )

    expect(nodeText(label)).toBe("Mercado Pago")
  })

  it("trata nulos e booleanos de render condicional como vazio", () => {
    expect(nodeText(null)).toBe("")
    expect(nodeText(undefined)).toBe("")
    expect(nodeText(false)).toBe("")
  })
})

describe("serializeItemValue", () => {
  it("serializa primitivos e objetos sem quebrar em ciclos", () => {
    expect(serializeItemValue("consultant")).toBe("consultant")
    expect(serializeItemValue(3)).toBe("3")
    expect(serializeItemValue({ id: "x" })).toBe('{"id":"x"}')

    const ciclico: Record<string, unknown> = {}
    ciclico.self = ciclico
    expect(serializeItemValue(ciclico)).toBe("[object]")
  })
})
