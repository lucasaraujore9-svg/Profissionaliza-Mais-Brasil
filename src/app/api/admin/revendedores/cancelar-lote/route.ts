import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import {
  cancelTenant,
  shouldBlockStudentsOnCancel,
  CANCELABLE_TENANT_SELECT,
} from "@/lib/resellers/cancel"
import { NEVER_ACTIVATED_WHERE } from "@/lib/tenants/lifecycle"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

/**
 * Cancelamento em LOTE das unidades que nunca pagaram.
 *
 * Existe porque a rede acumula unidades suspensas que nunca pagaram nenhuma
 * mensalidade — nasceram em cortesia ou com prazo esticado e nunca viraram
 * cliente. Cancelá-las uma a uma é inviável, e mantê-las suspensas polui a
 * operação.
 *
 * NÃO MEXE NO CHURN: o predicado de `CHURN_BASE_WHERE` já exclui quem nunca
 * pagou dos DOIS lados da razão, então elas apenas migram de "suspensas" para
 * "canceladas" DENTRO do balde "Nunca ativou". O total do balde e a taxa de
 * churn ficam idênticos.
 *
 * O servidor RE-DERIVA quem é elegível a partir de `NEVER_ACTIVATED_WHERE` — os
 * ids do corpo são um FILTRO sobre esse conjunto, nunca a fonte da verdade.
 * Confiar na lista do cliente deixaria cancelar qualquer unidade da rede com um
 * POST forjado, sem passar pelas confirmações do cancelamento individual.
 */
const bodySchema = z.object({
  tenantIds: z.array(z.string().min(1)).min(1).max(200),
})

export const POST = withRequestContext(
  {
    action: "admin.revendedores.cancelar_lote",
    route: "/api/admin/revendedores/cancelar-lote",
  },
  async (request: Request) => {
    // Mesma permissão do cancelamento individual — é a mesma ação destrutiva.
    const guard = await requireAdmin("unidades.governanca")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // Recorte de carteira: quem não vê a rede inteira só alcança as suas.
    const scope = await ctx.unidadesWhere()
    if (!scope) {
      return NextResponse.json({ error: "Sem acesso a unidades" }, { status: 403 })
    }

    const elegiveis = await prisma.tenant.findMany({
      where: {
        ...scope,
        ...NEVER_ACTIVATED_WHERE,
        slug: { not: PMB_TENANT_SLUG },
        id: { in: parsed.data.tenantIds },
        // Já cancelada não precisa ser cancelada de novo.
        status: "SUSPENDED",
      },
      select: { ...CANCELABLE_TENANT_SELECT, name: true, cancellationPolicy: true },
    })

    const cancelled: { id: string; slug: string }[] = []
    const failed: { id: string; slug: string; error: string }[] = []
    const warnings: string[] = []
    let studentsBlocked = 0
    let deletedCharges = 0

    // Sequencial de propósito: cada unidade fala com o Asaas, e disparar tudo em
    // paralelo estouraria o rate limit e deixaria metade num estado ambíguo.
    for (const tenant of elegiveis) {
      const outcome = await cancelTenant(tenant, {
        // Cada unidade segue a POLÍTICA DELA (`keepStudentsActive`), igual ao
        // cancelamento individual — o aluno pagou o curso mesmo quando a
        // unidade não pagou a mensalidade.
        blockStudents: shouldBlockStudentsOnCancel(tenant.cancellationPolicy),
        deleteOpenCharges: true,
      })

      if (!outcome.ok) {
        // Uma unidade que falha NÃO derruba o lote — o admin precisa saber
        // exatamente quais ficaram para trás.
        failed.push({ id: tenant.id, slug: tenant.slug, error: outcome.error })
        continue
      }

      cancelled.push({ id: tenant.id, slug: tenant.slug })
      studentsBlocked += outcome.studentsBlocked
      deletedCharges += outcome.deletedCharges
      warnings.push(...outcome.warnings.map((w) => `${tenant.slug}: ${w}`))

      await logAudit({
        action: "tenant.cancel",
        resource: "Tenant",
        resourceId: tenant.id,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorEmail: ctx.email,
        tenantId: tenant.id,
        payloadBefore: {
          slug: outcome.before.slug,
          status: outcome.before.status,
          hadAsaasSubscription: outcome.before.hadSubscription,
          hadAsaasPromoSubscription: outcome.before.hadPromoSubscription,
        },
        payloadAfter: {
          status: "CANCELLED",
          cancelledSubscriptions: outcome.cancelledSubscriptions,
          deletedCharges: outcome.deletedCharges,
          studentsBlocked: outcome.studentsBlocked,
          warnings: outcome.warnings,
          // Distingue esta linha do cancelamento individual na trilha.
          origem: "lote_nunca_ativou",
        },
      })
    }

    // Pedidos que não sobreviveram ao filtro do servidor: já canceladas, fora da
    // carteira, ou que passaram a ter pagamento entre a tela e o clique.
    const alcancados = new Set(elegiveis.map((t) => t.id))
    const ignorados = parsed.data.tenantIds.filter((id) => !alcancados.has(id))

    return NextResponse.json({
      data: {
        cancelled: cancelled.length,
        failed,
        ignored: ignorados.length,
        studentsBlocked,
        deletedCharges,
        warnings,
      },
    })
  },
)
