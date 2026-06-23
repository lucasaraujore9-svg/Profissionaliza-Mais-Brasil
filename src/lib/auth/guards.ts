import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { UserRole } from "@prisma/client"

export interface AuthedSession {
  userId: string
  role: UserRole
  tenantId: string | null
}

const PMB_TEAM: UserRole[] = [
  "SUPER_ADMIN",
  "PMB_SALES",
  "PMB_SALES_MGR",
  "PMB_REVENDA_SALES",
  "PMB_RESELLER_MGR",
  "PMB_FINANCEIRO",
]

/** Financeiro dedicado (ou super). Use em rotas de gestão financeira. */
export async function requirePmbFinanceiro(): Promise<
  { ok: true; session: AuthedSession } | { ok: false; response: Response }
> {
  const session = await currentSession()
  if (
    !session ||
    (session.role !== "PMB_FINANCEIRO" && session.role !== "SUPER_ADMIN")
  ) {
    return { ok: false, response: deny() }
  }
  return { ok: true, session }
}

async function currentSession(): Promise<AuthedSession | null> {
  const session = await auth()
  const user = session?.user as { id?: string; role?: UserRole; tenantId?: string | null } | undefined
  if (!user?.id || !user.role) return null
  return {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId ?? null,
  }
}

function deny(): Response {
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "content-type": "application/json" },
  })
}

export async function requireSuperAdmin(): Promise<
  { ok: true; session: AuthedSession } | { ok: false; response: Response }
> {
  const session = await currentSession()
  if (!session || session.role !== "SUPER_ADMIN") return { ok: false, response: deny() }
  return { ok: true, session }
}

export async function requirePmbTeam(): Promise<
  { ok: true; session: AuthedSession } | { ok: false; response: Response }
> {
  const session = await currentSession()
  if (!session || !PMB_TEAM.includes(session.role)) return { ok: false, response: deny() }
  return { ok: true, session }
}

export async function requirePmbSales(): Promise<
  { ok: true; session: AuthedSession } | { ok: false; response: Response }
> {
  const session = await currentSession()
  if (!session || (session.role !== "PMB_SALES" && session.role !== "SUPER_ADMIN")) {
    return { ok: false, response: deny() }
  }
  return { ok: true, session }
}

export async function requirePmbResellerMgr(): Promise<
  { ok: true; session: AuthedSession } | { ok: false; response: Response }
> {
  const session = await currentSession()
  if (!session || (session.role !== "PMB_RESELLER_MGR" && session.role !== "SUPER_ADMIN")) {
    return { ok: false, response: deny() }
  }
  return { ok: true, session }
}

// Equipe comercial que trabalha leads/unidades de revenda (B2B): gerente de
// vendas + vendedor de revenda + super. NAO inclui PMB_SALES (vendedor de curso)
// nem PMB_RESELLER_MGR (suporte) — esses tem seus proprios escopos.
const REVENDA_TEAM: UserRole[] = ["SUPER_ADMIN", "PMB_SALES_MGR", "PMB_REVENDA_SALES"]

export async function requireRevendaTeam(): Promise<
  { ok: true; session: AuthedSession } | { ok: false; response: Response }
> {
  const session = await currentSession()
  if (!session || !REVENDA_TEAM.includes(session.role)) return { ok: false, response: deny() }
  return { ok: true, session }
}

export async function requirePmbSalesMgr(): Promise<
  { ok: true; session: AuthedSession } | { ok: false; response: Response }
> {
  const session = await currentSession()
  if (!session || (session.role !== "PMB_SALES_MGR" && session.role !== "SUPER_ADMIN")) {
    return { ok: false, response: deny() }
  }
  return { ok: true, session }
}

export async function requireResellerOwner(
  tenantId: string,
): Promise<{ ok: true; session: AuthedSession } | { ok: false; response: Response }> {
  const session = await currentSession()
  if (!session || session.role !== "RESELLER" || session.tenantId !== tenantId) {
    return { ok: false, response: deny() }
  }
  // Garante OWNER DIRETO do tenant. `session.tenantId` tambem e populado para
  // consultores (TenantMember -> effectiveTenantId no JWT), de modo que a
  // checagem acima, sozinha, deixaria um consultor passar neste guard
  // "owner-only" — podendo, p.ex., editar a propria membership e elevar o
  // proprio `maxDiscount` (bypass do cap de desconto). `User.tenantId` e @unique
  // e so e setado para o owner; consultores tem `User.tenantId = null`.
  const owner = await prisma.user.findFirst({
    where: { id: session.userId, tenantId },
    select: { id: true },
  })
  if (!owner) return { ok: false, response: deny() }
  return { ok: true, session }
}

/**
 * Revendedor-vendedor: owner DIRETO de uma unidade cujo módulo "revender
 * revendas" (`canSellResellers`) está habilitado pelo admin. Usado nas rotas de
 * /painel/revendas (criar/gerir sub-revendas). Consultor não passa (owner-only,
 * mesma razão de requireResellerOwner). Retorna o tenantId da unidade vendedora.
 */
export async function requireResellerSeller(): Promise<
  { ok: true; session: AuthedSession; tenantId: string } | { ok: false; response: Response }
> {
  const session = await currentSession()
  if (!session || session.role !== "RESELLER" || !session.tenantId) {
    return { ok: false, response: deny() }
  }
  const tenantId = session.tenantId
  const [owner, tenant] = await Promise.all([
    prisma.user.findFirst({ where: { id: session.userId, tenantId }, select: { id: true } }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { canSellResellers: true, status: true },
    }),
  ])
  // Status ACTIVE obrigatorio: vender sub-revendas gera cobranca nova no Asaas da
  // PMB e concede impersonacao — uma unidade inadimplente (SUSPENDED) ou ainda
  // sem 1o pagamento (PENDING) nao pode exercer esse privilegio mesmo com a flag.
  if (!owner || !tenant?.canSellResellers || tenant.status !== "ACTIVE") {
    return { ok: false, response: deny() }
  }
  return { ok: true, session, tenantId }
}

export async function requireResellerMember(
  tenantId: string,
): Promise<{ ok: true; session: AuthedSession; memberRole: string } | { ok: false; response: Response }> {
  const session = await currentSession()
  if (!session || session.role !== "RESELLER") return { ok: false, response: deny() }

  if (session.tenantId === tenantId) {
    return { ok: true, session, memberRole: "owner" }
  }

  const membership = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId: session.userId } },
    select: { role: true, status: true },
  })
  if (!membership || membership.status !== "ATIVO") return { ok: false, response: deny() }
  return { ok: true, session, memberRole: membership.role }
}
