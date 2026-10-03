import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { ipFrom } from "@/lib/ratelimit"
import { encrypt } from "@/lib/crypto"
import { generateWebhookSecret } from "@/lib/webhooks-saida/secret"
import { ENDPOINT_SELECT, endpointSchema } from "../route"

const patchSchema = endpointSchema
  .partial()
  .extend({
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    /** true gera segredo novo — o antigo para de valer na hora. */
    rotateSecret: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para alterar")

// PATCH /api/admin/webhooks/{id} — edita, liga/desliga ou troca o segredo.
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.webhooks.update", route: "/api/admin/webhooks/[id]" },
  async (request, ctxParams) => {
    const guard = await requireAdmin("integracoes.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await ctxParams.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = patchSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const before = await prisma.webhookEndpoint.findUnique({
      where: { id },
      select: { name: true, url: true, events: true, status: true },
    })
    if (!before) return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 })

    const { rotateSecret, ...fields } = parsed.data
    const secret = rotateSecret ? generateWebhookSecret() : null
    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data: { ...fields, ...(secret ? { secretEncrypted: encrypt(secret) } : {}) },
      select: ENDPOINT_SELECT,
    })

    await logAudit({
      action: "webhook_endpoint.update",
      resource: "WebhookEndpoint",
      resourceId: id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      payloadBefore: before,
      payloadAfter: {
        name: updated.name,
        url: updated.url,
        events: updated.events,
        status: updated.status,
        ...(secret ? { segredoTrocado: true } : {}),
      },
      ip: ipFrom(request),
      userAgent: request.headers.get("user-agent"),
    })

    return NextResponse.json({ data: { endpoint: updated, ...(secret ? { secret } : {}) } })
  },
)

// DELETE /api/admin/webhooks/{id} — remove o endpoint e o histórico de entregas.
export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.webhooks.delete", route: "/api/admin/webhooks/[id]" },
  async (request, ctxParams) => {
    const guard = await requireAdmin("integracoes.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await ctxParams.params

    const before = await prisma.webhookEndpoint.findUnique({
      where: { id },
      select: { name: true, url: true, events: true, status: true },
    })
    if (!before) return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 })

    await prisma.webhookEndpoint.delete({ where: { id } })
    await logAudit({
      action: "webhook_endpoint.delete",
      resource: "WebhookEndpoint",
      resourceId: id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      payloadBefore: before,
      ip: ipFrom(request),
      userAgent: request.headers.get("user-agent"),
    })
    return NextResponse.json({ data: { deleted: true } })
  },
)
