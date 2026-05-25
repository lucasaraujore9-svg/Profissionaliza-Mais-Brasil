import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { generateDemonstrativoPdf } from "@/lib/referrals/demonstrativo"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mes invalido (YYYY-MM)"),
})

export const GET = withRequestContext(
  { action: "painel.indicacoes.demonstrativo", route: "/api/painel/indicacoes/demonstrativo" },
  async (request: Request) => {
    const session = await requireResellerSession()
    if (!session) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

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
      where: { id: session.tenantId },
      select: { id: true, slug: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Unidade nao encontrada" }, { status: 404 })
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
        { err, event: "painel.demonstrativo.generate_failed" },
        "geração do demonstrativo (painel) falhou",
      )
      return NextResponse.json({ error: message }, { status: 400 })
    }
  },
)
