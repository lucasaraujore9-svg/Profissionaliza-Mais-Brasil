import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { getPayment as getAsaasPayment, listPayments as listAsaasPayments } from "@/lib/asaas/client"
import { searchPayments as searchMpPayments } from "@/lib/mercadopago/client"
import { pmbMpAccessToken, pmbEaPolo, pmbEaVendedorId } from "@/lib/pmb-config"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"

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
      ...(guard.session.role === "SUPER_ADMIN"
        ? {}
        : { soldByUserId: guard.session.userId }),
    },
    select: {
      id: true,
      status: true,
      gateway: true,
      paymentType: true,
      externalReference: true,
      asaasPaymentId: true,
      asaasSubscriptionId: true,
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

  const pmbContext = {
    id: "__pmb__",
    slug: pmbEaPolo(),
    eaVendedorId: pmbEaVendedorId(),
    isPmbVitrine: true as const,
  }

  // ── ASAAS ──────────────────────────────────────────────────────────────────
  if (enrollment.gateway === "ASAAS") {
    let asaasPaymentId = enrollment.asaasPaymentId
    let asaasStatus: string | null = null
    let asaasValue = 0
    let asaasPaymentDate: string | null = null

    try {
      if (asaasPaymentId) {
        const payment = await getAsaasPayment(asaasPaymentId)
        asaasStatus = payment.status
        asaasValue = payment.value
        asaasPaymentDate = payment.paymentDate ?? null
      } else if (enrollment.asaasSubscriptionId) {
        const list = await listAsaasPayments({
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
      return NextResponse.json(
        { error: "Nenhuma cobrança encontrada no Asaas" },
        { status: 404 },
      )
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

    try {
      await fulfillEnrollment(pmbContext, enrollment.id, {
        gateway: "ASAAS",
        externalPaymentId: asaasPaymentId,
        amount: asaasValue,
        paidAt: asaasPaymentDate ? new Date(asaasPaymentDate) : new Date(),
        paymentType: enrollment.paymentType,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao processar matrícula"
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    return NextResponse.json({ data: { status: "ACTIVE", fulfilled: true } })
  }

  // ── MERCADO PAGO ───────────────────────────────────────────────────────────
  if (enrollment.gateway === "MP") {
    const mpToken = await pmbMpAccessToken()
    if (!mpToken) {
      return NextResponse.json(
        { error: "Token Mercado Pago não configurado" },
        { status: 503 },
      )
    }

    if (!enrollment.externalReference) {
      return NextResponse.json(
        { error: "Referência externa não encontrada na matrícula" },
        { status: 404 },
      )
    }

    let mpPaymentId: string | null = null
    let mpAmount = 0
    let mpPaidAt: Date | null = null

    try {
      const result = await searchMpPayments(mpToken, {
        external_reference: enrollment.externalReference,
      })
      const approved = result.results.find((p) => p.status === "approved")
      if (approved) {
        mpPaymentId = String(approved.id)
        mpAmount = approved.transaction_amount
        mpPaidAt = approved.date_approved ? new Date(approved.date_approved) : new Date()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao consultar Mercado Pago"
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    if (!mpPaymentId) {
      return NextResponse.json({
        data: {
          status: enrollment.status,
          message: "Nenhum pagamento aprovado encontrado no Mercado Pago",
        },
      })
    }

    try {
      await fulfillEnrollment(pmbContext, enrollment.id, {
        gateway: "MP",
        externalPaymentId: mpPaymentId,
        amount: mpAmount,
        paidAt: mpPaidAt ?? new Date(),
        paymentType: enrollment.paymentType,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao processar matrícula"
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    return NextResponse.json({ data: { status: "ACTIVE", fulfilled: true } })
  }

  return NextResponse.json(
    { error: `Gateway não suportado: ${enrollment.gateway}` },
    { status: 400 },
  )
}
