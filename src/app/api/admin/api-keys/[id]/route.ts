import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { ipFrom } from "@/lib/ratelimit"
import { API_SCOPES } from "@/lib/api-parceiros/scopes"

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    scopes: z.array(z.enum(API_SCOPES)).min(1).optional(),
    /** true revoga a chave. Revogar é definitivo — não há "reativar". */
    revoke: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para alterar")

/**
 * PATCH /api/admin/api-keys/{id} — renomeia, ajusta escopos ou REVOGA.
 *
 * Revogar não apaga a linha: a trilha de quem tinha acesso e até quando é
 * justamente o que se quer olhar depois de um incidente. E o hash da chave
 * revogada continua ocupado, então o segredo antigo nunca volta a valer.
 */
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.api_keys.update", route: "/api/admin/api-keys/[id]" },
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

    const existing = await prisma.apiKey.findUnique({
      where: { id },
      select: { id: true, name: true, prefix: true, scopes: true, status: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Chave não encontrada" }, { status: 404 })
    }

    const { name, scopes, revoke } = parsed.data

    if (existing.status !== "ACTIVE" && !revoke) {
      return NextResponse.json(
        { error: "Chave revogada não pode ser editada." },
        { status: 409 },
      )
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(scopes !== undefined ? { scopes } : {}),
        ...(revoke ? { status: "REVOKED", revokedAt: new Date() } : {}),
      },
      select: {
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
      },
    })

    await logAudit({
      action: revoke ? "api_key.revoke" : "api_key.update",
      resource: "ApiKey",
      resourceId: id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      payloadBefore: {
        name: existing.name,
        scopes: existing.scopes,
        status: existing.status,
      },
      payloadAfter: {
        name: updated.name,
        scopes: updated.scopes,
        status: updated.status,
      },
      ip: ipFrom(request),
      userAgent: request.headers.get("user-agent"),
    })

    return NextResponse.json({ data: { key: updated } })
  },
)
