import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { resolveTenantFromRequest } from "@/lib/tenant/from-request"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "loja.confirmacao.get", route: "/api/loja/confirmacao/[id]" },
  async (request: Request, ctx) => {
  // /api/loja/* recebe do proxy apenas x-tenant-slug — resolvemos por id-ou-slug.
  // Antes exigia x-tenant-id e a tela de confirmação pós-pagamento não carregava
  // (sempre TENANT_MISSING), fazendo o pagamento aprovado parecer falho.
  const tenant = await resolveTenantFromRequest(request)
  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant não identificado", code: "TENANT_MISSING" },
      { status: 400 },
    )
  }
  const tenantId = tenant.id

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
  },
)
