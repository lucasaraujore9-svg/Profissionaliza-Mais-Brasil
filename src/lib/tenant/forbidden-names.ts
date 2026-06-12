/**
 * Nomes reservados que NAO podem ser usados no nome da unidade nem no
 * subdominio das revendas — restricao contratual (marcas da PMB) + dominio
 * da vitrine (livrecursos).
 *
 * A checagem normaliza o texto (sem acento, minusculo, somente [a-z0-9]) e
 * procura cada termo como SUBSTRING. Isso cobre as variacoes mais comuns —
 * espacos, hifens, pontuacao e acentuacao — automaticamente. Exemplos que
 * batem em "bolsamaisbrasil": "Bolsa Mais Brasil", "bolsa-mais-brasil",
 * "BolsaMaisBrasil", "Bólsa Mais Brasíl".
 *
 * A lista e curta de proposito: ajuste os tokens abaixo para incluir/remover
 * marcas. Cada `token` ja deve estar normalizado (minusculo, so [a-z0-9]).
 */
const FORBIDDEN_TOKENS = [
  "bolsamaisbrasil",
  "profissionaliza", // pega "profissionaliza mais brasil", "profissionalizar", etc.
  "escoladeensinoadistancia",
  "escolaensinoadistancia", // variante sem "de"
  "escoladeead",
  "livrecursos", // pega "livre cursos", "livre-cursos"
] as const

export const FORBIDDEN_NAME_MESSAGE =
  "Este nome contém uma marca reservada (Bolsa Mais Brasil, Profissionaliza, " +
  "Escola de Ensino a Distância ou Livre Cursos) e não pode ser usado. Escolha outro."

/** minuscula, remove acentos e tudo que nao for [a-z0-9]. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/**
 * `true` quando o texto contem algum nome reservado. Use no nome da unidade
 * e no subdominio, tanto na criacao quanto na edicao pelo revendedor.
 */
export function containsForbiddenName(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = normalizeForMatch(value)
  if (!normalized) return false
  return FORBIDDEN_TOKENS.some((token) => normalized.includes(token))
}

/**
 * Retorna a mensagem de erro pronta quando o texto e proibido, ou `null`
 * quando esta liberado. Conveniente para `if (msg) return 400`.
 */
export function forbiddenNameError(value: string | null | undefined): string | null {
  return containsForbiddenName(value) ? FORBIDDEN_NAME_MESSAGE : null
}
