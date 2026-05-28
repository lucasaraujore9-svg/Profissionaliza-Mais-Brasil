/**
 * Validação de telefone brasileiro.
 *
 * O regex anterior (`/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/`) rejeitava números
 * com prefixo `+55`, comum em links de WhatsApp. Aqui aceitamos com ou sem
 * prefixo internacional e normalizamos para 10/11 dígitos (DDD + número).
 */

/**
 * Normaliza o telefone removendo separadores e o prefixo internacional 55.
 * Mantém apenas DDD + número (10 ou 11 dígitos).
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  // Remove prefixo 55 (Brasil) se vier de +55 ou 0055.
  if (digits.length === 13 && digits.startsWith("55")) return digits.slice(2)
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(2)
  return digits
}

/**
 * Telefone brasileiro válido: 10 (fixo) ou 11 (celular) dígitos.
 * O 9º dígito (celular) precisa ser 9 quando são 11 dígitos.
 */
export function isValidPhone(value: string): boolean {
  const normalized = normalizePhone(value)
  if (normalized.length === 10) return true
  if (normalized.length === 11) {
    // Celular começa com 9 após o DDD (regra ANATEL desde 2016).
    return normalized[2] === "9"
  }
  return false
}
