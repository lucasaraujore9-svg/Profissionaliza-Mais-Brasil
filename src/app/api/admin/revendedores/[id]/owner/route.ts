import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

// Telefone do titular. Vazio/ausente apaga o campo (é opcional no cadastro);
// preenchido, normaliza para 10/11 dígitos — o cadastro antigo gravava o que o
// operador digitasse, então a partir daqui o formato passa a ser único.
const schema = z.object({
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidPhone(v), "Telefone inválido")
    .transform((v) => (v === null ? null : normalizePhone(v))),
})

/**
 * PATCH /api/admin/revendedores/[id]/owner — dados de contato do titular da
 * unidade (User.phone). O telefone era coletado na criação da revenda e nunca
 * mais aparecia: nem para consulta, nem para correção.
 *
 * Permissão: `unidades.manage` + recorte de carteira (`canAccessTenant`) —
 * mesma dupla das outras escritas da unidade.
 */
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.owner.update", route: "/api/admin/revendedores/[id]/owner" },
  async (req: Request, ctx) => {
    const guard = await requireAdmin("unidades.manage")
    if (!guard.ok) return guard.response
    const session = guard.ctx

    const { id } = await ctx.params

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, accountManagerId: true, salesUserId: true },
    })

    if (!(await session.canAccessTenant(tenant))) {
      // 403 mesmo quando a unidade não existe — não revela nada fora do escopo.
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!tenant) {
      return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // `User.tenantId` é unique — é o vínculo do titular com a unidade.
    const owner = await prisma.user.findUnique({
      where: { tenantId: tenant.id },
      select: { id: true },
    })
    if (!owner) {
      return NextResponse.json(
        { error: "Esta unidade não tem titular cadastrado" },
        { status: 404 },
      )
    }

    const updated = await prisma.user.update({
      where: { id: owner.id },
      data: { phone: parsed.data.phone },
      select: { phone: true },
    })

    contextLogger().info(
      {
        event: "admin.reseller.owner_phone_updated",
        tenantId: tenant.id,
        ownerId: owner.id,
        cleared: updated.phone === null,
        actorId: session.userId,
        actorRole: session.role,
      },
      "Telefone do titular da revenda atualizado",
    )

    return NextResponse.json({ data: { phone: updated.phone } })
  },
)
