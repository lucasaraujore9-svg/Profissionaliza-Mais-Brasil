import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: RouteContext) {
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
}

export const dynamic = "force-dynamic"
