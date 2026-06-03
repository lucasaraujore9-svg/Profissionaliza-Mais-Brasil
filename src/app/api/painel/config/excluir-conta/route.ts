import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireResellerOwner } from "@/lib/auth/guards"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"

async function currentSession(): Promise<{ tenantId: string | null; userId: string | null }> {
  const session = await auth()
  const user = session?.user as { id?: string; tenantId?: string | null } | undefined
  return { tenantId: user?.tenantId ?? null, userId: user?.id ?? null }
}

// Solicitação de exclusão de conta do REVENDEDOR (LGPD art. 18).
// O owner solicita; registra como nota de suporte (visível no admin) e em
// auditoria. A anonimização efetiva é executada por SUPER_ADMIN
// (POST /api/admin/revendedores/[id]/anonimizar) — separação de poderes.
export const POST = withRequestContext(
  { action: "painel.config.delete_request", route: "/api/painel/config/excluir-conta" },
  async () => {
    const { tenantId, userId } = await currentSession()
    if (!tenantId || !userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const guard = await requireResellerOwner(tenantId)
    if (!guard.ok) return guard.response

    await prisma.tenantSupportNote.create({
      data: {
        tenantId,
        authorId: userId,
        body:
          "[LGPD] O revendedor solicitou a EXCLUSÃO/ANONIMIZAÇÃO da própria conta " +
          "(direito do titular, art. 18). Processar via 'Anonimizar conta (LGPD)' na " +
          "página deste revendedor.",
      },
    })

    await logAudit({
      action: "reseller.account.delete_requested",
      resource: "Tenant",
      resourceId: tenantId,
      actorUserId: userId,
      actorRole: "RESELLER",
      tenantId,
    }).catch(swallow("painel.delete_request.audit"))

    return NextResponse.json({
      data: {
        ok: true,
        message:
          "Solicitação registrada. Nossa equipe processará a exclusão dos seus dados pessoais conforme a LGPD.",
      },
    })
  },
)
