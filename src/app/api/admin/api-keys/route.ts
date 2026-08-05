import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { ipFrom } from "@/lib/ratelimit"
import { generateApiKey } from "@/lib/api-parceiros/keys"
import { API_SCOPES, sanitizeScopes } from "@/lib/api-parceiros/scopes"

/**
 * Gestão das chaves da API de parceiros (/api/v1).
 *
 * Leitura exige `integracoes.view`, escrita `integracoes.manage` — a mesma
 * dupla que já guarda tokens de gateway. Criar uma chave é conceder acesso
 * programático aos dados da rede: entra no audit trail.
 */

const LISTA_SELECT = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  status: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  lastUsedIp: true,
  usageCount: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const

// GET /api/admin/api-keys — lista as chaves (nunca o segredo, que não existe
// mais em lugar nenhum depois da criação).
export const GET = withRequestContext(
  { action: "admin.api_keys.list", route: "/api/admin/api-keys" },
  async () => {
    const guard = await requireAdmin("integracoes.view")
    if (!guard.ok) return guard.response

    const keys = await prisma.apiKey.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: LISTA_SELECT,
    })

    return NextResponse.json({
      data: {
        keys: keys.map((key) => ({ ...key, scopes: sanitizeScopes(key.scopes) })),
        escoposDisponiveis: API_SCOPES,
      },
    })
  },
)

const createSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(80),
  scopes: z
    .array(z.enum(API_SCOPES))
    .min(1, "Selecione ao menos um escopo")
    // Chave sem escopo nenhum passa na autenticação mas é recusada em toda
    // rota — parece "funcionando" e não é. Exigimos escopo explícito.
    .transform((values) => Array.from(new Set(values))),
  /** Dias até expirar. Ausente = chave sem expiração. */
  expiresInDays: z.number().int().positive().max(3650).optional().nullable(),
})

// POST /api/admin/api-keys — cria a chave e devolve o segredo UMA ÚNICA VEZ.
export const POST = withRequestContext(
  { action: "admin.api_keys.create", route: "/api/admin/api-keys" },
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

    const parsed = createSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { name, scopes, expiresInDays } = parsed.data

    const { secret, prefix, keyHash } = generateApiKey()
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null

    const created = await prisma.apiKey.create({
      data: {
        name,
        prefix,
        keyHash,
        scopes,
        expiresAt,
        createdById: ctx.userId,
      },
      select: LISTA_SELECT,
    })

    await logAudit({
      action: "api_key.create",
      resource: "ApiKey",
      resourceId: created.id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      // O segredo NUNCA entra no audit trail — só o que identifica a chave.
      payloadAfter: { name, prefix, scopes, expiresAt },
      ip: ipFrom(request),
      userAgent: request.headers.get("user-agent"),
    })

    return NextResponse.json(
      {
        data: {
          key: created,
          // Única aparição do segredo em todo o sistema. Não há endpoint que o
          // recupere depois: perdeu, revoga esta e cria outra.
          secret,
        },
      },
      { status: 201 },
    )
  },
)
