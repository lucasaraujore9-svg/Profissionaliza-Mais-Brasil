/**
 * Venda direta com MAIS DE UM CURSO — regras comuns ao sistema mãe
 * (/api/admin/vendas) e ao painel da unidade (/api/painel/vendas).
 *
 * A venda vira UMA cobrança do valor somado. A matrícula PRIMÁRIA (1º curso da
 * lista) carrega o Payment e guarda os demais em `Enrollment.bundleCourseIds`;
 * no fulfill cada extra vira uma matrícula satélite (finalAmount 0, sem
 * Payment) — a mesma mecânica que os pacotes do catálogo já usavam.
 *
 * Este módulo é PURO de propósito: os formulários de venda (componentes client)
 * importam `MAX_SALE_COURSES` daqui, então qualquer import de servidor —
 * `prisma` inclusive — viria junto no bundle do browser e quebra o build. O que
 * precisa do banco mora em `multi-course-server.ts`.
 */

/**
 * Teto de cursos numa única venda direta. Não é limite de negócio, é sanidade:
 * cada curso vira uma chamada de provisionamento na plataforma de aulas dentro
 * do fulfill, e o webhook do gateway tem janela curta para responder.
 */
export const MAX_SALE_COURSES = 10

/** Remove ids repetidos preservando a ordem em que o vendedor escolheu. */
export function dedupeIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

/**
 * Nome comercial da compra, usado na descrição da cobrança no gateway e nas
 * telas. Um curso => o nome dele; vários => "N cursos: A, B, C".
 *
 * `maxLength` corta a lista (nunca o prefixo com a contagem, que é a informação
 * que não pode se perder) para caber nos limites de campo do MP/Asaas.
 */
export function saleItemLabel(courseNames: string[], maxLength = 200): string {
  if (courseNames.length === 0) return "Curso"
  if (courseNames.length === 1) return courseNames[0].slice(0, maxLength)

  const prefix = `${courseNames.length} cursos: `
  const list = courseNames.join(", ")
  if (prefix.length + list.length <= maxLength) return prefix + list
  const room = Math.max(0, maxLength - prefix.length - 1)
  return `${prefix}${list.slice(0, room)}…`
}
