/**
 * ESTORNO de mensalidade — a janela de arrependimento e o efeito na comissao.
 *
 * A unidade pede cancelamento logo depois de pagar e o dinheiro volta. Para o
 * sistema isso importa por uma razao de dinheiro: **mensalidade estornada nao
 * entra na comissao de indicacao**. A PMB nao ficou com a receita, entao nao ha
 * o que ratear com o indicador.
 *
 * O oposto tambem e regra, e e a metade que costuma ser esquecida: unidade
 * CANCELADA que pagou na competencia e NAO foi estornada CONTA normalmente. O
 * dinheiro entrou e ficou; o cancelamento posterior nao o desfaz.
 *
 * Modulo PURO: a regua de prazo e a mensagem saem daqui, e a rota e a tela
 * consomem a mesma resposta — nenhuma das duas reimplementa "quantos dias".
 */
import { daysUntilBrDay } from "@/lib/dates"

/** Prazo de arrependimento, em dias corridos a partir do pagamento. */
export const REFUND_WINDOW_DAYS = 7

export interface JanelaEstorno {
  /** Dias corridos entre o pagamento e hoje, em dia civil brasileiro. */
  diasDesdePagamento: number
  dentroDoPrazo: boolean
  /** Frase pronta para a tela e para a auditoria. */
  descricao: string
}

/**
 * O prazo AVISA, nao impede (decisao do dono).
 *
 * Quando alguem vem registrar um estorno, ele JA ACONTECEU no banco. Bloquear
 * fora do prazo nao desfaz a devolucao: so deixaria o sistema afirmando que a
 * mensalidade foi paga, e a comissao continuaria sendo calculada sobre dinheiro
 * que voltou. O prazo vira aviso + confirmacao explicita, e tudo vai para a
 * trilha de auditoria.
 *
 * Dia civil BRASILEIRO (`daysUntilBrDay`): o servidor roda em UTC e um estorno
 * registrado as 22h de Brasilia cairia no dia seguinte, estourando o prazo por
 * uma diferenca de fuso.
 */
export function janelaEstorno(paidAt: Date, now: Date = new Date()): JanelaEstorno {
  // `daysUntilBrDay` conta do presente para o FUTURO; o pagamento esta no
  // passado, entao o sinal se inverte. O `=== 0` evita o `-0` do JavaScript,
  // que compara diferente de `0` em igualdade estrita e vazaria para a tela.
  const ateOPagamento = daysUntilBrDay(paidAt, now)
  const dias = ateOPagamento === 0 ? 0 : -ateOPagamento
  const dentroDoPrazo = dias <= REFUND_WINDOW_DAYS
  return {
    diasDesdePagamento: dias,
    dentroDoPrazo,
    descricao: dentroDoPrazo
      ? `Pago há ${dias} ${dias === 1 ? "dia" : "dias"} — dentro do prazo de ${REFUND_WINDOW_DAYS} dias.`
      : `Pago há ${dias} dias — FORA do prazo de ${REFUND_WINDOW_DAYS} dias.`,
  }
}

/** Status de cobranca que podem ser estornados: so o que foi efetivamente pago. */
export const REFUNDABLE_STATUSES = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"] as const

export function podeEstornar(status: string, refundedAt: Date | null): boolean {
  if (refundedAt) return false
  return (REFUNDABLE_STATUSES as readonly string[]).includes(status)
}
