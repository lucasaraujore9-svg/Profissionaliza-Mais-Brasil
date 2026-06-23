// Planos que um revendedor-vendedor pode oferecer ao criar uma SUB-REVENDA.
// Fonte única (form do painel + validação da API): a sub-revenda NUNCA é gratuita
// e o vendedor escolhe SEMPRE entre estes dois. O PRO (239) já habilita o módulo
// de Automação automaticamente. (Admin/sistema mãe segue com valor livre.)

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
    value: 209,
    label: "Profissionaliza",
    automation: false,
    blurb: "Plano base da revenda.",
  },
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
