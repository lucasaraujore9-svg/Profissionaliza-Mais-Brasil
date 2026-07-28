/**
 * Guard de permissão do sistema mãe (equipe interna PMB).
 *
 * Substitui o uso solto de `requireAdminSession` + checagens inline de papel
 * (`if (session.role !== "SUPER_ADMIN")`) espalhadas pelas rotas e páginas de
 * /admin. Aquele padrão só respondia "é alguém da equipe PMB?" e deixava cada
 * rota reimplementar a matriz — foi assim que /admin/financeiro passou a abrir
 * para o vendedor de curso com a única aba da tela retornando 403.
 *
 * As permissões NÃO vivem no JWT de propósito: o callback `jwt` tem throttle de
 * 60s, então um token recém-emitido manteria uma pessoa rebaixada com o poder
 * antigo por até um minuto. Resolvemos por request com um `findUnique` na PK.
 *
 * Escopo comercial: diferente do painel da unidade (onde a fronteira é sempre
 * "o que a pessoa originou"), aqui o recorte é ESTRUTURAL — a unidade pertence
 * a alguém por `accountManagerId`, por `salesUserId` ou pelo time de vendas,
 * conforme o papel. Por isso o escopo continua vindo de `lib/auth/scope.ts`, e
 * as permissões `*.viewAll` funcionam como um "ignore o recorte do papel".
 */

import { redirect } from "next/navigation"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { isPmbTeamRole, type PmbTeamRole } from "@/lib/auth/roles"
import {
  resolveAdminPermissions,
  type AdminPermission,
} from "@/lib/auth/admin-permissions"
import {
  canAccessTenantScope,
  leadScopeWhere,
  tenantScopeWhere,
} from "@/lib/auth/scope"

export interface AdminScope {
  /** Alunos da vitrine PMB: `{}` para quem tem alunos.viewAll. */
  alunos: Prisma.StudentWhereInput
  /** Matrículas/vendas diretas: `{}` para quem tem vendas.viewAll. */
  vendas: Prisma.EnrollmentWhereInput
  /** Pagamentos das vendas diretas: `{}` para quem tem vendas.viewAll. */
  pagamentos: Prisma.PaymentWhereInput
}

export interface AdminContext {
  userId: string
  role: PmbTeamRole
  name: string
  email: string
  permissions: Set<AdminPermission>
  can(perm: AdminPermission): boolean
  /** true se tiver TODAS as permissões informadas. */
  canAll(...perms: AdminPermission[]): boolean
  /** true se tiver PELO MENOS UMA das permissões informadas. */
  canAny(...perms: AdminPermission[]): boolean
  scope: AdminScope
  /**
   * `where` das unidades visíveis. `null` = sem acesso a unidade nenhuma (a
   * rota deve negar ou devolver lista vazia, nunca ignorar o filtro).
   */
  unidadesWhere(): Promise<Prisma.TenantWhereInput | null>
  /** `where` dos leads de revenda visíveis. `null` = sem acesso. */
  leadsRevendaWhere(): Promise<Prisma.LeadWhereInput | null>
  /**
   * `where` das unidades cujo DINHEIRO (comissões de indicação, saques) a
   * pessoa alcança — para aplicar em `referrer`/`referrerTenant`.
   *   `{}`   = sem restrição (visão financeira do ecossistema)
   *   where  = só a carteira, no formato do papel (accountManagerId,
   *            salesUserId ou time de vendas)
   *   `null` = não alcança unidade nenhuma → a rota deve negar
   *
   * Existe para as rotas não re-derivarem o recorte à mão. A derivação
   * `can("unidades.view") && !can("unidades.viewAll")` que estava espalhada
   * era errada nos dois sentidos: revogar `unidades.view` REMOVIA o filtro
   * (ampliando o acesso), e ela assumia `accountManagerId` para papéis cujo
   * vínculo com a unidade é `salesUserId`.
   */
  comissoesScope(): Promise<Prisma.TenantWhereInput | null>
  /** Autoriza uma unidade JÁ carregada (quando a rota precisa do registro antes). */
  canAccessTenant(
    tenant: { accountManagerId: string | null; salesUserId: string | null } | null,
  ): Promise<boolean>
}

/**
 * Fronteira "só o que é dele" na vitrine PMB. Os campos de autoria já existem:
 * Enrollment/Payment.soldByUserId. Venda self-service tem `soldByUserId = null`
 * e portanto NÃO aparece para quem não tem `viewAll` — ela é da PMB, não de um
 * vendedor.
 */
function buildScope(userId: string, permissions: Set<AdminPermission>): AdminScope {
  const all = permissions.has("vendas.viewAll")
  return {
    alunos: permissions.has("alunos.viewAll")
      ? {}
      : { enrollments: { some: { soldByUserId: userId } } },
    vendas: all ? {} : { soldByUserId: userId },
    pagamentos: all ? {} : { soldByUserId: userId },
  }
}

function buildContext(input: {
  userId: string
  role: PmbTeamRole
  name: string
  email: string
  permissions: Set<AdminPermission>
}): AdminContext {
  const { userId, role, permissions } = input
  const can = (perm: AdminPermission) => permissions.has(perm)
  const actor = { userId, role }

  return {
    ...input,
    can,
    canAll: (...perms) => perms.every(can),
    canAny: (...perms) => perms.some(can),
    scope: buildScope(userId, permissions),

    async unidadesWhere() {
      if (!can("unidades.view")) return null
      if (can("unidades.viewAll")) return {}
      return tenantScopeWhere(actor)
    },

    async leadsRevendaWhere() {
      if (!can("leadsRevenda.view")) return null
      if (can("leadsRevenda.viewAll")) return {}
      return leadScopeWhere(actor)
    },

    async comissoesScope() {
      // Visão financeira do ecossistema (super, financeiro) não é recortada
      // por carteira; os demais só alcançam o dinheiro das unidades que veem.
      if (can("financeiro.viewAll")) return {}
      if (!can("unidades.view")) return null
      if (can("unidades.viewAll")) return {}
      return tenantScopeWhere(actor)
    },

    async canAccessTenant(tenant) {
      if (!tenant || !can("unidades.view")) return false
      if (can("unidades.viewAll")) return true
      return canAccessTenantScope(actor, tenant)
    },
  }
}

/**
 * Contexto da pessoa logada no admin, ou `null` se não houver sessão válida da
 * equipe interna.
 *
 * Conta com status != ATIVO é tratada como sem acesso (fail-closed) — o
 * callback `jwt` já derruba a sessão, mas a checagem aqui fecha a janela de até
 * 60s do throttle.
 */
export async function adminContext(): Promise<AdminContext | null> {
  const session = await auth()
  const sessionUser = session?.user as
    | { id?: string; role?: string }
    | undefined
  if (!sessionUser?.id || !isPmbTeamRole(sessionUser.role)) return null

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      extraPermissions: true,
      revokedPermissions: true,
    },
  })

  if (!user || user.status !== "ATIVO" || !isPmbTeamRole(user.role)) return null

  return buildContext({
    userId: user.id,
    // O papel do BANCO vence o do token: rebaixar alguém tem efeito imediato.
    role: user.role,
    name: user.name,
    email: user.email,
    permissions: resolveAdminPermissions(
      user.role,
      user.extraPermissions,
      user.revokedPermissions,
    ),
  })
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: "Permissão negada" }), {
    status: 403,
    headers: { "content-type": "application/json" },
  })
}

function unauthenticated(): Response {
  return new Response(JSON.stringify({ error: "Não autenticado" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  })
}

/**
 * Guard para route handlers. Exige TODAS as permissões informadas.
 *
 * Uso:
 *   const guard = await requireAdmin("financeiro.viewAll")
 *   if (!guard.ok) return guard.response
 *   const { ctx } = guard
 *
 * Sem argumentos, exige apenas uma sessão válida da equipe interna — use assim
 * só em rotas de auto-serviço (o próprio perfil, a própria senha).
 */
export async function requireAdmin(
  ...perms: AdminPermission[]
): Promise<{ ok: true; ctx: AdminContext } | { ok: false; response: Response }> {
  const ctx = await adminContext()
  if (!ctx) return { ok: false, response: unauthenticated() }
  for (const perm of perms) {
    if (!ctx.can(perm)) return { ok: false, response: forbidden() }
  }
  return { ok: true, ctx }
}

/** Variante que aceita QUALQUER UMA das permissões (rotas com dois públicos). */
export async function requireAdminAny(
  ...perms: AdminPermission[]
): Promise<{ ok: true; ctx: AdminContext } | { ok: false; response: Response }> {
  const ctx = await adminContext()
  if (!ctx) return { ok: false, response: unauthenticated() }
  if (perms.length > 0 && !ctx.canAny(...perms)) {
    return { ok: false, response: forbidden() }
  }
  return { ok: true, ctx }
}

/**
 * Primeira página que a pessoa consegue abrir. Usado como destino do redirect
 * quando falta permissão — e por isso precisa terminar sempre numa rota que a
 * pessoa realmente acessa, senão o redirect entra em loop.
 * `/admin/meu-perfil` é o piso: `perfil.edit` está em todos os presets.
 */
export function adminHome(ctx: AdminContext): string {
  if (ctx.can("dashboard.view")) return "/admin"
  if (ctx.can("artes.view")) return "/admin/artes"
  return "/admin/meu-perfil"
}

/**
 * Guard para server components. Redireciona em vez de responder 403:
 *   - sem sessão      → /login
 *   - sem permissão   → a home acessível da pessoa (ver `adminHome`)
 */
export async function requireAdminPage(
  ...perms: AdminPermission[]
): Promise<AdminContext> {
  const ctx = await adminContext()
  if (!ctx) redirect("/login?callbackUrl=/admin")
  for (const perm of perms) {
    if (!ctx.can(perm)) redirect(adminHome(ctx))
  }
  return ctx
}

/** Variante de página que aceita QUALQUER UMA das permissões. */
export async function requireAdminPageAny(
  ...perms: AdminPermission[]
): Promise<AdminContext> {
  const ctx = await adminContext()
  if (!ctx) redirect("/login?callbackUrl=/admin")
  if (perms.length > 0 && !ctx.canAny(...perms)) redirect(adminHome(ctx))
  return ctx
}
