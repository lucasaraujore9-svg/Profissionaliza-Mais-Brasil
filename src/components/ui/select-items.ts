/**
 * Derivação do mapa valor → rótulo de um `<Select>` a partir do próprio JSX.
 *
 * Vive fora de `select.tsx` para ser puro (só React, sem Base UI e sem DOM) e
 * portanto testável no ambiente `node` do vitest. Quem usa é o wrapper `Select`;
 * o porquê está documentado lá.
 */
import * as React from "react"

export type DerivedItem = { value: unknown; label: React.ReactNode }

/** Identifica o componente que representa um item (`SelectItem`). */
export type IsSelectItem = (type: unknown) => boolean

/**
 * Texto puro de um nó React — usado só como assinatura de mudança dos rótulos.
 * Ícones e outros elementos sem texto contribuem com string vazia.
 */
export function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return nodeText(node.props.children)
  }
  return ""
}

export function serializeItemValue(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value)
    } catch {
      return "[object]"
    }
  }
  return String(value)
}

/**
 * Percorre o JSX à procura dos itens para montar o mapa valor → rótulo.
 *
 * A recursão desce por qualquer elemento (SelectContent, SelectGroup, fragments,
 * arrays de `.map()`), mas enxerga apenas o que está literalmente no JSX: itens
 * renderizados por dentro de um componente próprio não são encontrados — nesse
 * caso, passe `items` na mão para o `<Select>`.
 */
export function collectSelectItems(
  node: React.ReactNode,
  isSelectItem: IsSelectItem,
): DerivedItem[] {
  const out: DerivedItem[] = []
  walk(node, isSelectItem, out)
  return out
}

function walk(
  node: React.ReactNode,
  isSelectItem: IsSelectItem,
  out: DerivedItem[],
): void {
  React.Children.forEach(node, (child) => {
    if (
      !React.isValidElement<{ children?: React.ReactNode; value?: unknown }>(child)
    ) {
      return
    }
    if (isSelectItem(child.type)) {
      if (child.props.value !== undefined) {
        out.push({ value: child.props.value, label: child.props.children })
      }
      return
    }
    if (child.props.children != null) walk(child.props.children, isSelectItem, out)
  })
}

/**
 * Assinatura dos pares valor/rótulo. Serve para reaproveitar o array derivado
 * entre renders: enquanto ela não muda, o Base UI resolveria exatamente o mesmo
 * rótulo. Os separadores são caracteres de controle justamente por não
 * aparecerem em valores nem em rótulos de verdade.
 */
export function selectItemsSignature(items: readonly DerivedItem[]): string {
  return items
    .map((item) =>
      [serializeItemValue(item.value), nodeText(item.label)].join("\u0000"),
    )
    .join("\u0001")
}
