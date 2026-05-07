import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import {
  cancelSubscription,
  getSubscription,
  listPayments,
  AsaasApiError,
} from "@/lib/asaas/client"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      owner: { select: { email: true, name: true } },
      accountManager: { select: { id: true, name: true } },
      tenantPayments: {
        orderBy: { dueDate: "desc" },
        take: 24,
      },
      _count: { select: { students: true } },
    },
  })

  if (ctx.role === "PMB_RESELLER_MGR" && tenant?.accountManagerId !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (ctx.role === "PMB_SALES") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  const studentsBreakdown = await prisma.student.groupBy({
    by: ["status"],
    where: { tenantId: id },
    _count: { _all: true },
  })

  const studentsMap: Record<string, number> = {
    ATIVO: 0,
    INATIVO: 0,
    BLOQUEADO: 0,
    DEVEDOR: 0,
    FORMADO: 0,
    INTERESSADO: 0,
  }
  for (const row of studentsBreakdown) {
    studentsMap[row.status] = row._count._all
  }

  const totalStudents = Object.values(studentsMap).reduce((a, b) => a + b, 0)

  // Busca dados atualizados do Asaas: subscription + pagamentos.
  // Falha silenciosamente — front trata campos como null e usa dados do banco.
  let asaasNextDueDate: string | null = null
  let asaasSubscriptionStatus: string | null = null
  let asaasSubscriptionValue: number | null = null
  type PaymentRow = {
    id: string
    asaasPaymentId: string
    amount: number
    billingType: string | null
    status: string
    dueDate: string
    paidAt: string | null
    invoiceUrl: string | null
    bankSlipUrl: string | null
  }
  let payments: PaymentRow[] = tenant.tenantPayments.map((p) => ({
    id: p.id,
    asaasPaymentId: p.asaasPaymentId,
    amount: Number(p.amount),
    billingType: p.billingType,
    status: p.status,
    dueDate: p.dueDate.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
    invoiceUrl: p.invoiceUrl ?? null,
    bankSlipUrl: p.bankSlipUrl ?? null,
  }))

  if (tenant.asaasSubscriptionId) {
    try {
      const [sub, asaasPayments] = await Promise.all([
        getSubscription(tenant.asaasSubscriptionId),
        listPayments({ subscription: tenant.asaasSubscriptionId, limit: 24 }),
      ])
      asaasNextDueDate = sub.nextDueDate ?? null
      asaasSubscriptionStatus = sub.status ?? null
      asaasSubscriptionValue = sub.value ?? null

      // Usa pagamentos do Asaas como fonte primária (inclui PENDING não
      // sincronizados caso o webhook tenha falhado ou esteja atrasado).
      payments = asaasPayments.data.map((p) => ({
        id: p.id,
        asaasPaymentId: p.id,
        amount: p.value,
        billingType: p.billingType,
        status: p.status,
        dueDate: new Date(p.dueDate).toISOString(),
        paidAt: p.paymentDate ? new Date(p.paymentDate).toISOString() : null,
        invoiceUrl: p.invoiceUrl ?? null,
        bankSlipUrl: p.bankSlipUrl ?? null,
      }))
    } catch (error) {
      console.warn("[reseller] Asaas fetch falhou, usando dados do banco:", error)
    }
  }

  return NextResponse.json({
    data: {
      reseller: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        billingMode: tenant.billingMode,
        cancellationPolicy: tenant.cancellationPolicy,
        planValue: Number(tenant.planValue),
        customDomain: tenant.customDomain,
        primaryColor: tenant.primaryColor,
        whatsapp: tenant.whatsapp,
        createdAt: tenant.createdAt.toISOString(),
        email: tenant.owner?.email ?? null,
        ownerName: tenant.owner?.name ?? null,
        asaasCustomerId: tenant.asaasCustomerId,
        asaasSubscriptionId: tenant.asaasSubscriptionId,
        mpConnected: tenant.mpConnected,
        eaVendedorId: tenant.eaVendedorId,
        accountManagerId: tenant.accountManagerId,
        accountManagerName: tenant.accountManager?.name ?? null,
        asaasNextDueDate,
        asaasSubscriptionStatus,
        asaasSubscriptionValue,
      },
      payments,
      students: {
        total: totalStudents,
        active: studentsMap.ATIVO,
        blocked: studentsMap.BLOQUEADO + studentsMap.DEVEDOR,
        inactive: studentsMap.INATIVO,
      },
    },
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      customDomain: true,
      asaasSubscriptionId: true,
    },
  })

  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  if (tenant.asaasSubscriptionId) {
    try {
      await cancelSubscription(tenant.asaasSubscriptionId)
    } catch (error) {
      if (error instanceof AsaasApiError && error.statusCode !== 404) {
        return NextResponse.json(
          { error: `Falha ao cancelar assinatura Asaas: ${error.message}` },
          { status: 502 },
        )
      }
    }
  }

  await prisma.tenant.update({
    where: { id },
    data: { status: "CANCELLED" },
  })

  await invalidateTenant(tenant)

  return NextResponse.json({ data: { ok: true } })
}
