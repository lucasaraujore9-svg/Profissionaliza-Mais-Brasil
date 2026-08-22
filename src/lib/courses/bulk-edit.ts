/**
 * Lógica pura da edição em massa de cursos (planilha), compartilhada pelo
 * painel do revendedor e pelo catálogo do admin.
 *
 * Mantida fora do componente React para ser testável e para garantir o
 * invariante crítico: cada campo (preço, parcelas, descrição) só é validado e
 * enviado quando o usuário realmente o alterou. Sem isso, mexer apenas nas
 * parcelas de um curso sem preço (price 0 — ex. cursos LMS ocultos) dispararia
 * "Preço inválido" e abortaria o lote inteiro.
 */

import { aprendizadoToText, parseAprendizado } from "./aprendizado"

/** Linha vinda do servidor (subconjunto necessário para montar o payload). */
export interface BulkRowInput {
  id: string
  title: string
  price: number
  /** Preco de tabela ("De R$ X"). null = a vitrine nao exibe "De". */
  precoDe: number | null
  customParcelas: number | null
  customDescription: string | null
  /** "O que vai aprender" próprio desta linha. Vazio = herda o padrão. */
  customAprendizado: string[]
}

/** Estado editável de cada linha (strings dos inputs). */
export interface RowDraft {
  price: string
  /** Vazio = sem "De" (limpar o campo e uma acao valida, nao "nao mexeu"). */
  precoDe: string
  parcelas: string
  description: string
  /** Um item por linha; string vazia = herda o padrão. */
  aprendizado: string
}

/** Item parcial enviado ao endpoint de lote. */
export interface BulkItem {
  id: string
  price?: number
  precoDe?: number | null
  customParcelas?: number | null
  customDescription?: string | null
  customAprendizado?: string[]
}

export type BuildBulkItemsResult =
  | { ok: true; items: BulkItem[] }
  | { ok: false; error: string }

export function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Converte o texto do input (formato BR) para número. NaN se inválido. */
export function parsePrice(input: string): number {
  return parseFloat(input.replace(/\./g, "").replace(",", "."))
}

export function draftFromRow(row: BulkRowInput): RowDraft {
  return {
    price: formatPrice(row.price),
    precoDe: row.precoDe != null ? formatPrice(row.precoDe) : "",
    parcelas: row.customParcelas != null ? String(row.customParcelas) : "",
    description: row.customDescription ?? "",
    aprendizado: aprendizadoToText(row.customAprendizado),
  }
}

/**
 * Monta os itens do payload apenas com os campos efetivamente alterados de
 * cada linha presente em `changedIds`. Valida preço só quando o preço mudou e
 * parcelas só quando as parcelas mudaram.
 */
export function buildBulkItems(
  rows: BulkRowInput[],
  drafts: Record<string, RowDraft>,
  changedIds: ReadonlySet<string>,
): BuildBulkItemsResult {
  const items: BulkItem[] = []

  for (const row of rows) {
    if (!changedIds.has(row.id)) continue
    const d = drafts[row.id]
    if (!d) continue
    const original = draftFromRow(row)

    const item: BulkItem = { id: row.id }

    if (d.price !== original.price) {
      const numericPrice = parsePrice(d.price)
      if (Number.isNaN(numericPrice) || numericPrice <= 0) {
        return { ok: false, error: `Preço inválido em "${row.title}"` }
      }
      item.price = numericPrice
    }

    // Campo vazio e um valor VALIDO aqui ("tire o De desta linha"), diferente
    // do preco de venda, onde vazio/zero e erro. E o "De" tem que ser maior que
    // o preco de venda que VAI valer nesta mesma linha (o editado, se mudou),
    // senao a vitrine nao desenha nada e o lote passa em silencio.
    if (d.precoDe !== original.precoDe) {
      if (!d.precoDe.trim()) {
        item.precoDe = null
      } else {
        const numericPrecoDe = parsePrice(d.precoDe)
        if (Number.isNaN(numericPrecoDe) || numericPrecoDe <= 0) {
          return { ok: false, error: `Preço de tabela inválido em "${row.title}"` }
        }
        const precoVenda = item.price ?? row.price
        if (precoVenda > 0 && numericPrecoDe <= precoVenda) {
          return {
            ok: false,
            error: `Preço de tabela em "${row.title}": precisa ser maior que o preço de venda`,
          }
        }
        item.precoDe = numericPrecoDe
      }
    }

    if (d.parcelas !== original.parcelas) {
      let parcelasValue: number | null = null
      if (d.parcelas.trim()) {
        const n = parseInt(d.parcelas, 10)
        if (Number.isNaN(n) || n < 1 || n > 24) {
          return {
            ok: false,
            error: `Parcelas em "${row.title}": use um número entre 1 e 24 (ou vazio)`,
          }
        }
        parcelasValue = n
      }
      item.customParcelas = parcelasValue
    }

    if (d.description !== original.description) {
      item.customDescription = d.description.trim() || null
    }

    // Lista vazia é um valor válido: significa "voltar ao padrão do catálogo".
    if (d.aprendizado !== original.aprendizado) {
      item.customAprendizado = parseAprendizado(d.aprendizado)
    }

    items.push(item)
  }

  return { ok: true, items }
}
