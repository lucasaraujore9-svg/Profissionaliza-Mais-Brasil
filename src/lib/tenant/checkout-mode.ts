// Fonte ÚNICA de verdade para "esta revenda consegue vender pela própria conta,
// e por qual gateway?". Antes essa decisão estava espalhada e DIVERGENTE em 3+
// lugares (página do curso checava só mpAccessToken — quebrando revendas que só
// usam Asaas; checkout page checava 3 flags; a API checava 4). Centralizar evita
// que uma venda da unidade caia num beco sem saída ou — pior — no gateway da PMB.
//
// REGRA DE OURO: toda venda da revenda usa SEMPRE o gateway da própria unidade
// (MP ou Asaas). Quando NENHUM está configurado (NONE), a vitrine mostra um
// formulário de contato em vez de cobrança — nunca o checkout do sistema mãe.

export type CheckoutMode = "MP" | "ASAAS" | "NONE"

export interface CheckoutModeInput {
  // Gateway ativo escolhido pela unidade ("MP" | "ASAAS"). Default no banco: MP.
  salesGateway?: string | null
  // Asaas liberado pelo Admin Master (capability) + conectado pela unidade.
  asaasGatewayEnabled?: boolean | null
  asaasConnected?: boolean | null
  // Credenciais MP da unidade (token de cobrança + public key do checkout).
  mpAccessToken?: string | null
  mpPublicKey?: string | null
}

/**
 * Decide o gateway efetivo da unidade. Espelha exatamente a lógica do checkout:
 *   1. Asaas só quando é o gateway ativo, liberado pelo Admin Master E conectado.
 *      (O `asaasWebhookToken` — segredo — é a checagem AUTORITATIVA feita
 *       server-side em /api/loja/checkout antes de cobrar; aqui usamos o
 *       invariante "salesGateway==='ASAAS' implica token presente", para não
 *       puxar o segredo para server components/clientes.)
 *   2. Senão, MP quando há token + public key.
 *   3. Senão, NONE → cai no formulário de contato.
 */
export function tenantCheckoutMode(t: CheckoutModeInput): CheckoutMode {
  // Quando a unidade ESCOLHEU Asaas como gateway de vendas, ele é o único válido:
  // se não estiver pronto (capability do Admin Master desligada OU conta
  // desconectada), retornamos NONE — a vitrine mostra o formulário de contato em
  // vez de cair SILENCIOSAMENTE no MP. O fallback antigo (salesGateway===ASAAS mas
  // não-pronto → MP) cobrava numa conta MP antiga que a unidade considerava
  // desativada, contrariando a REGRA DE OURO acima.
  if (t.salesGateway === "ASAAS") {
    const asaasReady = t.asaasGatewayEnabled === true && t.asaasConnected === true
    return asaasReady ? "ASAAS" : "NONE"
  }
  if (t.mpAccessToken && t.mpPublicKey) return "MP"
  return "NONE"
}
