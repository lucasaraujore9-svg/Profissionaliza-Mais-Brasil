/**
 * Validação de CPF com dígito verificador.
 *
 * O regex usado anteriormente (`/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/`) só checava
 * o formato — aceita CPFs com dígitos iguais (000.000.000-00, 111.111.111-11),
 * que são rejeitados pela plataforma parceira no `criarAluno` e quebram a
 * matrícula só depois do MP confirmar o pagamento.
 *
 * Aqui validamos o algoritmo oficial da Receita Federal:
 * - 11 dígitos
 * - dígitos não podem ser todos iguais
 * - dois dígitos verificadores calculados via soma ponderada
 */

export function stripCpf(value: string): string {
  return value.replace(/\D/g, "")
}

/**
 * Extrai o CPF (11 dígitos, sem máscara) de um documento de cobrança que pode
 * ser CPF OU CNPJ (ex.: `ownerCpfCnpj` na criação de revenda). Retorna null
 * quando o valor não é um CPF válido — um CNPJ nunca vira identificador de
 * login (o authorize só consulta User.cpf com CPF validado).
 */
export function cpfFromDocument(value: string): string | null {
  const digits = stripCpf(value)
  return isValidCpf(digits) ? digits : null
}

export function isValidCpf(value: string): boolean {
  const cpf = stripCpf(value)
  if (cpf.length !== 11) return false
  // Rejeita CPFs com todos dígitos iguais (000..., 111..., ..., 999...).
  if (/^(\d)\1{10}$/.test(cpf)) return false

  // Primeiro dígito verificador.
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number.parseInt(cpf[i]!, 10) * (10 - i)
  }
  let check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== Number.parseInt(cpf[9]!, 10)) return false

  // Segundo dígito verificador.
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += Number.parseInt(cpf[i]!, 10) * (11 - i)
  }
  check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== Number.parseInt(cpf[10]!, 10)) return false

  return true
}
