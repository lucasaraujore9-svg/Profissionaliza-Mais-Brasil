/**
 * Contagem por situacao da carteira de indicadas e o texto do card "Carteira".
 *
 * Existe porque o resumo antigo nomeava so dois dos quatro status possiveis
 * (`19 ativas` / `31 no total · 10 canceladas`): as SUSPENDED e as PENDING
 * sumiam das duas pontas e a conta nao fechava na tela — a pergunta que chegava
 * na mesa era "onde estao as outras 2?". Uma unidade suspensa nao e um detalhe
 * de exibicao: ela ja pagou e pode estar DENTRO da comissao do mes (o universo
 * do motor e "ativa OU pagou no mes").
 *
 * Contar e escrever moram juntos e no mesmo modulo PURO de proposito: e o que
 * torna impossivel a soma exibida divergir do total, e o que faz as telas do
 * /admin e do /painel dizerem a mesma coisa sem uma importar a outra. Status
 * desconhecido cai em `outras` — nunca some do total em silencio, que era
 * exatamente o defeito original.
 */

export interface ContagemCarteira {
  total: number
  ativas: number
  pendentes: number
  suspensas: number
  canceladas: number
  /** Status fora do enum conhecido. Nunca e descartado. */
  outras: number
}

export function contarCarteira(
  linhas: readonly { status: string }[],
): ContagemCarteira {
  const c: ContagemCarteira = {
    total: linhas.length,
    ativas: 0,
    pendentes: 0,
    suspensas: 0,
    canceladas: 0,
    outras: 0,
  }
  for (const l of linhas) {
    if (l.status === "ACTIVE") c.ativas++
    else if (l.status === "PENDING") c.pendentes++
    else if (l.status === "SUSPENDED") c.suspensas++
    else if (l.status === "CANCELLED") c.canceladas++
    else c.outras++
  }
  return c
}

function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Valor e legenda do card. So aparece o estado que EXISTE naquela carteira —
 * imprimir "0 suspensas" em toda tela transformaria o resumo em ruido —, mas o
 * que aparece sempre fecha com o total.
 */
export function carteiraResumo(c: ContagemCarteira): {
  valor: string
  hint: string
} {
  const partes = [`${c.total} no total`]
  if (c.pendentes > 0) partes.push(contagem(c.pendentes, "pendente", "pendentes"))
  if (c.suspensas > 0) partes.push(contagem(c.suspensas, "suspensa", "suspensas"))
  if (c.canceladas > 0)
    partes.push(contagem(c.canceladas, "cancelada", "canceladas"))
  if (c.outras > 0)
    partes.push(contagem(c.outras, "em outro estado", "em outros estados"))

  return {
    valor: contagem(c.ativas, "ativa", "ativas"),
    hint: partes.join(" · "),
  }
}
