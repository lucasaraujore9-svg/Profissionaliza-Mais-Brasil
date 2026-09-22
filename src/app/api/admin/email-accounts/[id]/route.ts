import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { logAudit } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const SELECT = {
  id: true,
  email: true,
  host: true,
  port: true,
  dailyLimit: true,
  active: true,
} as const

const patchSchema = z
  .object({
    /** Nova senha. Ausente = mantem a atual (a tela nunca recebe a atual). */
    password: z.string().min(1).max(200).optional(),
    host: z.string().trim().min(3).max(200).optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    dailyLimit: z.coerce.number().int().min(1).max(100_000).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para alterar")

/** PATCH /api/admin/email-accounts/{id} — senha, limite, servidor ou pausa. */
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.email_accounts.update", route: "/api/admin/email-accounts/[id]" },
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

    const before = await prisma.smtpAccount.findUnique({ where: { id }, select: SELECT })
    if (!before) {
      return NextResponse.json({ error: "Caixa não encontrada" }, { status: 404 })
    }

    const { password, ...rest } = parsed.data
    const updated = await prisma.smtpAccount.update({
      where: { id },
      data: {
        ...rest,
        // Senha nova limpa o erro antigo: quase sempre era ela (535).
        ...(password ? { passwordEnc: encrypt(password), lastError: null, lastErrorAt: null } : {}),
      },
      select: SELECT,
    })

    await logAudit({
      action: "smtp_account.update",
      resource: "SmtpAccount",
      resourceId: id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      payloadBefore: before,
      payloadAfter: { ...updated, passwordChanged: Boolean(password) },
    })

    return NextResponse.json({ data: updated })
  },
)

/** DELETE /api/admin/email-accounts/{id} — tira a caixa do rodizio. */
export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.email_accounts.delete", route: "/api/admin/email-accounts/[id]" },
  async (_request, ctxParams) => {
    const guard = await requireAdmin("integracoes.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await ctxParams.params

    const before = await prisma.smtpAccount.findUnique({ where: { id }, select: SELECT })
    if (!before) {
      return NextResponse.json({ error: "Caixa não encontrada" }, { status: 404 })
    }
    await prisma.smtpAccount.delete({ where: { id } })

    await logAudit({
      action: "smtp_account.delete",
      resource: "SmtpAccount",
      resourceId: id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      payloadBefore: before,
    })

    return NextResponse.json({ ok: true })
  },
)
