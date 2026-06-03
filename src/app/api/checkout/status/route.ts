import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "pmb.checkout.status", route: "/api/checkout/status" },
  async (request: Request) => {
  const url = new URL(request.url)
  const enrollmentId = url.searchParams.get("enrollment_id")
  if (!enrollmentId) {
    return NextResponse.json(
      { error: "enrollment_id obrigatório", code: "MISSING_ID" },
      { status: 400 },
    )
  }

  // Escopo PMB: este endpoint atende o checkout da vitrine principal
  // (tenantId = null). Espelha o irmao /api/checkout/confirmacao/[id]/status e
  // evita expor o status de matriculas de revendedores por id (IDOR).
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, tenantId: null },
    select: {
      id: true,
      status: true,
      gateway: true,
      asaasPaymentId: true,
      mpPaymentId: true,
      finalAmount: true,
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
      enrollmentId: enrollment.id,
      status: enrollment.status,
      // PAID quando webhook já marcou ACTIVE/COMPLETED.
      paid:
        enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED",
    },
  })
  },
)
