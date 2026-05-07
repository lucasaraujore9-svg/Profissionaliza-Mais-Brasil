import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { getPayment, listPayments } from "@/lib/asaas/client"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { pmbEaPolo, pmbEaVendedorId } from "@/lib/pmb-config"

export const dynamic = "force-dynamic"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  const { id } = await params

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id,
      tenantId: null,
      gateway: "ASAAS",
      ...(guard.session.role === "SUPER_ADMIN"
        ? {}
        : { soldByUserId: guard.session.userId }),
    },
    select: {
      id: true,
      status: true,
      asaasPaymentId: true,
      asaasSubscriptionId: true,
      paymentType: true,
    },
  })

  if (!enrollment) {
    return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
  }

  if (enrollment.status !== "PENDING") {
    return NextResponse.json({
      data: { status: enrollment.status, alreadyProcessed: true },
    })
  }

  // Busca o pagamento no Asaas
  let asaasPaymentId = enrollment.asaasPaymentId
  let asaasStatus: string | null = null
  let asaasValue = 0
  let asaasPaymentDate: string | null = null

  try {
    if (asaasPaymentId) {
      const payment = await getPayment(asaasPaymentId)
      asaasStatus = payment.status
      asaasValue = payment.value
      asaasPaymentDate = payment.paymentDate ?? null
    } else if (enrollment.asaasSubscriptionId) {
      const list = await listPayments({
        subscription: enrollment.asaasSubscriptionId,
        limit: 1,
        offset: 0,
      })
      const first = list.data?.[0]
      if (first) {
        asaasPaymentId = first.id
        asaasStatus = first.status
        asaasValue = first.value
        asaasPaymentDate = first.paymentDate ?? null
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao consultar Asaas"
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (!asaasPaymentId || !asaasStatus) {
    return NextResponse.json({ error: "Nenhuma cobrança encontrada no Asaas" }, { status: 404 })
  }

  if (asaasStatus !== "RECEIVED" && asaasStatus !== "CONFIRMED") {
    return NextResponse.json({
      data: {
        status: enrollment.status,
        asaasStatus,
        message: `Pagamento ainda não confirmado no Asaas (status: ${asaasStatus})`,
      },
    })
  }

  // Pagamento confirmado — realiza o fulfillment
  try {
    await fulfillEnrollment(
      {
        id: "__pmb__",
        slug: pmbEaPolo(),
        eaVendedorId: pmbEaVendedorId(),
        isPmbVitrine: true,
      },
      enrollment.id,
      {
        gateway: "ASAAS",
        externalPaymentId: asaasPaymentId,
        amount: asaasValue,
        paidAt: asaasPaymentDate ? new Date(asaasPaymentDate) : new Date(),
        paymentType: enrollment.paymentType,
      },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao processar matrícula"
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({
    data: { status: "ACTIVE", fulfilled: true },
  })
}
