/**
 * Papéis internos da PMB: identidade e rótulo.
 *
 * "Quem pode fazer o quê" NÃO mora mais aqui — mora em
 * `lib/auth/admin-permissions.ts`, que é a fonte única de presets e permissões.
 * As capacidades financeiras que existiam neste arquivo (`canViewFinance`,
 * `canMarkPaid`, `canManageCommissions`) viraram `financeiro.view`,
 * `financeiro.manage` e `indicacoes.config`.
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
  "PMB_RESELLER_DIRECTOR",
  "PMB_RESELLER_MGR",
  "PMB_FINANCEIRO",
  "PMB_DESIGNER",
] as const

export type PmbTeamRole = (typeof PMB_TEAM_ROLES)[number]

/**
 * Papéis elegíveis a SER gerente de conta de uma unidade
 * (`Tenant.accountManagerId`). Não é permissão — é o vínculo estrutural que
 * `lib/auth/scope.ts` usa para recortar a carteira. Fonte única da rota que
 * atribui e da que lista as opções.
 */
export const ACCOUNT_MANAGER_ROLES = [
  "PMB_RESELLER_MGR",
  "PMB_RESELLER_DIRECTOR",
] as const satisfies readonly PmbTeamRole[]

/** Rótulo exibido para cada papel interno. */
export const PMB_ROLE_LABEL: Record<PmbTeamRole, string> = {
  SUPER_ADMIN: "Super Admin",
  PMB_SALES: "Vendedor de curso",
  PMB_SALES_MGR: "Gerente de vendas",
  PMB_REVENDA_SALES: "Vendedor de revenda",
  PMB_RESELLER_DIRECTOR: "Diretor de unidades",
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
