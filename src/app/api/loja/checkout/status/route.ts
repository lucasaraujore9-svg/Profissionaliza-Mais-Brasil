import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Polling do status de uma matrícula da vitrine de revenda (PIX/boleto). O
 * webhook do MP efetiva a matrícula (status ACTIVE) quando o pagamento cai;
 * aqui só lemos o estado já persistido, escopado ao tenant do header (proxy)
 * para evitar IDOR entre lojas.
 */
export const GET = withRequestContext(
  { action: "loja.checkout.status", route: "/api/loja/checkout/status" },
  async (request: Request) => {
    const tenantIdHeader = request.headers.get("x-tenant-id")
    const tenantSlug = request.headers.get("x-tenant-slug")

    const url = new URL(request.url)
    const enrollmentId = url.searchParams.get("enrollment_id")
    if (!enrollmentId) {
      return NextResponse.json(
        { error: "enrollment_id obrigatório", code: "MISSING_ID" },
        { status: 400 },
      )
    }

    let tenantId = tenantIdHeader
    if (!tenantId && tenantSlug) {
      const t = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      })
      tenantId = t?.id ?? null
    }
    if (!tenantId) {
      return NextResponse.json(
        { error: "Loja não identificada", code: "TENANT_MISSING" },
        { status: 400 },
      )
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId },
      select: { id: true, status: true },
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
        paid:
          enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED",
      },
    })
  },
)

export const dynamic = "force-dynamic"
