import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Solicitação de exclusão de conta do REVENDEDOR (LGPD art. 18).
// O owner solicita; registra como nota de suporte (visível no admin) e em
// auditoria. A anonimização efetiva é executada por SUPER_ADMIN
// (POST /api/admin/revendedores/[id]/anonimizar) — separação de poderes.
export const POST = withRequestContext(
  { action: "painel.config.delete_request", route: "/api/painel/config/excluir-conta" },
  async () => {
    // `conta.delete` é OWNER_EXCLUSIVE: nem override concede a um membro.
    const guard = await requirePainel("conta.delete")
    if (!guard.ok) return guard.response
    const { tenantId, userId } = guard.ctx

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
