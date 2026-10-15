import type { AsaasPayment } from "./types"

/**
 * Estado de uma cobrança da conta-mãe para as telas e rotas públicas de
 * `/cobranca` — o link que a unidade recebe por e-mail para pagar a
 * mensalidade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO EXISTE
 *
 * `AsaasPayment.status` NÃO diz se a cobrança foi removida. O DELETE do Asaas é
 * um SOFT DELETE: a cobrança apagada segue respondendo 200 e MANTÉM o último
 * status — PENDING ou OVERDUE. Não existe valor "DELETED" no enum de status da
 * API; quem responde é o campo `deleted`.
 *
 * As quatro rotas de `/cobranca` decidiam só por `status`, e por isso uma
 * cobrança apagada continuava totalmente "pagável": a página desenhava o
 * checkout inteiro, o PIX gerava um QR de uma cobrança que não existe mais — o
 * banco recusa com "QR Code não é válido" — e o cartão seria capturado contra
 * ela. A página até tinha o rótulo "Cancelada", mas atrelado a
 * `status === "DELETED"`, um valor que o Asaas nunca envia: era código morto.
 *
 * Um helper só, usado por todas as portas, porque gate que precisa ser lembrado
 * a cada rota nova é gate que uma hora fica de fora.
 */

type ChargeState = Pick<AsaasPayment, "status" | "deleted">

/** Status do Asaas em que a cobrança ainda aceita pagamento. */
const OPEN_STATUSES = new Set(["PENDING", "OVERDUE"])

/**
 * Rótulo de status para exibição e para o polling da tela. Colapsa a cobrança
 * removida em `"DELETED"` — o nome que o resto do sistema já usa (`STATUS_INFO`
 * da página, `TenantPayment.status`) — para que "removida" deixe de ser um
 * estado invisível.
 */
export function chargeStatus(payment: ChargeState): string {
  return payment.deleted ? "DELETED" : payment.status
}

/**
 * A cobrança pode ser paga AGORA? Exige as duas coisas: não removida E em
 * aberto. Verificar só o status deixa passar a cobrança apagada; verificar só
 * `deleted` deixa passar a já paga.
 */
export function isChargePayable(payment: ChargeState): boolean {
  return !payment.deleted && OPEN_STATUSES.has(payment.status)
}

/**
 * PIX que alguem mandou DIRETO para a chave da conta, sem cobranca nossa.
 *
 * O Asaas registra todo PIX recebido como uma cobranca que ele mesmo cria, com
 * o cliente do PAGADOR e esta descricao fixa. Quando o CPF de quem pagou e o do
 * titular de uma unidade, o fallback de "mensalidade avulsa" (casamento por
 * `customer`) contava qualquer valor como mensalidade: um PIX de teste de R$ 1
 * e uma transferencia de R$ 16 entraram no financeiro em 15/10/2026.
 *
 * Nao existe campo que marque a origem — a descricao e o unico sinal.
 * ponytail: se o Asaas mudar o texto, o PIX volta a contar; o teste com o
 * payload real denuncia so a regressao do nosso lado, nao a do Asaas.
 */
export function isPixRecebidoSemCobranca(
  payment: Pick<AsaasPayment, "billingType" | "description">,
): boolean {
  return (
    payment.billingType === "PIX" &&
    /a partir de pix recebido/i.test(
      (payment.description ?? "").normalize("NFD").replace(/[̀-ͯ]/g, ""),
    )
  )
}
