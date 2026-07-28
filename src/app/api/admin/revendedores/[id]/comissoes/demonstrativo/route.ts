import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { generateDemonstrativoPdf } from "@/lib/referrals/demonstrativo"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mes invalido (YYYY-MM)"),
})

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.comissoes.demonstrativo", route: "/api/admin/revendedores/[id]/comissoes/demonstrativo" },
  async (request: Request, { params }) => {
  const guard = await requireAdmin("unidades.comissoes")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

  const { id } = await params
  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    month: url.searchParams.get("month") ?? "",
  })
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Parametro invalido",
        fields: parsed.error.flatten().fieldErrors,
      },
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
    },
  })
  if (!tenant) {
    return NextResponse.json(
      { error: "Revendedor nao encontrado" },
      { status: 404 },
    )
  }

  // Comissões/financeiro de revenda: só SUPER_ADMIN e o gerente de suporte
  // (account manager) da unidade. Allowlist positiva — sem ela, papéis comerciais
  // (PMB_REVENDA_SALES/PMB_SALES_MGR) baixariam comissões de qualquer unidade.
  const allowed = await ctx.canAccessTenant(tenant)
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { buffer, metadata } = await generateDemonstrativoPdf({
      tenantId: tenant.id,
      month: parsed.data.month,
    })

    const filename = `demonstrativo-${metadata.tenantSlug}-${metadata.monthIso}.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Falha ao gerar demonstrativo"
    contextLogger().error(
      { err, event: "admin.demonstrativo.generate_failed" },
      "geração do demonstrativo PDF falhou",
    )
    return NextResponse.json({ error: message }, { status: 400 })
  }
  },
)
