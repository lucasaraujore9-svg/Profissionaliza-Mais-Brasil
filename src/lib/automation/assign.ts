import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import {
  normalizeMemberRole,
  resolvePermissions,
} from "@/lib/auth/painel-permissions"

export interface LeadAssignee {
  userId: string
  name: string
  email: string
  /** Elegivel a receber leads (status ATIVO e convite ja aceito). */
  active: boolean
  pendingInvite: boolean
}

/**
 * Membros da unidade que podem receber lead — quem tem a permissao `leads.view`
 * (vendedor por preset; gerente tambem; secretaria/financeiro nao, salvo
 * concessao do dono). Filtrar por PERMISSAO e nao por role="consultant" e o que
 * evita que um Gerente nunca entre no rodizio.
 *
 * `active` marca quem esta elegivel de fato: status ATIVO e convite ja aceito
 * (tem senha). Ordenado por createdAt asc para um rodizio estavel — a ordem nao
 * muda quando alguem novo entra no fim.
 */
export async function listLeadAssignees(tenantId: string): Promise<LeadAssignee[]> {
  const rows = await prisma.tenantMember.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, name: true, email: true, passwordHash: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const members = rows.filter((m) =>
    resolvePermissions(
      normalizeMemberRole(m.role),
      m.extraPermissions,
      m.revokedPermissions,
    ).has("leads.view"),
  )

  return members.map((m) => {
    const pendingInvite = !m.user.passwordHash
    return {
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      active: m.status === "ATIVO" && !pendingInvite,
      pendingInvite,
    }
  })
}

/**
 * Escolhe o proximo consultor da fila (round-robin) para um lead novo.
 * Retorna `null` quando:
 *   - a distribuicao automatica esta desligada (tenant.leadAutoAssign = false), ou
 *   - nao ha nenhum consultor elegivel.
 * Nesses casos o lead nasce sem dono e o owner da unidade o trabalha manualmente.
 *
 * Best-effort: qualquer erro vira null (nunca quebra a criacao do lead).
 */
export async function pickNextLeadOwner(tenantId: string): Promise<string | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { leadAutoAssign: true },
    })
    if (!tenant?.leadAutoAssign) return null

    const eligible = (await listLeadAssignees(tenantId)).filter((a) => a.active)
    if (eligible.length === 0) return null

    // Incremento atomico do cursor — robusto sob concorrencia (dois leads
    // simultaneos recebem indices diferentes).
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { leadAssignCursor: { increment: 1 } },
      select: { leadAssignCursor: true },
    })

    const idx = (updated.leadAssignCursor - 1) % eligible.length
    return eligible[idx]?.userId ?? null
  } catch (err) {
    contextLogger().error(
      { err, event: "automation.assign.pick_failed", tenantId },
      "Falha ao escolher consultor para o lead (rodizio)",
    )
    return null
  }
}

// ============================================================
// LEADS DE REVENDA (B2B) — rodizio entre vendedores de revenda (nivel PMB)
// ============================================================

/**
 * Vendedores de revenda (UserRole.PMB_REVENDA_SALES) elegiveis ao rodizio de
 * leads B2B. So entra quem esta ATIVO e ja aceitou o convite (tem senha).
 * Ordenado por createdAt asc para um rodizio estavel.
 */
export async function listRevendaLeadAssignees(): Promise<LeadAssignee[]> {
  const users = await prisma.user.findMany({
    where: { role: "PMB_REVENDA_SALES" },
    select: { id: true, name: true, email: true, passwordHash: true, status: true },
    orderBy: { createdAt: "asc" },
  })

  return users.map((u) => {
    const pendingInvite = !u.passwordHash
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      active: u.status === "ATIVO" && !pendingInvite,
      pendingInvite,
    }
  })
}

/**
 * Escolhe o proximo vendedor de revenda (round-robin PMB-level) para um lead
 * B2B novo. Retorna `null` quando a distribuicao automatica esta desligada
 * (SystemSettings.leadRevendaAutoAssign = false) ou nao ha vendedor elegivel —
 * nesses casos o lead nasce sem dono e o admin/gerente atribui manualmente.
 *
 * Best-effort: qualquer erro vira null (nunca quebra a criacao do lead).
 */
export async function pickNextRevendaLeadOwner(): Promise<string | null> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { leadRevendaAutoAssign: true },
    })
    if (!settings?.leadRevendaAutoAssign) return null

    const eligible = (await listRevendaLeadAssignees()).filter((a) => a.active)
    if (eligible.length === 0) return null

    const updated = await prisma.systemSettings.update({
      where: { id: "default" },
      data: { leadRevendaAssignCursor: { increment: 1 } },
      select: { leadRevendaAssignCursor: true },
    })

    const idx = (updated.leadRevendaAssignCursor - 1) % eligible.length
    return eligible[idx]?.userId ?? null
  } catch (err) {
    contextLogger().error(
      { err, event: "automation.assign.revenda_pick_failed" },
      "Falha ao escolher vendedor de revenda para o lead (rodizio)",
    )
    return null
  }
}
