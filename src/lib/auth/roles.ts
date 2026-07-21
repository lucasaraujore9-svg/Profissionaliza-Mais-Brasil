import type { UserRole } from "@prisma/client"

/**
 * Capacidades por papel — centraliza "quem pode fazer o quê" no domínio
 * financeiro/comissões, para que páginas, APIs e a sidebar usem a MESMA regra.
 *
 * O perfil PMB_FINANCEIRO é dedicado à gestão financeira: ajusta regras de
 * comissão, marca comissões/saques como pagos e anexa comprovante (visível
 * para a revenda). SUPER_ADMIN tem o superconjunto.
 */

/**
 * Papéis INTERNOS da PMB — a "equipe" gerenciada em /admin/equipe.
 *
 * Fonte única: páginas, APIs e formulários devem importar daqui. Cada cópia
 * solta desta lista já divergiu uma vez e sumiu com o Financeiro e o Designer
 * da tela (criados pela API, invisíveis na listagem e 404 no detalhe).
 *
 * Revenda (RESELLER) e aluno (STUDENT) NÃO entram: têm telas próprias em
 * /admin/revendedores e /admin/alunos.
 */
export const PMB_TEAM_ROLES = [
  "SUPER_ADMIN",
  "PMB_SALES",
  "PMB_SALES_MGR",
  "PMB_REVENDA_SALES",
  "PMB_RESELLER_MGR",
  "PMB_FINANCEIRO",
  "PMB_DESIGNER",
] as const

export type PmbTeamRole = (typeof PMB_TEAM_ROLES)[number]

/** Rótulo exibido para cada papel interno. */
export const PMB_ROLE_LABEL: Record<PmbTeamRole, string> = {
  SUPER_ADMIN: "Super Admin",
  PMB_SALES: "Vendedor de curso",
  PMB_SALES_MGR: "Gerente de vendas",
  PMB_REVENDA_SALES: "Vendedor de revenda",
  PMB_RESELLER_MGR: "Gerente de unidades",
  PMB_FINANCEIRO: "Financeiro",
  PMB_DESIGNER: "Designer",
}

/** Rótulo com fallback — nunca renderiza `undefined` se surgir papel novo. */
export function pmbRoleLabel(role: string): string {
  return PMB_ROLE_LABEL[role as PmbTeamRole] ?? role
}

export function isPmbTeamRole(role: string | undefined | null): role is PmbTeamRole {
  return !!role && (PMB_TEAM_ROLES as readonly string[]).includes(role)
}

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
