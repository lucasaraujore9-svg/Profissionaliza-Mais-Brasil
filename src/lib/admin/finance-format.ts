/**
 * Formatadores monetários e de data compartilhados pelo cluster Financeiro do
 * admin. Centraliza o que antes estava copiado em cada componente de lista.
 *
 * NOTA: os valores que chegam das rotas `/api/admin/financeiro*` já vêm em
 * reais (number), NÃO em centavos. `formatMoney` apenas aplica a máscara BRL —
 * não divide por 100. Mantemos a assinatura simples para casar com os dados.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const BRL_NO_CENTS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

/** Formata um valor (em reais) como moeda BRL. */
export function formatMoney(value: number, opts?: { cents?: boolean }): string {
  return (opts?.cents === false ? BRL_NO_CENTS : BRL).format(value)
}

/** Formata uma data ISO como dd/mm/aaaa. Retorna "—" para nulo/inválido. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return iso
  }
}

/** Formata uma data ISO como dd/mm/aaaa hh:mm. Retorna "—" para nulo/inválido. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("pt-BR")
  } catch {
    return iso
  }
}

/** Percentual com sinal explícito (+/−). */
export function formatPct(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`
}

/** Última linha não vazia de um histórico de observações, truncada. */
export function notePreview(notes: string | null | undefined): string {
  if (!notes) return ""
  const lines = notes.split("\n").filter((l) => l.trim().length > 0)
  const last = lines[lines.length - 1] ?? ""
  return last.length > 60 ? last.slice(0, 57) + "..." : last
}
