/**
 * Helper de teste: monta um `PainelContext` real a partir de um papel.
 *
 * As rotas de /painel passaram a resolver papel + permissões via
 * `painelContext()`, que consulta `prisma.user` e `prisma.tenantMember`. Testes
 * de rota que mockam o Prisma parcialmente não têm esses modelos — em vez de
 * duplicar o mock em cada arquivo, eles mockam `@/lib/auth/painel-guard` e
 * usam este helper para produzir um contexto COERENTE (as permissões saem dos
 * presets de verdade, então um teste não consegue "conceder" algo que o papel
 * não tem).
 */

import type { PainelContext } from "@/lib/auth/painel-guard"
import {
  resolvePermissions,
  type PainelMemberRole,
  type PainelPermission,
} from "@/lib/auth/painel-permissions"

export function painelCtx({
  userId = "u1",
  tenantId = "t1",
  role = "owner" as PainelMemberRole,
  extra = [] as string[],
  revoked = [] as string[],
  maxDiscount = null as number | null,
}: {
  userId?: string
  tenantId?: string
  role?: PainelMemberRole
  extra?: string[]
  revoked?: string[]
  maxDiscount?: number | null
} = {}): PainelContext {
  const permissions = resolvePermissions(role, extra, revoked)
  return {
    userId,
    tenantId,
    memberRole: role,
    isOwner: role === "owner",
    isPreview: false,
    permissions,
    maxDiscount,
    can: (perm: PainelPermission) => permissions.has(perm),
    scope: {
      alunos: permissions.has("alunos.viewAll")
        ? {}
        : { enrollments: { some: { soldByUserId: userId } } },
      vendas: permissions.has("vendas.viewAll") ? {} : { soldByUserId: userId },
      leads: permissions.has("leads.viewAll") ? {} : { ownerUserId: userId },
    },
  }
}

/** Resposta de sucesso de `requirePainel` para o papel informado. */
export function painelGuardOk(options?: Parameters<typeof painelCtx>[0]) {
  return { ok: true as const, ctx: painelCtx(options) }
}
