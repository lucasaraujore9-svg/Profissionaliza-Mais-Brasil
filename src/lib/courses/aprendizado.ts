/**
 * Seção "O que você vai aprender" da página do curso.
 *
 * Hierarquia (mesma dos demais campos do catálogo: tenant > admin > padrão):
 *   1. TenantCourse.customAprendizado — override da revenda, só na vitrine dela
 *   2. Course.aprendizado             — padrão global editado no catálogo mãe
 *   3. APRENDIZADO_DEFAULT            — texto genérico (comportamento histórico)
 *
 * "Vazio" (array sem itens) significa SEMPRE "herda do nível de cima" — não
 * existe "esconder a seção". Assim os cursos que ninguém editou continuam
 * exibindo exatamente o que exibiam antes desta feature.
 */

/** Texto genérico exibido enquanto ninguém editou o curso. */
export const APRENDIZADO_DEFAULT = [
  "Fundamentos teóricos e práticos da profissão",
  "Ferramentas e materiais essenciais do dia a dia",
  "Técnicas modernas e mais procuradas no mercado",
  "Como atender clientes com excelência",
  "Precificação e gestão do seu negócio",
  "Marketing e captação nas redes sociais",
]

/** Máximo de itens gravados. A seção é um grid de 2 colunas — 6 é o desenho. */
export const APRENDIZADO_MAX_ITEMS = 12

/** Máximo de caracteres por item (cabe em um card sem quebrar o layout). */
export const APRENDIZADO_MAX_LEN = 200

/**
 * Converte o texto do textarea (1 item por linha) na lista gravada no banco.
 * Descarta linhas em branco e corta o excedente — nunca lança.
 */
export function parseAprendizado(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, APRENDIZADO_MAX_LEN))
    .slice(0, APRENDIZADO_MAX_ITEMS)
}

/** Volta da lista para o texto do textarea (1 item por linha). */
export function aprendizadoToText(items: string[] | null | undefined): string {
  return (items ?? []).join("\n")
}

/**
 * Resolve o que a página do curso deve exibir, do mais específico ao padrão.
 * Passe os níveis na ordem de precedência; o primeiro não-vazio vence.
 */
export function resolveAprendizado(
  ...levels: Array<string[] | null | undefined>
): string[] {
  for (const level of levels) {
    if (level && level.length > 0) return level
  }
  return APRENDIZADO_DEFAULT
}
