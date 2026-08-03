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
  // Remove o prefixo 55 (Brasil) quando o total fecha em DDI + DDD + número —
  // é a forma que chega de `+55`. Um `0055` (discagem internacional) passa
  // batido de propósito: alargar isso mexeria no `isValidPhone` de todos os
  // checkouts.
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

/**
 * Formata para EXIBIÇÃO: `(11) 99999-9999` (celular) ou `(11) 9999-9999`
 * (fixo).
 *
 * Devolve o valor original quando não reconhece o formato. Números gravados
 * antes da normalização (o cadastro de revenda salvava exatamente o que o
 * operador digitou) podem estar fora do padrão 10/11 dígitos — mostrar o dado
 * cru é melhor do que esconder o telefone que a pessoa foi procurar.
 */
export function formatPhone(value: string): string {
  const d = normalizePhone(value)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return value
}
