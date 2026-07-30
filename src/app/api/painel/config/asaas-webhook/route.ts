import { NextResponse } from "next/server"
import { requirePainel } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { logAudit } from "@/lib/audit"
import {
  ensureTenantAsaasWebhook,
  inspectTenantAsaasWebhook,
} from "@/lib/asaas/webhook-provision"

/**
 * Estado e reparo do webhook na conta Asaas DA UNIDADE.
 *
 * GET  — consulta a conta e diz se existe um webhook ativo apontando para nós,
 *        com os eventos certos e a fila liberada. Substitui o selo "token
 *        preenchido", que nunca provou nada: as unidades apareciam "Conectado"
 *        enquanto nenhuma venda confirmava.
 * POST — cria/corrige o registro (URL, eventos, token forte) e tira a fila do
 *        backoff. Idempotente: pode ser repetido à vontade.
 */
async function loadTenant(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      asaasApiKey: true,
      supportEmail: true,
      owner: { select: { email: true } },
    },
  })
}

export const GET = withRequestContext(
  { action: "painel.config.asaas_webhook.status", route: "/api/painel/config/asaas-webhook" },
  async () => {
    const guard = await requirePainel("gateway.manage")
    if (!guard.ok) return guard.response

    const tenant = await loadTenant(guard.ctx.tenantId)
    if (!tenant) {
      return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    }

    // Consultar o Asaas custa uma chamada externa por request — limitamos para
    // que um reload em loop na tela de configurações não queime a cota da conta.
    const rl = await rateLimitByKey(
      guard.ctx.userId,
      RATE_LIMITS.asaasWebhookStatus,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    const status = await inspectTenantAsaasWebhook({
      id: tenant.id,
      slug: tenant.slug,
      asaasApiKey: tenant.asaasApiKey,
      notifyEmail: tenant.owner?.email ?? tenant.supportEmail,
    })

    return NextResponse.json({ data: status })
  },
)

export const POST = withRequestContext(
  { action: "painel.config.asaas_webhook.ensure", route: "/api/painel/config/asaas-webhook" },
  async () => {
    const guard = await requirePainel("gateway.manage")
    if (!guard.ok) return guard.response

    const rl = await rateLimitByKey(
      guard.ctx.userId,
      RATE_LIMITS.asaasWebhookEnsure,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    const tenant = await loadTenant(guard.ctx.tenantId)
    if (!tenant) {
      return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    }

    const result = await ensureTenantAsaasWebhook({
      id: tenant.id,
      slug: tenant.slug,
      asaasApiKey: tenant.asaasApiKey,
      notifyEmail: tenant.owner?.email ?? tenant.supportEmail,
    })

    // Trilha: a operação rotaciona o token que autentica os callbacks de dinheiro
    // desta unidade. NUNCA registrar o token em si — só o efeito.
    await logAudit({
      action: "tenant.gateway.webhook_provision",
      resource: "Tenant",
      resourceId: tenant.id,
      actorUserId: guard.ctx.userId,
      actorRole: "RESELLER",
      tenantId: tenant.id,
      payloadAfter: result.ok
        ? { gateway: "ASAAS", ok: true, created: result.created, url: result.url }
        : { gateway: "ASAAS", ok: false, code: result.code },
    })

    if (!result.ok) {
      // NOT_CONNECTED/NO_PERMISSION são erro de configuração da unidade (400);
      // falha de comunicação com o Asaas é 502 (vale repetir).
      const httpStatus =
        result.code === "NOT_CONNECTED" || result.code === "NO_PERMISSION"
          ? 400
          : 502
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: httpStatus },
      )
    }

    return NextResponse.json({
      data: { ok: true, created: result.created, url: result.url },
    })
  },
)
