import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { logAudit } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { listSmtpAccountsForAdmin } from "@/lib/email/smtp-pool"

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  host: z.string().trim().min(3).max(200).default("smtp.hostinger.com"),
  port: z.coerce.number().int().min(1).max(65535).default(465),
  dailyLimit: z.coerce.number().int().min(1).max(100_000).default(100),
})

/** GET /api/admin/email-accounts — caixas de envio com o contador de hoje. */
export const GET = withRequestContext(
  { action: "admin.email_accounts.list", route: "/api/admin/email-accounts" },
  async () => {
    const guard = await requireAdmin("integracoes.view")
    if (!guard.ok) return guard.response
    return NextResponse.json({ data: await listSmtpAccountsForAdmin() })
  },
)

/**
 * POST /api/admin/email-accounts — cadastra uma caixa no rodizio de envio.
 * A senha e criptografada antes de gravar e nunca volta em resposta nenhuma;
 * a auditoria registra so o e-mail da caixa.
 */
export const POST = withRequestContext(
  { action: "admin.email_accounts.create", route: "/api/admin/email-accounts" },
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
    const { password, ...rest } = parsed.data

    const exists = await prisma.smtpAccount.findUnique({
      where: { email: rest.email },
      select: { id: true },
    })
    if (exists) {
      return NextResponse.json({ error: "Essa caixa já está cadastrada." }, { status: 409 })
    }

    const created = await prisma.smtpAccount.create({
      data: { ...rest, passwordEnc: encrypt(password) },
      select: { id: true, email: true, host: true, port: true, dailyLimit: true, active: true },
    })

    await logAudit({
      action: "smtp_account.create",
      resource: "SmtpAccount",
      resourceId: created.id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      payloadAfter: created,
    })

    return NextResponse.json({ data: created }, { status: 201 })
  },
)
