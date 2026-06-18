import type { UserRole } from "@prisma/client"

/**
 * Capacidades por papel — centraliza "quem pode fazer o quê" no domínio
 * financeiro/comissões, para que páginas, APIs e a sidebar usem a MESMA regra.
 *
 * O perfil PMB_FINANCEIRO é dedicado à gestão financeira: ajusta regras de
 * comissão, marca comissões/saques como pagos e anexa comprovante (visível
 * para a revenda). SUPER_ADMIN tem o superconjunto.
 */

/** Equipe que enxerga a área financeira do admin (visão de comissões/mensalidades). */
export const FINANCE_VIEW_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "PMB_FINANCEIRO",
  "PMB_SALES",
  "PMB_RESELLER_MGR",
]

/** Quem pode ver TODA a área financeira (mensalidades a receber + visão geral). */
export const FINANCE_FULL_ROLES: UserRole[] = ["SUPER_ADMIN", "PMB_FINANCEIRO"]

/** Quem pode marcar como pago e anexar comprovante (comissões/saques/mensalidades). */
export const FINANCE_WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "PMB_FINANCEIRO"]

/** Quem pode ajustar regras/percentuais de comissão. */
export const COMMISSION_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "PMB_FINANCEIRO"]

export function canViewFinance(role: UserRole | undefined | null): boolean {
  return !!role && FINANCE_VIEW_ROLES.includes(role)
}

export function canViewFullFinance(role: UserRole | undefined | null): boolean {
  return !!role && FINANCE_FULL_ROLES.includes(role)
}

export function canMarkPaid(role: UserRole | undefined | null): boolean {
  return !!role && FINANCE_WRITE_ROLES.includes(role)
}

export function canManageCommissions(role: UserRole | undefined | null): boolean {
  return !!role && COMMISSION_MANAGE_ROLES.includes(role)
}
