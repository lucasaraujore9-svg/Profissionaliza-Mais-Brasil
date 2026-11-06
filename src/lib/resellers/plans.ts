// Planos de tabela para unidade NOVA. Fonte única: sub-revenda do painel, API de
// parceiros e cadastro público. Só existe o PRO (já com Automação): o
// Profissionaliza (R$ 209) saiu de venda em 2026-10-13.
//
// Desde 2026-11-05 o preço depende de COMO a unidade paga (decisão do dono, para
// reduzir inadimplência):
//   - mês a mês (boleto ou PIX comum, pago à mão a cada mês) → R$ 329
//   - débito automático (cartão recorrente)                  → R$ 289
// A assinatura nasce em R$ 329 (`value`); a unidade troca para o débito
// automático na página /cobranca (lib/tenant-billing/card-subscription.ts).
// Unidade que já existia segue no valor gravado na assinatura dela (239/209).
// Nunca gratuito; o /admin segue com valor livre.

export interface ResellerPlan {
  /** Mensalidade paga mês a mês (boleto/PIX). É o valor da assinatura na criação. */
  value: number
  /** Mensalidade no débito automático (cartão recorrente). */
  recurringValue: number
  /** Nome comercial exibido. */
  label: string
  /** PRO liga o módulo de Automação na criação. */
  automation: boolean
  /** Texto curto de apoio no seletor. */
  blurb: string
}

export const RESELLER_PLANS: readonly ResellerPlan[] = [
  {
    value: 329,
    recurringValue: 289,
    label: "Profissionaliza PRO",
    automation: true,
    blurb: "Inclui o módulo de Automação (WhatsApp + Leads).",
  },
] as const

export const RESELLER_PLAN_VALUES = RESELLER_PLANS.map((p) => p.value)

/** True se o plano escolhido já habilita Automação (PRO). */
export function planEnablesAutomation(value: number): boolean {
  return RESELLER_PLANS.some((p) => p.value === value && p.automation)
}

/** Valida que o valor é um dos planos permitidos para sub-revenda. */
export function isAllowedResellerPlan(value: number): boolean {
  return RESELLER_PLAN_VALUES.includes(value)
}

/**
 * Mensalidade no débito automático para ESTA unidade, ou null se ela não tem
 * direito. Só a unidade no preço de tabela atual (mês a mês) e sem promoção:
 * unidade antiga (239/209) ficaria MAIS cara trocando, e cortesia/promo já é
 * preço negociado no /admin.
 */
export function recurringMonthlyValue(tenant: {
  planValue: number
  hasPromo: boolean
}): number | null {
  if (tenant.hasPromo) return null
  return RESELLER_PLANS.find((p) => p.value === tenant.planValue)?.recurringValue ?? null
}
