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
  const asaasReady =
    t.salesGateway === "ASAAS" &&
    t.asaasGatewayEnabled === true &&
    t.asaasConnected === true
  if (asaasReady) return "ASAAS"
  if (t.mpAccessToken && t.mpPublicKey) return "MP"
  return "NONE"
}

/** Conveniência: a unidade tem QUALQUER gateway próprio configurado? */
export function canResellerCheckout(t: CheckoutModeInput): boolean {
  return tenantCheckoutMode(t) !== "NONE"
}
