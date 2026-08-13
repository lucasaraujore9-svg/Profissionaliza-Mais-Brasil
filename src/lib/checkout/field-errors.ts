/**
 * Erros por campo devolvidos pelo servidor (`fieldErrors` do
 * `z.flattenError(...)`), traduzidos para o estado dos formulários.
 *
 * Antes, cada checkout filtrava com `key in form` — o que descartava
 * silenciosamente qualquer erro de campo que não vivesse no FormState local. Os
 * campos do RESPONSÁVEL FINANCEIRO são exatamente esse caso: o servidor recusaria
 * a venda e a tela mostraria só "Revise os campos destacados", sem destacar nada.
 */

/** Campos do bloco de responsável — não vivem no FormState de nenhum checkout. */
export const GUARDIAN_FIELD_KEYS = [
  "nascimento",
  "responsavel",
  "responsavelCpf",
  "responsavelRg",
  "responsavelEmail",
  "responsavelFone",
  "responsavelParentesco",
  "responsavelParentescoOutro",
  "responsavelDeclaracao",
] as const

export function applyServerFieldErrors(
  fields: unknown,
  isKnownFormKey: (key: string) => boolean,
): Record<string, string> {
  if (!fields || typeof fields !== "object") return {}
  const mapped: Record<string, string> = {}
  for (const [key, msgs] of Object.entries(fields as Record<string, unknown>)) {
    const first = Array.isArray(msgs) ? msgs[0] : undefined
    if (typeof first !== "string") continue
    if (
      isKnownFormKey(key) ||
      (GUARDIAN_FIELD_KEYS as readonly string[]).includes(key)
    ) {
      mapped[key] = first
    }
  }
  return mapped
}
