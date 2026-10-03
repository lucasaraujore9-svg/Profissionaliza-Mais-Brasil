import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { ipFrom } from "@/lib/ratelimit"
import { encrypt } from "@/lib/crypto"
import { WEBHOOK_EVENTS, webhookUrlError } from "@/lib/webhooks-saida/core"
import { generateWebhookSecret } from "@/lib/webhooks-saida/secret"

/**
 * Webhooks de SAÍDA (PMB → sistemas integrados). Mesma dupla de permissão das
 * chaves de API: `integracoes.view` para ver, `integracoes.manage` para mexer.
 */

export const ENDPOINT_SELECT = {
  id: true,
  name: true,
  url: true,
  events: true,
  status: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const

export const endpointSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(80),
  url: z
    .string()
    .trim()
    .max(500)
    .superRefine((value, ctx) => {
      const error = webhookUrlError(value)
      if (error) ctx.addIssue({ code: "custom", message: error })
    }),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Escolha ao menos um evento")
    .transform((values) => Array.from(new Set(values))),
})

// GET /api/admin/webhooks — endpoints + resumo das entregas (nunca o segredo).
export const GET = withRequestContext(
  { action: "admin.webhooks.list", route: "/api/admin/webhooks" },
  async () => {
    const guard = await requireAdmin("integracoes.view")
    if (!guard.ok) return guard.response

    const [endpoints, counts] = await Promise.all([
      prisma.webhookEndpoint.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        select: ENDPOINT_SELECT,
      }),
      prisma.webhookDelivery.groupBy({
        by: ["endpointId", "status"],
        _count: { _all: true },
      }),
    ])

    return NextResponse.json({
      data: {
        endpoints: endpoints.map((e) => ({
          ...e,
          entregas: Object.fromEntries(
            counts
              .filter((c) => c.endpointId === e.id)
              .map((c) => [c.status, c._count._all]),
          ),
        })),
        eventosDisponiveis: WEBHOOK_EVENTS,
      },
    })
  },
)

// POST /api/admin/webhooks — cadastra e devolve o segredo de assinatura UMA vez.
export const POST = withRequestContext(
  { action: "admin.webhooks.create", route: "/api/admin/webhooks" },
  async (request: Request) => {
    const guard = await requireAdmin("integracoes.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = endpointSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { name, url, events } = parsed.data

    const secret = generateWebhookSecret()
    const created = await prisma.webhookEndpoint.create({
      data: {
        name,
        url,
        events,
        secretEncrypted: encrypt(secret),
        createdById: ctx.userId,
      },
      select: ENDPOINT_SELECT,
    })

    await logAudit({
      action: "webhook_endpoint.create",
      resource: "WebhookEndpoint",
      resourceId: created.id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      // O segredo nunca entra no audit trail.
      payloadAfter: { name, url, events },
      ip: ipFrom(request),
      userAgent: request.headers.get("user-agent"),
    })

    return NextResponse.json({ data: { endpoint: created, secret } }, { status: 201 })
  },
)
