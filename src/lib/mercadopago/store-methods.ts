/**
 * Deriva quais dos 3 métodos da vitrine (PIX / Cartão / Boleto) a CONTA de
 * Mercado Pago da unidade realmente aceita, a partir da resposta de
 * `GET /v1/payment_methods` daquela conta.
 *
 * Motivação (bug real conectandosaberes): uma conta MP SEM chave PIX cadastrada
 * não traz o método `pix` em `payment_methods`. Como o checkout começava com
 * PIX pré-selecionado, o comprador clicava "Finalizar" e o servidor fazia
 * `POST /v1/payments {payment_method_id:"pix"}` numa conta sem PIX → o MP
 * recusava e a venda estourava "erro ao gerar pagamento". Ofertar somente o que
 * a conta suporta elimina a classe inteira do problema (vale p/ qualquer método).
 */

export type StoreMethod = "PIX" | "CREDIT_CARD" | "BOLETO"

/** Entrada mínima de um item de `GET /v1/payment_methods`. */
export interface MpAccountMethod {
  id: string
  payment_type_id?: string
}

/** Ordem de exibição/preferência estável: PIX → Cartão → Boleto. */
const ORDER: StoreMethod[] = ["PIX", "CREDIT_CARD", "BOLETO"]

/**
 * Subconjunto de {PIX, CREDIT_CARD, BOLETO} suportado pela conta, na ordem
 * canônica. PIX = método `pix` (payment_type_id `bank_transfer`); Cartão =
 * qualquer `credit_card`; Boleto = qualquer `ticket` (ex.: bolbradesco).
 */
export function availableStoreMethods(
  methods: readonly MpAccountMethod[],
): StoreMethod[] {
  const hasPix = methods.some(
    (m) => m.id === "pix" || m.payment_type_id === "bank_transfer",
  )
  const hasCard = methods.some((m) => m.payment_type_id === "credit_card")
  const hasBoleto = methods.some((m) => m.payment_type_id === "ticket")
  const enabled: Record<StoreMethod, boolean> = {
    PIX: hasPix,
    CREDIT_CARD: hasCard,
    BOLETO: hasBoleto,
  }
  return ORDER.filter((m) => enabled[m])
}

/**
 * Método default a pré-selecionar: prefere PIX, senão Cartão, senão Boleto.
 * Lista vazia (não deveria ocorrer) → PIX como fallback neutro.
 */
export function defaultStoreMethod(available: readonly StoreMethod[]): StoreMethod {
  return ORDER.find((m) => available.includes(m)) ?? "PIX"
}
