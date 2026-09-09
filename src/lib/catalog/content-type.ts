/**
 * TIPO DE CONTEUDO — curso (aulas em video) ou e-book (arquivo para ler).
 *
 * Fonte UNICA do vocabulario e das poucas REGRAS que dependem do tipo. Toda a
 * camada comercial e compartilhada — matricula, cobranca, cupom, pacote, split,
 * assinatura, inadimplencia —, entao este arquivo e curto de proposito: quanto
 * menos o sistema perguntar "que tipo e isto?", menos lugares divergem.
 *
 * PURO (sem Prisma, sem `server-only`): os formularios de venda e as telas de
 * catalogo sao client components, e importar valor de um modulo que toca o banco
 * arrastaria o driver `pg` para o navegador — foi o que ja quebrou um build com
 * "Can't resolve 'dns'".
 */
import type { ContentType } from "@prisma/client"

export type { ContentType }

/** Aceita a linha inteira ou so o campo. `undefined` = curso, o default do banco. */
export function isEbook(
  c: { contentType?: ContentType | string | null } | null | undefined,
): boolean {
  return c?.contentType === "EBOOK"
}

/** "Curso" / "E-book". Com hifen: e a grafia do VOLP. */
export function contentLabel(t: ContentType | string | null | undefined): string {
  return t === "EBOOK" ? "E-book" : "Curso"
}

export function contentLabelPlural(t: ContentType | string | null | undefined): string {
  return t === "EBOOK" ? "E-books" : "Cursos"
}

/** Artigo + substantivo, para frases montadas ("recusado: {o e-book} nao tem arquivo"). */
export function contentArticle(t: ContentType | string | null | undefined): string {
  return t === "EBOOK" ? "o e-book" : "o curso"
}

/**
 * O verbo do CTA de quem ja comprou. "Acessar as aulas" num e-book prometeria
 * uma tela que nao existe.
 */
export function contentAccessLabel(t: ContentType | string | null | undefined): string {
  return t === "EBOOK" ? "Ler e-book" : "Acessar aulas"
}

/**
 * E-BOOK NAO EMITE CERTIFICADO — e a regra de negocio mais importante deste
 * arquivo.
 *
 * O certificado do PMB e documento de CURSO LIVRE (Lei nº 9.394/96 + Decreto nº
 * 5.154/2004): ele declara carga horaria e conclusao apurada, traz matriz
 * curricular no verso e vale como atividade complementar. Um e-book nao tem
 * nada disso — a "conclusao" dele e o proprio leitor dizendo que terminou, sem
 * nenhuma apuracao por tras. Emitir seria atestar um aproveitamento que ninguem
 * mediu, num documento que o aluno leva a um empregador.
 *
 * A regra vive aqui, e nao espalhada em cada tela de emissao, porque o
 * certificado tem varias portas (emissao manual do /admin, do /painel, botao do
 * aluno, sync de progresso) e a licao de `GUARDIAN_REQUIRED` foi essa: gate que
 * nasce numa rota so deixa as outras cobrando errado por meses.
 */
export function canIssueCertificate(
  c: { contentType?: ContentType | string | null } | null | undefined,
): boolean {
  return !isEbook(c)
}

/**
 * A COTA DE AULAS (trava proporcional ao pagamento) NAO alcanca e-book.
 *
 * A cota e `floor(parcelas pagas / total x 100)` comparado com o percentual de
 * AULAS assistidas, e aplicada no LMS como um teto de aulas liberadas. Um
 * arquivo nao tem aulas: o progresso dele so tem dois valores (0 e 100), entao
 * o aluno que marcasse "li" seria travado no ato — e o teto enviado ao LMS nao
 * teria em que pegar.
 *
 * CONSEQUENCIA ACEITA, e ela e comercial, nao tecnica: um e-book vendido em 6x
 * fica inteiro disponivel desde a 1a parcela. Quem para de pagar cai na trava de
 * INADIMPLENCIA, que revoga o acesso — a mesma que ja protege qualquer compra a
 * vista. Fatiar um PDF por parcela exigiria servir intervalos de paginas, o que
 * o leitor nao faz e o download derrubaria de qualquer forma.
 */
export function isPaceGateApplicable(
  c: { contentType?: ContentType | string | null } | null | undefined,
): boolean {
  return !isEbook(c)
}

/**
 * A linha de metadado do CARD — o slot que num curso diz "40h" ou "12 aulas".
 *
 * Uma funcao so para os dois tipos, pelo mesmo motivo do `courseMeta` do LMS:
 * quando os dois convivem na mesma prateleira, e aqui que se decide o que cada
 * card diz — e um card de e-book anunciando "0 aulas" e o defeito que se paga
 * por deixar cada mapeador montar a propria linha (e sao tres).
 *
 * No e-book, `cargaHoraria` guarda o TEMPO DE LEITURA que o autor digitou ("2
 * horas") — por isso ele nao leva "h" no fim, ao contrario do curso, em que o
 * campo guarda so o numero.
 */
export function contentCardMeta(c: {
  contentType?: ContentType | string | null
  cargaHoraria?: string | null
  qtdAulas?: number | null
  ebookPages?: number | null
}): string {
  if (isEbook(c)) {
    if (c.ebookPages && c.ebookPages > 0) {
      return `${c.ebookPages} ${c.ebookPages === 1 ? "página" : "páginas"}`
    }
    const leitura = c.cargaHoraria?.trim()
    return leitura ? `${leitura} de leitura` : "E-book"
  }
  return c.cargaHoraria ? `${c.cargaHoraria}h` : `${c.qtdAulas ?? 0} aulas`
}
