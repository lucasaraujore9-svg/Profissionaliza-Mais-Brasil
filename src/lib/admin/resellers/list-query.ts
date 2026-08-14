/**
 * Filtros e recorte da lista de unidades do /admin — FONTE ÚNICA.
 *
 * A tela `/admin/revendedores` e o export XLSX precisam responder exatamente ao
 * mesmo `where`: se o export re-derivasse o recorte de carteira por conta
 * própria, ele viraria a porta larga que a lista fecha — a pessoa vê 12
 * unidades na tela e baixa uma planilha com as 300 da rede. Por isso as duas
 * rotas chamam `resellerListWhere` e nenhuma monta `where` de tenant sozinha.
 *
 * Composição por `AND` (e não `Object.assign`/spread) de propósito: o filtro
 * "Nunca ativou" traz `status`, o recorte do papel traz `salesUserId`, e um
 * spread faria a última cláusula escrita apagar a anterior em silêncio.
 */
import type { Prisma } from "@prisma/client"
import type { AdminContext } from "@/lib/auth/admin-guard"
import {
  NEVER_ACTIVATED_WHERE,
  NUNCA_ATIVOU_FILTER,
} from "@/lib/tenants/lifecycle"

const TENANT_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED", "CANCELLED"] as const

export interface ResellerListFilters {
  /** Busca por nome/slug da unidade ou nome/e-mail do titular. */
  q: string
  /** Um `TenantStatus`, o balde `NUNCA_ATIVOU`, ou "" para todos. */
  status: string
  /** Id do gerente de conta, "unassigned", ou "" para todos. */
  manager: string
}

export function parseResellerListFilters(
  searchParams: URLSearchParams,
): ResellerListFilters {
  return {
    q: searchParams.get("q")?.trim() ?? "",
    status: searchParams.get("status")?.trim().toUpperCase() ?? "",
    manager: searchParams.get("manager")?.trim() ?? "",
  }
}

export interface ResellerListQuery {
  /** Busca + status + recorte, prontos para o `findMany`. */
  where: Prisma.TenantWhereInput
  /**
   * SÓ o recorte de carteira, sem os filtros da tela. É o que as contagens do
   * topo usam: elas mostram "23 ativas / 4 suspensas" do universo da pessoa,
   * não do filtro que ela acabou de clicar.
   */
  scope: Prisma.TenantWhereInput
}

/**
 * `where` completo da listagem: busca + status + recorte de carteira.
 *
 * Devolve `null` quando quem chamou não alcança unidade nenhuma — o chamador
 * deve responder vazio, NUNCA cair para um `where` sem filtro (era assim que
 * revogar uma permissão ampliava o acesso em vez de reduzi-lo).
 */
export async function resellerListWhere(
  ctx: AdminContext,
  filters: ResellerListFilters,
): Promise<ResellerListQuery | null> {
  const scope = await ctx.unidadesWhere()
  if (!scope) return null

  const and: Prisma.TenantWhereInput[] = [scope]

  if (filters.q) {
    and.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { slug: { contains: filters.q, mode: "insensitive" } },
        { owner: { email: { contains: filters.q, mode: "insensitive" } } },
        // Busca tambem pelo nome do admin/dono da revenda (User.tenantId @unique).
        { owner: { name: { contains: filters.q, mode: "insensitive" } } },
      ],
    })
  }

  if ((TENANT_STATUSES as readonly string[]).includes(filters.status)) {
    and.push({ status: filters.status as Prisma.TenantWhereInput["status"] })
  } else if (filters.status === NUNCA_ATIVOU_FILTER) {
    // Não é um `TenantStatus` — é o recorte "fora do ar E nunca pagou", o mesmo
    // balde do relatório de churn.
    and.push(NEVER_ACTIVATED_WHERE)
  }

  // Filtro manual por gerente de suporte: só faz sentido para quem vê todas.
  // Para quem tem carteira, o gerente já é ele mesmo — deixar o parâmetro passar
  // não ampliaria o acesso (o `scope` continua no AND), mas confundiria a tela.
  if (filters.manager && ctx.can("unidades.viewAll")) {
    and.push({
      accountManagerId: filters.manager === "unassigned" ? null : filters.manager,
    })
  }

  return { where: { AND: and }, scope }
}
