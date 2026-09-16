// Fonte ÚNICA de verdade para "esta revenda consegue vender pela própria conta,
// e por qual gateway?". Antes essa decisão estava espalhada e DIVERGENTE em 3+
// lugares (página do curso checava só mpAccessToken — quebrando revendas que só
// usam Asaas; checkout page checava 3 flags; a API checava 4). Centralizar evita
// que uma venda da unidade caia num beco sem saída ou — pior — no gateway da PMB.
//
// REGRA DE OURO: toda venda da revenda usa SEMPRE o gateway da própria unidade
// (MP ou Asaas). Quando NENHUM está configurado (NONE), a vitrine mostra um
// formulário de contato em vez de cobrança — nunca o checkout do sistema mãe.

import { displayInterestFreeInstallments } from "@/lib/mercadopago/installments"

export type CheckoutMode = "MP" | "ASAAS" | "NONE"

export interface CheckoutModeInput {
  // Gateway ativo escolhido pela unidade ("MP" | "ASAAS"). Default no banco: MP.
  salesGateway?: string | null
  // A unidade ja conectou a propria conta Asaas (API key + token do webhook).
  // NAO ha mais capability do Admin Master: as duas opcoes valem para todas.
  asaasConnected?: boolean | null
  // Credenciais MP da unidade (token de cobrança + public key do checkout).
  mpAccessToken?: string | null
  mpPublicKey?: string | null
}

/**
 * Decide o gateway efetivo da unidade. Espelha exatamente a lógica do checkout:
 *   1. Asaas só quando é o gateway ativo E a unidade conectou a conta.
 *      (O `asaasWebhookToken` — segredo — é a checagem AUTORITATIVA feita
 *       server-side em /api/loja/checkout antes de cobrar; aqui usamos o
 *       invariante "salesGateway==='ASAAS' implica token presente", para não
 *       puxar o segredo para server components/clientes.)
 *   2. Senão, MP quando há token + public key.
 *   3. Senão, NONE → cai no formulário de contato.
 */
export function tenantCheckoutMode(t: CheckoutModeInput): CheckoutMode {
  // Quando a unidade ESCOLHEU Asaas como gateway de vendas, ele é o único válido:
  // se a conta não estiver conectada, retornamos NONE — a vitrine mostra o
  // formulário de contato em vez de cair SILENCIOSAMENTE no MP. O fallback antigo
  // (salesGateway===ASAAS mas não-pronto → MP) cobrava numa conta MP antiga que a
  // unidade considerava desativada, contrariando a REGRA DE OURO acima.
  if (t.salesGateway === "ASAAS") {
    return t.asaasConnected === true ? "ASAAS" : "NONE"
  }
  if (t.mpAccessToken && t.mpPublicKey) return "MP"
  return "NONE"
}

export interface AdvertisedInstallmentsInput extends CheckoutModeInput {
  // Nº de parcelas sem juros escolhido pela unidade em Configurações → Pagamento.
  interestFreeInstallments?: number | null
}

/**
 * Colunas de `Tenant` que `tenantAdvertisedInterestFree` precisa. Toda consulta
 * que alimenta o preço exibido na vitrine espalha este select — pegar só
 * `interestFreeInstallments` voltaria a anunciar parcela em loja que não parcela.
 */
export const ADVERTISED_INSTALLMENTS_SELECT = {
  interestFreeInstallments: true,
  salesGateway: true,
  asaasConnected: true,
  mpAccessToken: true,
  mpPublicKey: true,
} as const

/**
 * Quantas parcelas sem juros a vitrine DA UNIDADE pode anunciar ("10x de R$ 10,00
 * sem juros"). `null` = nenhuma: a linha some.
 *
 * Os dois gateways parcelam o cartão da unidade, com regras diferentes:
 *  - Mercado Pago: até 12x sempre; até o nº configurado sai sem juros e acima
 *    dele o aluno paga o juros do emissor.
 *  - Asaas: não existe juros para o aluno — toda parcela é o total dividido, e a
 *    taxa do parcelamento sai da conta da unidade. Por isso o checkout Asaas só
 *    oferece até o nº configurado (`interestFreeInstallmentsFor`).
 * Nos dois, o nº configurado é exatamente o "até Nx sem juros" que se anuncia.
 *
 * Sem gateway (NONE) não há cobrança: anunciar parcelas seria oferta que o
 * checkout não cumpre — e a oferta anunciada obriga quem vende (CDC, art. 30).
 *
 * O limite pela parcela mínima (R$ 5) depende do preço e é aplicado por
 * `interestFreeInstallmentsFor` em cada card/página.
 *
 * Vale só para unidade. A vitrine da PMB cobra pelo Asaas com parcelamento
 * próprio (lib/installments/pmb-rules.ts) e usa `pmbInterestFreeInstallments`.
 */
export function tenantAdvertisedInterestFree(
  t: AdvertisedInstallmentsInput,
): number | null {
  if (tenantCheckoutMode(t) === "NONE") return null
  return displayInterestFreeInstallments(t.interestFreeInstallments)
}
