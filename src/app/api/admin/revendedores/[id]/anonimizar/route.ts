import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { anonymizeResellerOwner } from "@/lib/lgpd/anonymize"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z.object({ confirm: z.literal("ANONIMIZAR") })

// Anonimização dos dados pessoais do owner do revendedor (LGPD art. 18).
// Restrito a SUPER_ADMIN — ação irreversível sobre PII.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.anonymize", route: "/api/admin/revendedores/[id]/anonimizar" },
  async (request: Request, { params }) => {
    const guard = await requireAdmin("unidades.anonimizar")
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
        { error: 'Confirmação inválida. Envie confirm: "ANONIMIZAR".' },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
    }
    if (tenant.slug === PMB_TENANT_SLUG) {
      return NextResponse.json(
        { error: "Tenant interno (PMB) não pode ser anonimizado" },
        { status: 400 },
      )
    }

    const result = await anonymizeResellerOwner(tenant.id, {
      userId: ctx.userId,
      role: ctx.role,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        ok: true,
        message:
          "Dados pessoais do revendedor anonimizados e login desativado. Registros de negócio (alunos/pagamentos) preservados por obrigação legal.",
      },
    })
  },
)
