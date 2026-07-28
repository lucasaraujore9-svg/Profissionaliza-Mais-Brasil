/**
 * Helper de teste: monta um `AdminContext` real a partir de um papel da equipe
 * interna PMB.
 *
 * As rotas de /admin passaram a resolver papel + permissões via
 * `adminContext()`, que consulta `prisma.user` (e, por tabela, o NextAuth).
 * Testes de rota que mockam o Prisma parcialmente não têm esses modelos — em
 * vez de duplicar o mock em cada arquivo, eles mockam `@/lib/auth/admin-guard`
 * e usam este helper para produzir um contexto COERENTE: as permissões saem dos
 * presets de verdade, então um teste não consegue "conceder" algo que o papel
 * não tem.
 *
 * Espelha `src/test/painel-ctx.ts`, que faz o mesmo do lado da unidade.
 */

import type { AdminContext } from "@/lib/auth/admin-guard"
import type { PmbTeamRole } from "@/lib/auth/roles"
import {
  resolveAdminPermissions,
  type AdminPermission,
} from "@/lib/auth/admin-permissions"

export function adminCtx({
  userId = "u1",
  role = "SUPER_ADMIN" as PmbTeamRole,
  extra = [] as string[],
  revoked = [] as string[],
}: {
  userId?: string
  role?: PmbTeamRole
  extra?: string[]
  revoked?: string[]
} = {}): AdminContext {
  const permissions = resolveAdminPermissions(role, extra, revoked)
  const can = (perm: AdminPermission) => permissions.has(perm)
  const seesAll = can("unidades.viewAll")

  return {
    userId,
    role,
    name: "Teste",
    email: "teste@pmb.com.br",
    permissions,
    can,
    canAll: (...perms) => perms.every(can),
    canAny: (...perms) => perms.some(can),
    scope: {
      alunos: can("alunos.viewAll")
        ? {}
        : { enrollments: { some: { soldByUserId: userId } } },
      vendas: can("vendas.viewAll") ? {} : { soldByUserId: userId },
      pagamentos: can("vendas.viewAll") ? {} : { soldByUserId: userId },
    },
    async unidadesWhere() {
      if (!can("unidades.view")) return null
      if (seesAll) return {}
      // Recorte simplificado: nos testes basta distinguir "tudo" de "a carteira".
      return { accountManagerId: userId }
    },
    async leadsRevendaWhere() {
      if (!can("leadsRevenda.view")) return null
      if (can("leadsRevenda.viewAll")) return {}
      return { ownerUserId: userId }
    },
    async comissoesScope() {
      if (can("financeiro.viewAll")) return {}
      if (!can("unidades.view")) return null
      if (seesAll) return {}
      return { accountManagerId: userId }
    },
    async canAccessTenant(tenant) {
      if (!tenant || !can("unidades.view")) return false
      return seesAll || tenant.accountManagerId === userId
    },
  }
}

/**
 * Substituto fiel de `requireAdmin`/`requireAdminAny` num teste: aplica de fato
 * o preset do papel, devolvendo 403 quando ele não tem a permissão. Assim o
 * teste continua provando a fronteira, em vez de sempre passar.
 */
export function adminGuardFor(options?: Parameters<typeof adminCtx>[0]) {
  const ctx = adminCtx(options)
  const deny = () =>
    new Response(JSON.stringify({ error: "Permissão negada" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    })

  return {
    requireAdmin: async (...perms: AdminPermission[]) =>
      perms.every((p) => ctx.can(p))
        ? { ok: true as const, ctx }
        : { ok: false as const, response: deny() },
    requireAdminAny: async (...perms: AdminPermission[]) =>
      perms.length === 0 || perms.some((p) => ctx.can(p))
        ? { ok: true as const, ctx }
        : { ok: false as const, response: deny() },
  }
}
