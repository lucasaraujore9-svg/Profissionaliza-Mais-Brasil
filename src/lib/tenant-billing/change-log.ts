/**
 * Historico de uma fatura da unidade, gravado em `TenantPayment.notes`.
 *
 * Regra do dono (26/10/2026): fatura NUNCA some do PMB. O que acontece com ela
 * — cancelada, editada ou quitada, aqui ou direto no painel do Asaas — fica
 * registrado na propria linha e aparece no historico de /admin/revendedores/[id].
 * Sem isso, uma baixa ou um cancelamento feito no Asaas so se notava pela
 * fatura "sumindo" da tela.
 *
 * PURO (sem I/O): quem grava e o espelho (`lib/asaas/reconcile.ts`), o webhook
 * e as rotas de acao do admin.
 */

const BR = { timeZone: "America/Sao_Paulo" } as const

function stamp(at: Date): string {
  return at.toLocaleString("pt-BR", { ...BR, dateStyle: "short", timeStyle: "short" })
}

/** Data civil (gravada a 00:00 UTC) em dd/mm/aaaa, sem cair no dia anterior. */
function civilDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" })
}

function brl(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`
}

/** Acrescenta uma linha datada ao historico, preservando o que ja havia. */
export function appendNote(notes: string | null, line: string, at = new Date()): string {
  const entry = `[${stamp(at)}] ${line}`
  return notes ? `${notes}\n---\n${entry}` : entry
}

/** Ultima entrada do historico — o que a tabela mostra sob o status. */
export function lastNote(notes: string | null): string | null {
  if (!notes) return null
  const parts = notes.split("\n---\n")
  return parts[parts.length - 1]?.trim() || null
}

export type MirrorBefore = {
  status: string
  amount: number
  dueDate: Date
}

export type MirrorAfter = {
  status: string
  value: number
  /** AAAA-MM-DD, como o Asaas devolve. */
  dueDate: string
}

/**
 * O que mudou numa fatura FORA do PMB, comparando a linha do banco com o que o
 * Asaas mostra agora. Linha em DELETING foi cancelada PELO PMB (o botao ja
 * anotou), entao nada aqui vira "direto no Asaas".
 */
export function outsideChanges(before: MirrorBefore, after: MirrorAfter): string[] {
  if (before.status === "DELETING") return []
  const lines: string[] = []
  if (after.status !== before.status) {
    if (after.status === "RECEIVED_IN_CASH") {
      lines.push("Baixa dada direto no Asaas (recebido em dinheiro).")
    } else if (after.status === "DELETED") {
      lines.push("Cancelada direto no Asaas.")
    } else if (after.status === "REFUNDED") {
      lines.push("Estornada direto no Asaas.")
    }
  }
  if (Math.round(before.amount * 100) !== Math.round(after.value * 100)) {
    lines.push(`Valor alterado direto no Asaas: ${brl(before.amount)} → ${brl(after.value)}.`)
  }
  const antes = before.dueDate.toISOString().slice(0, 10)
  if (antes !== after.dueDate) {
    lines.push(
      `Vencimento alterado direto no Asaas: ${civilDate(before.dueDate)} → ${civilDate(new Date(`${after.dueDate}T00:00:00.000Z`))}.`,
    )
  }
  return lines
}
