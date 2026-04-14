import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params
  const coupon = await prisma.coupon.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!coupon) {
    return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 })
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { couponId: coupon.id, tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      student: { select: { nome: true } },
      course: { select: { nome: true } },
    },
  })

  return NextResponse.json({
    data: enrollments.map((e) => ({
      id: e.id,
      studentName: e.student.nome,
      courseName: e.course.nome,
      discountAmount: Number(e.discountAmount),
      createdAt: e.createdAt.toISOString(),
    })),
  })
}
