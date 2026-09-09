/**
 * Ordenacao da carteira de indicadas no relatorio do indicador.
 *
 * A ordem vive na URL (`?ordem=&dir=`), nao no estado de um client component:
 * a pagina e server component, a competencia ja mora na URL, e um relatorio que
 * o financeiro manda por link tem de reabrir na MESMA ordem em que foi lido.
 *
 * Modulo PURO e estruturalmente tipado de proposito — o mesmo comparador serve
 * a tela do /admin e a do /painel sem que nenhuma delas importe a outra, e o
 * teste roda sem banco.
 */

export const ORDENS = [
  "padrao",
  "nome",
  "status",
  "entrada",
  "recebido",
  "conta",
] as const
export type OrdemCarteira = (typeof ORDENS)[number]
export type DirecaoOrdem = "asc" | "desc"

export interface LinhaOrdenavel {
  name: string
  status: string
  entrouEm: Date
  recebidoNoMes: number
  naConta: boolean
  valorNaConta: number
}

/** Valor invalido cai no padrao — a URL vem do usuario e nao pode quebrar a tela. */
export function parseOrdem(value: string | undefined): OrdemCarteira {
  return ORDENS.includes(value as OrdemCarteira)
    ? (value as OrdemCarteira)
    : "padrao"
}

export function parseDirecao(value: string | undefined): DirecaoOrdem {
  return value === "asc" || value === "desc" ? value : "desc"
}

/**
 * Peso do status para ordenar por SITUACAO, nao por alfabeto: quem esta no ar
 * primeiro, contrato desfeito por ultimo. Ordenar "ACTIVE, CANCELLED, PENDING,
 * SUSPENDED" alfabeticamente colocaria as canceladas no meio da carteira viva.
 */
const PESO_STATUS: Record<string, number> = {
  ACTIVE: 0,
  PENDING: 1,
  SUSPENDED: 2,
  CANCELLED: 3,
}

function pesoStatus(status: string): number {
  return PESO_STATUS[status] ?? 9
}

/**
 * Ordena SEM mutar a lista recebida.
 *
 * Todo criterio desempata por NOME. Sem isso, colunas com muitos empates
 * (status, recebido zerado) sairiam numa ordem que muda a cada consulta ao
 * banco — o financeiro reabriria o mesmo relatorio e veria as linhas trocadas
 * de lugar, sem nada ter mudado.
 */
export function ordenarCarteira<T extends LinhaOrdenavel>(
  linhas: T[],
  ordem: OrdemCarteira,
  dir: DirecaoOrdem,
): T[] {
  const porNome = (a: T, b: T) => a.name.localeCompare(b.name, "pt-BR")
  const sinal = dir === "asc" ? 1 : -1

  const comparadores: Record<OrdemCarteira, (a: T, b: T) => number> = {
    // Abre pela CONTA: quem entrou, do maior valor para o menor. E a leitura
    // que o relatorio existe para servir; o resto da carteira e contexto.
    padrao: (a, b) => {
      if (a.naConta !== b.naConta) return a.naConta ? -1 : 1
      if (b.valorNaConta !== a.valorNaConta) return b.valorNaConta - a.valorNaConta
      return porNome(a, b)
    },
    nome: (a, b) => sinal * porNome(a, b) * -1,
    status: (a, b) =>
      sinal * (pesoStatus(b.status) - pesoStatus(a.status)) || porNome(a, b),
    entrada: (a, b) =>
      sinal * (a.entrouEm.getTime() - b.entrouEm.getTime()) || porNome(a, b),
    recebido: (a, b) =>
      sinal * (a.recebidoNoMes - b.recebidoNoMes) || porNome(a, b),
    // "Na conta" ordena por VALOR, nao pelo booleano: quem entrou por R$ 75 e
    // quem entrou por R$ 0 nao sao a mesma informacao.
    conta: (a, b) => sinal * (a.valorNaConta - b.valorNaConta) || porNome(a, b),
  }

  return [...linhas].sort(comparadores[ordem])
}

/**
 * Direcao do link de um cabecalho: clicar na coluna ATIVA inverte; clicar numa
 * coluna nova comeca por `desc` (maior primeiro), que e o que se quer olhar em
 * dinheiro e em data. Em nome, `desc` no comparador significa A→Z.
 */
export function proximaDirecao(
  colunaAtual: OrdemCarteira,
  coluna: OrdemCarteira,
  dirAtual: DirecaoOrdem,
): DirecaoOrdem {
  if (colunaAtual !== coluna) return "desc"
  return dirAtual === "desc" ? "asc" : "desc"
}
