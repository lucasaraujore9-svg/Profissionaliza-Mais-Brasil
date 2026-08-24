import type { CheckoutMode } from "@/lib/tenant/checkout-mode"
import { isFreeAmount } from "@/lib/checkout/free-enrollment"

/**
 * "Esta venda pode acontecer e por qual gateway?" — fonte ÚNICA da decisão nas
 * três portas self-service da vitrine (`/api/loja/checkout`,
 * `/api/loja/checkout/package` e `/api/aluno/comprar` no ramo da revenda).
 *
 * A REGRA NOVA está no `free`: **o gate de gateway só existe quando há algo a
 * cobrar**. Uma unidade que ainda não conectou conta bancária nenhuma (mode
 * NONE) podia criar cupom no painel, e a vitrine dela recusava o checkout com
 * 503 ANTES de olhar o cupom — então um cupom de 100% (que não vai a gateway
 * nenhum, por definição) morria no gate junto com as vendas de verdade. A
 * unidade emitia um cupom que o próprio site dela não aceitava.
 *
 * Com valor zerado a matrícula é liberada como bolsa (ver
 * `releaseFreeEnrollment`), exatamente como a venda direta do painel já fazia:
 * lá o gate de gateway é pulado por `if (!isBolsista)` desde sempre.
 *
 * O `gateway` devolvido no caso gratuito é o ESCOLHIDO pela unidade
 * (`salesGateway`), não o efetivo — nenhuma cobrança sai por ele, mas a coluna
 * alimenta o BI e mentir "MP" numa unidade Asaas distorceria o relatório. Mesmo
 * rótulo honesto que `/api/painel/vendas` grava na bolsa.
 *
 * Chamar DEPOIS de calcular o desconto e ANTES de reservar o cupom: recusar
 * depois do `tryConsumeCoupon` vazaria um uso numa venda que nem aconteceu.
 */

export type SaleGateway = "MP" | "ASAAS"

export type SaleGatewayResolution =
  | { ok: true; gateway: SaleGateway; free: boolean }
  | {
      ok: false
      error: string
      code: "ASAAS_NOT_CONFIGURED" | "CHECKOUT_UNAVAILABLE"
      status: 503
    }

export interface SaleGatewayInput {
  /** Gateway EFETIVO da unidade, por `tenantCheckoutMode`. */
  mode: CheckoutMode
  /** Gateway ESCOLHIDO pela unidade (coluna `Tenant.salesGateway`). */
  salesGateway: SaleGateway
  /**
   * Segredo do webhook Asaas. Sem ele a cobrança até nasce, mas a confirmação
   * do pagamento é recusada em /api/webhooks/asaas (401) e o aluno nunca é
   * liberado.
   */
  asaasWebhookToken?: string | null
  /**
   * Curso produzido por OUTRA unidade: o rateio só existe no Asaas, e
   * `authoredSaleGate` já conferiu conta + token antes daqui.
   */
  requiresSplit?: boolean
  /** Valor que será COBRADO — já com cupom/desconto aplicado. */
  finalAmount: number
}

export function resolveSaleGateway(input: SaleGatewayInput): SaleGatewayResolution {
  const { mode, salesGateway, asaasWebhookToken, finalAmount } = input
  const requiresSplit = input.requiresSplit === true

  // Sem cobrança não há gateway a exigir: a matrícula é liberada na hora.
  if (isFreeAmount(finalAmount)) {
    return {
      ok: true,
      gateway: requiresSplit ? "ASAAS" : mode === "NONE" ? salesGateway : mode,
      free: true,
    }
  }

  if (!requiresSplit && mode === "ASAAS" && !asaasWebhookToken) {
    return {
      ok: false,
      error: "Gateway Asaas incompleto",
      code: "ASAAS_NOT_CONFIGURED",
      status: 503,
    }
  }

  // Sem gateway próprio a vitrine exibe o formulário de contato em vez de
  // cobrar. Nunca há fallback para a conta do sistema mãe (REGRA DE OURO).
  if (!requiresSplit && mode === "NONE") {
    return {
      ok: false,
      error: "Loja ainda não configurou o pagamento",
      code: "CHECKOUT_UNAVAILABLE",
      status: 503,
    }
  }

  return {
    ok: true,
    gateway: requiresSplit ? "ASAAS" : (mode as SaleGateway),
    free: false,
  }
}
