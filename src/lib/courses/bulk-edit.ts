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

/** Linha vinda do servidor (subconjunto necessário para montar o payload). */
export interface BulkRowInput {
  id: string
  title: string
  price: number
  customParcelas: number | null
  customDescription: string | null
}

/** Estado editável de cada linha (strings dos inputs). */
export interface RowDraft {
  price: string
  parcelas: string
  description: string
}

/** Item parcial enviado ao endpoint de lote. */
export interface BulkItem {
  id: string
  price?: number
  customParcelas?: number | null
  customDescription?: string | null
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
    parcelas: row.customParcelas != null ? String(row.customParcelas) : "",
    description: row.customDescription ?? "",
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

    items.push(item)
  }

  return { ok: true, items }
}
