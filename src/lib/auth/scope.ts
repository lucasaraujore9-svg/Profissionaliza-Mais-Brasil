import { prisma } from "@/lib/prisma"
import type { Prisma, UserRole } from "@prisma/client"

/**
 * Escopo de visibilidade comercial por papel.
 *
 * Regras (decididas com o time):
 *   - SUPER_ADMIN          -> tudo
 *   - PMB_SALES_MGR        -> unidades/leads do seu TIME (vendedores de revenda
 *                             sob ele, via User.salesManagerId) + os seus
 *   - PMB_REVENDA_SALES    -> apenas as SUAS unidades (Tenant.salesUserId) e os
 *                             SEUS leads B2B (Lead.ownerUserId)
 *   - PMB_RESELLER_MGR     -> apenas as unidades onde e suporte (accountManagerId);
 *                             nao enxerga leads B2B
 *   - PMB_RESELLER_DIRECTOR-> mesmo vinculo estrutural do gerente de unidades
 *                             (accountManagerId) + os seus leads B2B. Na pratica
 *                             o preset dele tem `unidades.viewAll` e
 *                             `leadsRevenda.viewAll`, entao o admin-guard
 *                             curto-circuita para `{}` antes de chegar aqui —
 *                             este ramo so vale se alguem REVOGAR o viewAll
 *                             dele, e serve pra degradar para a carteira em vez
 *                             de zerar o acesso.
 *   - PMB_SALES            -> vendedor de curso (B2C); nao enxerga unidades/leads B2B
 *
 * As funcoes retornam um `where` Prisma pronto pra espalhar na query, ou `null`
 * quando o papel nao tem acesso aquele recurso (a rota deve negar/retornar vazio).
 */

export interface ScopeActor {
  userId: string
  role: UserRole | string
}

/**
 * IDs dos vendedores de revenda sob um gerente de vendas, incluindo o proprio
 * gerente (um gerente tambem pode ter unidades/leads atribuidos diretamente).
 */
export async function salesTeamIds(managerId: string): Promise<string[]> {
  const reports = await prisma.user.findMany({
    where: { salesManagerId: managerId },
    select: { id: true },
  })
  return [managerId, ...reports.map((r) => r.id)]
}

/** `where` de Tenant visivel para o ator. `null` = sem acesso a unidades. */
export async function tenantScopeWhere(
  actor: ScopeActor,
): Promise<Prisma.TenantWhereInput | null> {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return {}
    case "PMB_RESELLER_DIRECTOR":
    case "PMB_RESELLER_MGR":
      return { accountManagerId: actor.userId }
    case "PMB_REVENDA_SALES":
      return { salesUserId: actor.userId }
    case "PMB_SALES_MGR":
      return { salesUserId: { in: await salesTeamIds(actor.userId) } }
    default:
      return null
  }
}

/**
 * Mesma regra de `tenantScopeWhere`, porem aplicada a um tenant ja carregado
 * (quando a rota precisa do registro antes de autorizar). `true` = autorizado.
 *   SUPER_ADMIN       -> qualquer unidade
 *   PMB_RESELLER_MGR  -> unidades onde e account manager (accountManagerId)
 *   PMB_REVENDA_SALES -> unidades onde e o vendedor (salesUserId)
 *   PMB_SALES_MGR     -> unidades do seu time de vendas
 *   demais (PMB_SALES, PMB_FINANCEIRO, ...) -> nunca
 */
export async function canAccessTenantScope(
  actor: ScopeActor,
  tenant: { accountManagerId: string | null; salesUserId: string | null } | null,
): Promise<boolean> {
  if (!tenant) return false
  switch (actor.role) {
    case "SUPER_ADMIN":
      return true
    case "PMB_RESELLER_DIRECTOR":
    case "PMB_RESELLER_MGR":
      return tenant.accountManagerId === actor.userId
    case "PMB_REVENDA_SALES":
      return tenant.salesUserId === actor.userId
    case "PMB_SALES_MGR": {
      if (!tenant.salesUserId) return false
      const team = await salesTeamIds(actor.userId)
      return team.includes(tenant.salesUserId)
    }
    default:
      return false
  }
}

/** `where` de Lead (revenda/B2B) visivel para o ator. `null` = sem acesso. */
export async function leadScopeWhere(
  actor: ScopeActor,
): Promise<Prisma.LeadWhereInput | null> {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return {}
    case "PMB_RESELLER_DIRECTOR":
    case "PMB_REVENDA_SALES":
      return { ownerUserId: actor.userId }
    case "PMB_SALES_MGR":
      return { ownerUserId: { in: await salesTeamIds(actor.userId) } }
    default:
      return null
  }
}
