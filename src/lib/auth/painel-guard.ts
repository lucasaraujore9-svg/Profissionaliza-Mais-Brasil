/**
 * Guard de permissão do painel da unidade (revenda).
 *
 * Substitui o uso solto de `requireResellerSession` nas rotas: aquele helper só
 * responde "é um RESELLER com tenant?", o que fazia com que qualquer membro da
 * equipe tivesse os mesmos poderes do dono (trocar token de gateway, mudar
 * domínio, ver o financeiro inteiro...). Aqui resolvemos também O QUE a pessoa
 * pode, a partir do papel + overrides em TenantMember.
 *
 * As permissões NÃO vivem no JWT de propósito: um token de até 60s de idade
 * (throttle do callback jwt) manteria um membro rebaixado com poder antigo.
 * Resolvemos por request com uma query indexada por `@@unique([tenantId, userId])`.
 */

import { redirect } from "next/navigation"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import {
  normalizeMemberRole,
  resolvePermissions,
  toReadOnly,
  type PainelMemberRole,
  type PainelPermission,
} from "@/lib/auth/painel-permissions"
import { readPreviewRole } from "@/lib/auth/painel-preview"

export interface PainelScope {
  /** Filtro de alunos: `{}` para quem tem alunos.viewAll. */
  alunos: Prisma.StudentWhereInput
  /** Filtro de matrículas/vendas: `{}` para quem tem vendas.viewAll. */
  vendas: Prisma.EnrollmentWhereInput
  /**
   * Mesmo recorte, para as vendas de ASSINATURA. Existe como campo próprio
   * porque `StudentSubscription` é outro model e o `where` de `Enrollment` não
   * serve nele — e re-derivar o recorte dentro da rota é justamente o padrão
   * que já produziu vazamento aqui (ver a nota sobre carteira no CLAUDE.md).
   */
  assinaturas: Prisma.StudentSubscriptionWhereInput
  /** Filtro de pagamentos (faturamento): `{}` para quem tem vendas.viewAll. */
  pagamentos: Prisma.PaymentWhereInput
  /** Filtro de leads: `{}` para quem tem leads.viewAll. */
  leads: Prisma.StudentLeadWhereInput
}

export interface PainelContext {
  userId: string
  tenantId: string
  memberRole: PainelMemberRole
  /** Dono DIRETO da unidade (User.tenantId aponta pro tenant). */
  isOwner: boolean
  /** true quando o dono está usando a prévia "ver como" (modo leitura). */
  isPreview: boolean
  permissions: Set<PainelPermission>
  can(perm: PainelPermission): boolean
  /** Teto de desconto do membro em %, quando definido pelo dono. */
  maxDiscount: number | null
  scope: PainelScope
}

/**
 * Fragmentos de escopo "só o que é dele".
 *
 * Espelha o padrão já usado no lado admin para PMB_SALES
 * (src/app/api/admin/alunos/route.ts). Os campos de autoria já existem no
 * schema: Enrollment/Payment.soldByUserId e StudentLead.ownerUserId.
 *
 * Vendas de vitrine (self-service) têm soldByUserId = null e portanto NÃO
 * aparecem para quem não tem `viewAll` — elas pertencem à unidade, não a um
 * vendedor.
 */
function buildScope(
  userId: string,
  permissions: Set<PainelPermission>,
): PainelScope {
  return {
    alunos: permissions.has("alunos.viewAll")
      ? {}
      : { enrollments: { some: { soldByUserId: userId } } },
    vendas: permissions.has("vendas.viewAll") ? {} : { soldByUserId: userId },
    assinaturas: permissions.has("vendas.viewAll")
      ? {}
      : { soldByUserId: userId },
    // Payment também carrega `soldByUserId` (gravado no fulfill a partir da
    // matrícula), então o faturamento do dashboard segue a mesma fronteira.
    pagamentos: permissions.has("vendas.viewAll") ? {} : { soldByUserId: userId },
    leads: permissions.has("leads.viewAll") ? {} : { ownerUserId: userId },
  }
}

function buildContext(input: {
  userId: string
  tenantId: string
  memberRole: PainelMemberRole
  isOwner: boolean
  isPreview: boolean
  permissions: Set<PainelPermission>
  maxDiscount: number | null
}): PainelContext {
  return {
    ...input,
    can: (perm: PainelPermission) => input.permissions.has(perm),
    scope: buildScope(input.userId, input.permissions),
  }
}

/**
 * Contexto do usuário logado no painel, ou `null` se não houver sessão de
 * revendedor válida.
 *
 * Dono: `User.tenantId` aponta para o tenant (campo @unique, só o dono o tem).
 * Membro: vínculo em TenantMember. Um membro com status != ATIVO é tratado como
 * sem acesso (fail-closed) — o mesmo critério do rodízio de leads.
 */
export async function painelContext(): Promise<PainelContext | null> {
  const session = await requireResellerSession()
  if (!session) return null

  const { userId, tenantId } = session

  const [owner, membership] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    }),
    prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        role: true,
        status: true,
        maxDiscount: true,
        extraPermissions: true,
        revokedPermissions: true,
      },
    }),
  ])

  if (owner) {
    // Prévia "ver como": só o dono pode ativar e o contexto vira somente
    // leitura, de modo que a simulação nunca escreve no banco.
    const previewRole = await readPreviewRole(userId)
    if (previewRole) {
      return buildContext({
        userId,
        tenantId,
        memberRole: previewRole,
        // `false` de propósito: a prévia simula um MEMBRO, e quem lê
        // `isOwner` (ex.: o dispatcher de BI) deve enxergar o mesmo que o
        // membro enxergaria. O cookie já foi validado contra o dono real.
        isOwner: false,
        isPreview: true,
        permissions: toReadOnly(resolvePermissions(previewRole)),
        maxDiscount: null,
      })
    }

    return buildContext({
      userId,
      tenantId,
      memberRole: "owner",
      isOwner: true,
      isPreview: false,
      permissions: resolvePermissions("owner"),
      maxDiscount: null,
    })
  }

  if (!membership || membership.status !== "ATIVO") return null

  const memberRole = normalizeMemberRole(membership.role)
  return buildContext({
    userId,
    tenantId,
    memberRole,
    isOwner: false,
    isPreview: false,
    permissions: resolvePermissions(
      memberRole,
      membership.extraPermissions,
      membership.revokedPermissions,
    ),
    maxDiscount: membership.maxDiscount,
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
 *   const guard = await requirePainel("financeiro.view")
 *   if (!guard.ok) return guard.response
 *   const { ctx } = guard
 */
export async function requirePainel(
  ...perms: PainelPermission[]
): Promise<
  { ok: true; ctx: PainelContext } | { ok: false; response: Response }
> {
  const ctx = await painelContext()
  if (!ctx) return { ok: false, response: unauthenticated() }
  for (const perm of perms) {
    if (!ctx.can(perm)) return { ok: false, response: forbidden() }
  }
  return { ok: true, ctx }
}

/**
 * Guard para server components. Redireciona em vez de responder 403:
 *   - sem sessão  → /login
 *   - sem permissão → /painel (a home do painel é a única página que todo
 *     papel enxerga)
 */
export async function requirePainelPage(
  ...perms: PainelPermission[]
): Promise<PainelContext> {
  const ctx = await painelContext()
  if (!ctx) redirect("/login?callbackUrl=/painel")
  for (const perm of perms) {
    if (!ctx.can(perm)) redirect("/painel")
  }
  return ctx
}
