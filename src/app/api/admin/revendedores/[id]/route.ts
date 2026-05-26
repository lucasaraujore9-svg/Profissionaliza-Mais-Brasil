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
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.get", route: "/api/admin/revendedores/[id]" },
  async (_request: Request, { params }) => {
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
      referrer: { select: { id: true, name: true, slug: true } },
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

  // ---- Stats de indicacao ----
  // defaultPercent vem do SystemSettings; usado quando referralPercent (override) e null.
  // totalReferrals: tenants indicados por ESTE tenant (qualquer status, exceto CANCELLED).
  // totalCommissionGenerated: somatorio de comissoes que ESTE tenant gerou para o seu referrer
  //   (status != CANCELLED). Representa quanto o indicador dele ja recebeu/recebera por causa dele.
  // totalCommissionReceived: somatorio de comissoes que ESTE tenant ja recebeu (status=PAID)
  //   por causa de tenants que ele indicou.
  // totalReferralsPaidToMe: somatorio do que ele tem disponivel + ja pago (AVAILABLE + PAID)
  //   — view util para o card de pagamento proximo.
  const [systemSettings, referralsCount, generatedAgg, receivedPaidAgg, receivedAvailableAgg] =
    await Promise.all([
      prisma.systemSettings.findUnique({
        where: { id: "default" },
        select: { defaultReferralPercent: true, referralPayoutDay: true },
      }),
      prisma.tenant.count({ where: { referrerTenantId: id } }),
      prisma.referralCommission.aggregate({
        where: {
          referredTenantId: id,
          status: { in: ["PENDING", "AVAILABLE", "PAID"] },
        },
        _sum: { amount: true },
      }),
      prisma.referralCommission.aggregate({
        where: {
          referrerTenantId: id,
          status: "PAID",
        },
        _sum: { amount: true },
      }),
      prisma.referralCommission.aggregate({
        where: {
          referrerTenantId: id,
          status: { in: ["AVAILABLE", "PAID"] },
        },
        _sum: { amount: true },
      }),
    ])

  const defaultReferralPercent = Number(
    systemSettings?.defaultReferralPercent ?? 5,
  )
  const referralPayoutDay = systemSettings?.referralPayoutDay ?? 20

  const referralStats = {
    defaultPercent: defaultReferralPercent,
    payoutDay: referralPayoutDay,
    totalReferrals: referralsCount,
    totalCommissionGenerated: Number(generatedAgg._sum.amount ?? 0),
    totalCommissionReceived: Number(receivedPaidAgg._sum.amount ?? 0),
    totalReferralsPaidToMe: Number(receivedAvailableAgg._sum.amount ?? 0),
  }

  // Busca dados atualizados do Asaas: subscription + pagamentos.
  // Falha silenciosamente — front trata campos como null e usa dados do banco.
  let effectiveTenantStatus = tenant.status
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
      // Busca subscription e pagamentos em paralelo.
      // Usa customer como filtro para capturar pagamentos de subscriptions
      // anteriores (ex: quando recriamos por mudança de valor).
      const [sub, asaasPayments] = await Promise.all([
        getSubscription(tenant.asaasSubscriptionId),
        listPayments(
          tenant.asaasCustomerId
            ? { customer: tenant.asaasCustomerId, limit: 24 }
            : { subscription: tenant.asaasSubscriptionId, limit: 24 },
        ),
      ])
      asaasNextDueDate = sub.nextDueDate ?? null
      asaasSubscriptionStatus = sub.status ?? null
      asaasSubscriptionValue = sub.value ?? null

      const fromAsaas = asaasPayments.data.map((p) => ({
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

      // Complementa com registros do banco que não apareceram no Asaas
      // (pagamentos de subscriptions antigas apagadas no Asaas).
      const asaasIds = new Set(fromAsaas.map((p) => p.asaasPaymentId))
      const fromDb = payments.filter((p) => !asaasIds.has(p.asaasPaymentId))

      payments = [...fromAsaas, ...fromDb].sort((a, b) => {
        // dueDate pode vir de DB (Date) ou do Asaas API (string). Coerção segura
        // para timestamps — null/inválido cai para 0 (vai pro final do sort).
        const ta = a.dueDate ? new Date(a.dueDate).getTime() : 0
        const tb = b.dueDate ? new Date(b.dueDate).getTime() : 0
        return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
      })

      // Auto-ativa o tenant se o Asaas mostra pagamento confirmado mas o banco
      // ainda está PENDING (webhook não recebido ou falhou).
      const hasConfirmedPayment = asaasPayments.data.some(
        (p) => p.status === "RECEIVED" || p.status === "CONFIRMED",
      )
      if (hasConfirmedPayment && tenant.status === "PENDING") {
        await prisma.tenant.update({
          where: { id },
          data: { status: "ACTIVE" },
        })
        effectiveTenantStatus = "ACTIVE"
        await invalidateTenant({
          id: tenant.id,
          slug: tenant.slug,
          customDomain: tenant.customDomain,
        }).catch(swallow("admin.revendedores"))

        // Upsert dos TenantPayment confirmados para manter o banco consistente
        for (const p of asaasPayments.data) {
          if (p.status !== "RECEIVED" && p.status !== "CONFIRMED") continue
          await prisma.tenantPayment.upsert({
            where: { asaasPaymentId: p.id },
            update: {
              status: p.status,
              paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
              ...(p.invoiceUrl ? { invoiceUrl: p.invoiceUrl } : {}),
              ...(p.bankSlipUrl ? { bankSlipUrl: p.bankSlipUrl } : {}),
            },
            create: {
              tenantId: tenant.id,
              asaasPaymentId: p.id,
              amount: p.value,
              billingType: p.billingType,
              status: p.status,
              dueDate: new Date(p.dueDate),
              paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
              invoiceUrl: p.invoiceUrl ?? null,
              bankSlipUrl: p.bankSlipUrl ?? null,
            },
          }).catch(swallow("admin.revendedores"))
        }
      }
    } catch (error) {
      contextLogger().warn(
        { err: error, event: "admin.reseller.asaas_fetch_failed", tenantId: tenant.id },
        "Asaas fetch falhou — usando dados do banco",
      )
    }
  }

  return NextResponse.json({
    data: {
      reseller: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: effectiveTenantStatus,
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
        plataformaVendedorId: tenant.plataformaVendedorId,
        accountManagerId: tenant.accountManagerId,
        accountManagerName: tenant.accountManager?.name ?? null,
        asaasNextDueDate,
        asaasSubscriptionStatus,
        asaasSubscriptionValue,
        // Indicacao
        referralCode: tenant.referralCode,
        referralPercent:
          tenant.referralPercent != null ? Number(tenant.referralPercent) : null,
        pixKey: tenant.pixKey,
        pixKeyType: tenant.pixKeyType,
        // Unidade Tecnica
        tecnicaEnabled: tenant.tecnicaEnabled,
        tecnicaUrl: tenant.tecnicaUrl,
        tecnicaLabel: tenant.tecnicaLabel,
      },
      referrer: tenant.referrer
        ? {
            id: tenant.referrer.id,
            name: tenant.referrer.name,
            slug: tenant.referrer.slug,
          }
        : null,
      referralStats,
      payments,
      students: {
        total: totalStudents,
        active: studentsMap.ATIVO,
        blocked: studentsMap.BLOQUEADO + studentsMap.DEVEDOR,
        inactive: studentsMap.INATIVO,
      },
    },
  })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.delete", route: "/api/admin/revendedores/[id]" },
  async (_request: Request, { params }) => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  // Cancelar tenant é ação destrutiva — restringe a SUPER_ADMIN.
  if (ctx.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode cancelar revendedor" },
      { status: 403 },
    )
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
  },
)
