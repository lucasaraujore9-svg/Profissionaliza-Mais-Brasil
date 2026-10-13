// Planos de tabela para unidade NOVA. Fonte única: sub-revenda do painel, API de
// parceiros e cadastro público. Desde 2026-10-13 só existe o PRO (R$ 239, já com
// Automação): o Profissionaliza (R$ 209) saiu de venda. Quem já está nele segue
// como está — por isso a comissão de indicação ainda conhece o 209
// (lib/referrals/plano-base.ts). Nunca gratuito; o /admin segue com valor livre.

export interface ResellerPlan {
  value: number
  /** Nome comercial exibido. */
  label: string
  /** PRO liga o módulo de Automação na criação. */
  automation: boolean
  /** Texto curto de apoio no seletor. */
  blurb: string
}

export const RESELLER_PLANS: readonly ResellerPlan[] = [
  {
    value: 239,
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
