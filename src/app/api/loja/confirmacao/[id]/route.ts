import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, ctx: RouteContext) {
  const tenantId = request.headers.get("x-tenant-id")

  if (!tenantId) {
    return NextResponse.json(
      { error: "Tenant não identificado", code: "TENANT_MISSING" },
      { status: 400 },
    )
  }

  const { id } = await ctx.params

  const enrollment = await prisma.enrollment.findFirst({
    where: { id, tenantId },
    include: {
      student: { select: { id: true, nome: true, email: true } },
      course: { select: { nome: true, slug: true } },
    },
  })

  if (!enrollment) {
    return NextResponse.json(
      { error: "Matrícula não encontrada", code: "NOT_FOUND" },
      { status: 404 },
    )
  }

  return NextResponse.json({
    data: {
      id: enrollment.id,
      status: enrollment.status,
      paymentType: enrollment.paymentType,
      finalAmount: Number(enrollment.finalAmount),
      discountAmount: Number(enrollment.discountAmount),
      originalAmount: Number(enrollment.originalAmount),
      createdAt: enrollment.createdAt.toISOString(),
      student: enrollment.student,
      course: enrollment.course,
    },
  })
}
