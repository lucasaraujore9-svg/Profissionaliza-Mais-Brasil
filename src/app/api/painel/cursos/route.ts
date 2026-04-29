import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"

export async function GET() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  // Idempotente: garante que o tenant tenha um TenantCourse pra cada
  // curso ATIVO do catálogo global (cria apenas o que falta).
  await ensureTenantCourses(ctx.tenantId)

  const tenantCourses = await prisma.tenantCourse.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ customOrder: "asc" }, { createdAt: "desc" }],
    include: {
      course: {
        select: {
          id: true,
          nome: true,
          descricao: true,
          capaImageUrl: true,
          qtdAulas: true,
          cargaHoraria: true,
        },
      },
      _count: { select: { enrollments: true } },
    },
  })

  return NextResponse.json({
    data: tenantCourses.map((tc) => ({
      id: tc.id,
      courseId: tc.courseId,
      title: tc.course.nome,
      description: tc.customDescription ?? tc.course.descricao,
      capaImageUrl: tc.course.capaImageUrl,
      qtdAulas: tc.course.qtdAulas,
      cargaHoraria: tc.course.cargaHoraria,
      price: Number(tc.price),
      paymentType: tc.paymentType,
      isVisible: tc.isVisible,
      isFeatured: tc.isFeatured,
      customOrder: tc.customOrder,
      enrollmentsCount: tc._count.enrollments,
    })),
  })
}
