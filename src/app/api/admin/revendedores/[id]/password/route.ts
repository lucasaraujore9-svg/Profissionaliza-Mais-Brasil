import { NextResponse } from "next/server"
import { z } from "zod"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { generateTemporaryPassword } from "@/lib/students/generate-password"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth/admin-guard"

// Aceita ou uma senha digitada pelo admin, ou a flag `generate` para o sistema
// criar uma aleatória. Por questão de segurança, a senha NUNCA é "visualizada"
// (o banco só guarda o hash bcrypt) — o admin define uma nova e o endpoint a
// devolve em texto puro uma única vez para repasse ao revendedor.
const bodySchema = z
  .object({
    newPassword: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(72).optional(),
    generate: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.generate) || Boolean(data.newPassword), {
    message: "Informe uma senha ou marque para gerar automaticamente",
    path: ["newPassword"],
  })

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.password.update", route: "/api/admin/revendedores/[id]/password" },
  async (request: Request, { params }) => {
    const guard = await requireAdmin("unidades.credenciais")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        accountManagerId: true,
        salesUserId: true,
        owner: { select: { id: true, email: true, name: true } },
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
    }
    if (tenant.slug === "__pmb__") {
      return NextResponse.json({ error: "Tenant interno PMB não pode ser editado" }, { status: 400 })
    }
    if (!tenant.owner) {
      return NextResponse.json(
        { error: "Este revendedor não possui usuário dono cadastrado" },
        { status: 400 },
      )
    }

    // Quem não vê a rede inteira só alcança a própria carteira.
    if (!(await ctx.canAccessTenant(tenant))) {
      return NextResponse.json({ error: "Sem permissão para este revendedor" }, { status: 403 })
    }

    const plain = parsed.data.generate
      ? generateTemporaryPassword(12)
      : parsed.data.newPassword!

    const passwordHash = await hash(plain, 12)

    await prisma.user.update({
      where: { id: tenant.owner.id },
      // Não força troca no próximo login — o admin definiu uma senha conhecida.
      data: { passwordHash, mustChangePassword: false },
    })

    // SAAS-001: trilha de auditoria do reset de senha do revendedor.
    // NUNCA registrar a senha em texto puro no payload de auditoria.
    await logAudit({
      action: "reseller.password.reset",
      resource: "User",
      resourceId: tenant.owner.id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      tenantId: tenant.id,
      payloadAfter: { generated: Boolean(parsed.data.generate), ownerEmail: tenant.owner.email },
    })

    return NextResponse.json({
      data: {
        ok: true,
        password: plain,
        ownerEmail: tenant.owner.email,
        ownerName: tenant.owner.name,
      },
    })
  },
)
