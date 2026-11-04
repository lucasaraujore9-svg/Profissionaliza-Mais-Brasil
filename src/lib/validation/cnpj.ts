/**
 * Validação de CNPJ (14 dígitos numéricos) com dígito verificador.
 * PURO: o formulário do painel importa daqui.
 */

export function stripCnpj(value: string): string {
  return value.replace(/\D/g, "")
}

function checkDigit(digits: string, weights: number[]): number {
  let sum = 0
  for (let i = 0; i < weights.length; i++) {
    sum += Number.parseInt(digits[i]!, 10) * weights[i]!
  }
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

export function isValidCnpj(value: string): boolean {
  const cnpj = stripCnpj(value)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false
  const d1 = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (d1 !== Number.parseInt(cnpj[12]!, 10)) return false
  const d2 = checkDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d2 === Number.parseInt(cnpj[13]!, 10)
}

/** 69942034000100 -> 69.942.034/0001-00. Valor fora do formato volta como veio. */
export function formatCnpj(value: string): string {
  const d = stripCnpj(value)
  if (d.length !== 14) return value
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
