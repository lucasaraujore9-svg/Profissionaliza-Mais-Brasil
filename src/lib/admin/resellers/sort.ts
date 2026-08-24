/**
 * Ordenação da lista de unidades do /admin — FONTE ÚNICA das colunas que a tela
 * oferece e a API aceita.
 *
 * PURO de propósito (só `import type` do Prisma, que o compilador apaga): o
 * cabeçalho clicável e o seletor do mobile são componentes de cliente e
 * importam as chaves e os rótulos daqui. Se este módulo passasse a tocar o
 * Prisma em runtime, o driver `pg` entraria no bundle do navegador e o build
 * quebraria com "Can't resolve 'dns'".
 *
 * A ordenação vive no SERVIDOR e não no cliente porque a listagem é cortada em
 * `LIST_LIMIT` linhas: ordenar no navegador só reordenaria a página já baixada
 * — isto é, as N unidades mais NOVAS —, e a tela prometeria "as maiores MRR"
 * mostrando "as maiores MRR entre as mais recentes".
 */
import type { Prisma } from "@prisma/client"

/** Colunas ordenáveis, na ordem em que aparecem na tabela. */
export const RESELLER_SORT_KEYS = [
  "nome",
  "mrr",
  "vencimento",
  "alunos",
  "status",
  "gerente",
  "criacao",
] as const

export type ResellerSortKey = (typeof RESELLER_SORT_KEYS)[number]
export type SortDir = "asc" | "desc"

export interface ResellerSort {
  key: ResellerSortKey
  dir: SortDir
}

/** O que a tela mostra antes de qualquer clique — a ordem histórica da lista. */
export const DEFAULT_RESELLER_SORT: ResellerSort = { key: "criacao", dir: "desc" }

/**
 * Direção do PRIMEIRO clique em cada coluna. Texto sobe (A→Z); número, data de
 * cadastro e dinheiro descem (o maior primeiro); vencimento sobe, porque quem
 * clica ali está procurando quem está devendo, não quem vence daqui a 30 dias.
 */
export const RESELLER_SORT_FIRST_DIR: Record<ResellerSortKey, SortDir> = {
  nome: "asc",
  mrr: "desc",
  vencimento: "asc",
  alunos: "desc",
  status: "asc",
  gerente: "asc",
  criacao: "desc",
}

export const RESELLER_SORT_LABELS: Record<ResellerSortKey, string> = {
  nome: "Revendedor",
  mrr: "MRR",
  vencimento: "Vencimento",
  alunos: "Alunos",
  status: "Status",
  gerente: "Gerente",
  criacao: "Cadastro",
}

function isSortKey(value: string): value is ResellerSortKey {
  return (RESELLER_SORT_KEYS as readonly string[]).includes(value)
}

/**
 * Lê `?sort=` e `?dir=` da URL. Valor desconhecido cai no padrão em vez de
 * virar erro: a ordenação é conveniência de tela, e uma query string velha (ou
 * um link colado) não pode derrubar a listagem.
 */
export function parseResellerSort(searchParams: URLSearchParams): ResellerSort {
  const raw = searchParams.get("sort")?.trim() ?? ""
  if (!isSortKey(raw)) return DEFAULT_RESELLER_SORT
  const dir = searchParams.get("dir")?.trim().toLowerCase()
  return {
    key: raw,
    dir: dir === "asc" || dir === "desc" ? dir : RESELLER_SORT_FIRST_DIR[raw],
  }
}

/** Próximo estado ao clicar num cabeçalho: mesma coluna inverte, outra reinicia. */
export function toggleResellerSort(
  current: ResellerSort,
  key: ResellerSortKey,
): ResellerSort {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" }
  }
  return { key, dir: RESELLER_SORT_FIRST_DIR[key] }
}

/**
 * Ordem entre as PRÓXIMAS cobranças de duas unidades — a regra da coluna
 * "Vencimento", que o banco não sabe ordenar.
 *
 * "Sem cobrança" vai SEMPRE para o fim, nos dois sentidos. Com os nulos no topo
 * do ascendente, clicar em "Vencimento" para achar quem está devendo mostraria
 * primeiro justamente quem não deve nada.
 */
export function compareNextDue(
  a: { dueDate: string } | undefined,
  b: { dueDate: string } | undefined,
  dir: SortDir,
): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  // `dueDate` é ISO 8601 UTC — comparação lexicográfica é cronológica.
  const cmp = a.dueDate.localeCompare(b.dueDate)
  return dir === "asc" ? cmp : -cmp
}

/**
 * `orderBy` do `findMany`.
 *
 * Devolve `null` para "vencimento": a próxima cobrança NÃO é coluna do
 * `Tenant` — ela sai do rollup de `TenantPayment` (a vencida mais antiga ou a
 * próxima a vencer). Quem chama trata esse caso ordenando em memória sobre o
 * conjunto inteiro do filtro, antes de cortar a página.
 *
 * Todas as demais levam `createdAt: "desc"` como desempate para a página ser
 * DETERMINÍSTICA: sem isso, duas unidades com a mesma MRR podem trocar de lugar
 * entre dois carregamentos iguais.
 */
export function resellerOrderBy(
  sort: ResellerSort,
): Prisma.TenantOrderByWithRelationInput[] | null {
  const dir = sort.dir
  switch (sort.key) {
    case "nome":
      return [{ name: dir }, { createdAt: "desc" }]
    case "mrr":
      return [{ planValue: dir }, { createdAt: "desc" }]
    case "alunos":
      return [{ students: { _count: dir } }, { createdAt: "desc" }]
    case "status":
      // Enum do Postgres ordena pela ordem de DECLARAÇÃO, não pelo alfabeto:
      // asc = PENDING → ACTIVE → SUSPENDED → CANCELLED (o ciclo de vida da
      // unidade). Agrupar é o que a coluna serve para fazer; a sequência sair
      // em ordem de vida é o bônus.
      return [{ status: dir }, { createdAt: "desc" }]
    case "gerente":
      // Unidade sem gerente é NULL no LEFT JOIN e segue o padrão do Postgres:
      // fim da lista no asc, começo no desc. Não dá para pedir NULLS LAST aqui
      // (o `nulls` do Prisma só existe para coluna escalar anulável), e forçar
      // pela `accountManagerId` ordenaria por id — pior que o padrão.
      return [{ accountManager: { name: dir } }, { createdAt: "desc" }]
    case "vencimento":
      return null
    case "criacao":
      return [{ createdAt: dir }]
  }
}
