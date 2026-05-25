import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const GET = withRequestContextParams<{ id: string }>(
  {
    action: "pmb.checkout.confirmacao.status",
    route: "/api/checkout/confirmacao/[id]/status",
  },
  async (_request: Request, ctx) => {
  const { id } = await ctx.params

  const enrollment = await prisma.enrollment.findFirst({
    where: { id, tenantId: null },
    select: { id: true, status: true },
  })

  if (!enrollment) {
    return NextResponse.json(
      { error: "Matrícula não encontrada", code: "NOT_FOUND" },
      { status: 404 },
    )
  }

  return NextResponse.json({
    data: { id: enrollment.id, status: enrollment.status },
  })
  },
)

export const dynamic = "force-dynamic"
