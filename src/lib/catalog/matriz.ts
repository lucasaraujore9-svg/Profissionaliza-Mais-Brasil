/**
 * Matriz curricular derivada das AULAS — o caminho de quando a fornecedora nao
 * tem grade propria para o curso.
 *
 * A matriz e a lista de topicos exibida na pagina do curso e impressa no VERSO
 * do certificado (`info-page.tsx`). Curso sem ela sai da vitrine sem conteudo
 * programatico e gera um diploma sem grade — por isso nenhum curso pode ficar
 * sem, e por isso o sync preenche sozinho a partir do que a fornecedora tem.
 *
 * Aqui so mora a LIMPEZA do titulo. As duas fornecedoras numeram a aula no
 * proprio titulo ("01 - Introducao" na legada, "Aula 2 - Dicas de Ouro" no LMS)
 * e a matriz guarda so o nome: a lista na vitrine ja e apresentada como topicos,
 * sem numeracao repetida.
 */

/**
 * Numeracao NUA ("01 - Introducao"): o separador e OBRIGATORIO. Sem ele,
 * "5S na empresa" perderia o "5" e viraria "S na empresa".
 */
const NUMERO_NU = /^\s*\d+\s*[-–—.)]\s*/

/**
 * Numeracao com PALAVRA ("Aula 2 - Dicas", "Aula 1 Boas vindas", "Modulo 03:").
 * Aqui o separador e opcional — a palavra + numero ja delimitam o prefixo.
 */
const NUMERO_ROTULADO =
  /^\s*(?:aula|m[oó]dulo|unidade|cap[ií]tulo|li[çc][ãa]o)s?\s*\d+\s*[-–—.:)]*\s*/i

/**
 * Titulo de aula -> topico da matriz. Titulo que era SO numeracao ("03 - ",
 * "Aula 7") vira "" e e descartado: como topico ele nao diz nada, e uma grade
 * com "Aula 7" escrito sete vezes e pior que uma linha a menos.
 */
export function cleanMatrizTopic(raw: string | null | undefined): string {
  const title = (raw ?? "").trim()
  if (!title) return ""
  return title.replace(NUMERO_ROTULADO, "").replace(NUMERO_NU, "").trim()
}

/** Titulos de aula (ja na ordem) -> topicos da matriz, sem vazios. */
export function matrizFromLessonTitles(
  titles: readonly (string | null | undefined)[],
): string[] {
  return titles.map(cleanMatrizTopic).filter((s) => s.length > 0)
}
