/**
 * TAXONOMIA DO CATALOGO — a regra de "duas categorias sao a mesma".
 *
 * Gemeo de `src/lib/categories.ts` no repo do LMS ("Area do Aluno PMB"). As duas
 * `normalizeCategoryName` precisam concordar: e por essa chave que o sync decide
 * se a categoria que chegou do LMS ja existe aqui. Se divergirem, uma categoria
 * unificada la volta a se dividir aqui na proxima sincronizacao das 6h.
 *
 * Modulo PURO (sem Prisma) — importavel por componente client sem arrastar o
 * driver `pg` para o navegador.
 */

/**
 * CHAVE DE UNIFICACAO. Duas categorias sao a MESMA quando esta funcao devolve o
 * mesmo valor para os nomes delas — ou seja, quando so diferem em acento, caixa,
 * pontuacao ou espaco.
 *
 * Foi exatamente isso que faltou: `Informatica E Tecnologia` (vinda do sync da
 * EA) e `Informatica e Tecnologia` (vinda do LMS) sao a mesma categoria, mas a
 * comparacao por `name` do Postgres e sensivel a caixa e nasceu linha nova.
 *
 * Nao faz nada alem disso de proposito: nao corta plural, nao traduz e nao trata
 * sinonimo. "Food" e "Saude" continuam categorias diferentes — junta-las e
 * decisao editorial de uma pessoa, nunca de uma regra de string que erraria
 * calada sobre a vitrine de 88 unidades.
 */
export function normalizeCategoryName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Nome de EXIBICAO limpo. Tira sujeira de digitacao; acento e caixa sao do autor. */
export function cleanCategoryName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—_.,;:!?/\\|[\]{}()"'`]+/, "")
    .replace(/[\s\-–—_.,;:!?/\\|[\]{}()"'`]+$/, "")
    .trim()
}

export type CategoryLike = { id: string; name: string }

/** A categoria existente que e A MESMA que `name` (chave de unificacao igual). */
export function findSameCategory<T extends CategoryLike>(
  name: string,
  all: readonly T[],
): T | undefined {
  const key = normalizeCategoryName(name)
  if (!key) return undefined
  return all.find((c) => normalizeCategoryName(c.name) === key)
}

export type DuplicateGroup<T extends CategoryLike = CategoryLike> = {
  key: string
  members: T[]
}

/**
 * Grupos de categorias que sao A MESMA e portanto podem ser unificadas sem
 * julgamento humano. Grupo de um so nao e duplicata e nao entra na lista.
 */
export function findDuplicateGroups<T extends CategoryLike>(
  all: readonly T[],
): DuplicateGroup<T>[] {
  const byKey = new Map<string, T[]>()
  for (const c of all) {
    const key = normalizeCategoryName(c.name)
    if (!key) continue
    const bucket = byKey.get(key)
    if (bucket) bucket.push(c)
    else byKey.set(key, [c])
  }
  return [...byKey.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({ key, members }))
    .sort((a, b) => a.key.localeCompare(b.key, "pt-BR"))
}
