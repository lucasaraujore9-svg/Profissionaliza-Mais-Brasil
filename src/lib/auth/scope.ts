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

/** `where` de Lead (revenda/B2B) visivel para o ator. `null` = sem acesso. */
export async function leadScopeWhere(
  actor: ScopeActor,
): Promise<Prisma.LeadWhereInput | null> {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return {}
    case "PMB_REVENDA_SALES":
      return { ownerUserId: actor.userId }
    case "PMB_SALES_MGR":
      return { ownerUserId: { in: await salesTeamIds(actor.userId) } }
    default:
      return null
  }
}

/** Pode trabalhar (mover/converter) leads de revenda B2B. */
export function canHandleRevendaLeads(role: UserRole | string): boolean {
  return (
    role === "SUPER_ADMIN" ||
    role === "PMB_SALES_MGR" ||
    role === "PMB_REVENDA_SALES"
  )
}

/**
 * Pode converter um lead em unidade. Alem dos papeis comerciais, o dono do lead
 * e seu gerente. A checagem fina (dono/time) e feita por leadScopeWhere na rota.
 */
export function canConvertRevendaLeads(role: UserRole | string): boolean {
  return canHandleRevendaLeads(role)
}
