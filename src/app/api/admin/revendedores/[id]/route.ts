import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  describeEffectiveCommission,
  resolveEffectiveCommission,
} from "@/lib/referrals/effective-rule"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { logAudit } from "@/lib/audit"
import { getSubscription, listPayments } from "@/lib/asaas/client"
import { swallow } from "@/lib/errors"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { cancelTenant, CANCELABLE_TENANT_SELECT } from "@/lib/resellers/cancel"

// Escopo de acesso a uma unidade já carregada: ver canAccessTenantScope em
// @/lib/auth/scope (mesma regra de tenantScopeWhere).

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.get", route: "/api/admin/revendedores/[id]" },
  async (_request: Request, { params }) => {
  const guard = await requireAdmin("unidades.view")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

  const { id } = await params

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      owner: { select: { email: true, name: true, phone: true } },
      accountManager: { select: { id: true, name: true } },
      referrer: { select: { id: true, name: true, slug: true } },
      tenantPayments: {
        // DELETED = cobrança cancelada/removida no Asaas; não deve aparecer.
        where: { status: { not: "DELETED" } },
        orderBy: { dueDate: "desc" },
        take: 24,
      },
      _count: { select: { students: true } },
    },
  })

  if (!(await ctx.canAccessTenant(tenant))) {
    // 403 mesmo quando o tenant não existe — não revela a existência fora do escopo.
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
  // totalReferrals: tenants indicados por ESTE tenant, QUALQUER status — inclui
  //   as canceladas (o comentario dizia que as excluia; a query nunca excluiu).
  //   E o denominador do "ativos / total", no mesmo formato do hub /admin/indicacoes.
  // activeReferrals: so as ACTIVE. E o numero que decide elegibilidade e o que a
  //   tela mostra como "Indicados ativos".
  // totalCommissionGenerated: somatorio de comissoes que ESTE tenant gerou para o seu referrer
  //   (status != CANCELLED). Representa quanto o indicador dele ja recebeu/recebera por causa dele.
  // totalCommissionReceived: CAIXA — soma dos ReferralPayout PAID deste tenant como
  //   indicador. Nao sai das comissoes PAID porque o financeiro pode ajustar o valor
  //   ao liquidar o saque, e esse ajuste vive so no payout: a apuracao continua com o
  //   valor original, entao soma-la mostraria menos do que a unidade recebeu de fato.
  // totalReferralsPaidToMe: disponivel (apuracao) + ja pago (caixa) — view util para o
  //   card de pagamento proximo.
  const [
    systemSettings,
    referralsCount,
    activeReferralsCount,
    generatedAgg,
    payoutsPaidAgg,
    receivedAvailableAgg,
    monthlyReceivedAvailableAgg,
  ] =
    await Promise.all([
      prisma.systemSettings.findUnique({
        where: { id: "default" },
        select: {
          defaultReferralPercent: true,
          referralPayoutDay: true,
          defaultReferralMinReferrals: true,
          commissionMode: true,
          commissionBracketBasis: true,
          commissionRateType: true,
          commissionPayoutBase: true,
          commissionBrackets: true,
          commissionPlan: true,
        },
      }),
      prisma.tenant.count({ where: { referrerTenantId: id } }),
      prisma.tenant.count({ where: { referrerTenantId: id, status: "ACTIVE" } }),
      prisma.referralCommission.aggregate({
        where: {
          referredTenantId: id,
          status: { in: ["PENDING", "AVAILABLE", "PAID"] },
        },
        _sum: { amount: true },
      }),
      // Caixa: um unico ledger para os dois motores — todo saque liquidado passa
      // por aqui, independente de qual motor apurou a comissao vinculada.
      prisma.referralPayout.aggregate({
        where: { referrerTenantId: id, status: "PAID" },
        _sum: { amount: true },
      }),
      prisma.referralCommission.aggregate({
        where: {
          referrerTenantId: id,
          status: "AVAILABLE",
        },
        _sum: { amount: true },
      }),
      // Motor por faixas (MONTHLY_TIERED) — keyed por referrer, somado ao
      // disponível para a unidade não aparecer zerada no modo mensal.
      // (totalCommissionGenerated não é somável aqui: o ledger mensal não tem
      // referredTenantId para atribuir a contribuição de UMA indicada.)
      prisma.referralMonthlyCommission.aggregate({
        where: { referrerTenantId: id, status: "AVAILABLE" },
        _sum: { amount: true },
      }),
    ])

  const defaultReferralPercent = Number(
    systemSettings?.defaultReferralPercent ?? 5,
  )
  const referralPayoutDay = systemSettings?.referralPayoutDay ?? 20
  const defaultReferralMinReferrals =
    systemSettings?.defaultReferralMinReferrals ?? 3

  // Regra de comissao que ESTA VALENDO para esta unidade, resolvida pelo mesmo
  // `resolveEffectiveCommission` que o fechamento mensal usa. Enviada pronta
  // para a tela nao poder exibir um percentual diferente do que o sistema paga.
  const effectiveRule = resolveEffectiveCommission(tenant, systemSettings)
  const commissionPreview = {
    description: describeEffectiveCommission(effectiveRule),
    warnings: effectiveRule.warnings,
  }

  const referralStats = {
    defaultPercent: defaultReferralPercent,
    payoutDay: referralPayoutDay,
    defaultMinReferrals: defaultReferralMinReferrals,
    totalReferrals: referralsCount,
    activeReferrals: activeReferralsCount,
    totalCommissionGenerated: Number(generatedAgg._sum.amount ?? 0),
    totalCommissionReceived: Number(payoutsPaidAgg._sum.amount ?? 0),
    totalReferralsPaidToMe:
      Number(receivedAvailableAgg._sum.amount ?? 0) +
      Number(monthlyReceivedAvailableAgg._sum.amount ?? 0) +
      Number(payoutsPaidAgg._sum.amount ?? 0),
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

      const asaasIds = new Set(fromAsaas.map((p) => p.asaasPaymentId))

      // Reconciliação: cobranças PENDING/OVERDUE no banco que NÃO aparecem na
      // conta Asaas (e a lista veio completa, sem paginação) já foram
      // canceladas/removidas lá — tipicamente assinaturas recriadas por mudança
      // de valor/vencimento, ou cancelamento manual que não sincronizou o banco.
      // Marca-as DELETED para não reaparecerem como duplicatas no painel. Só
      // mexe quando temos a visão completa (`!hasMore`) e nunca em cobranças
      // pagas/estornadas (essas são preservadas mesmo fora da janela).
      // DELETING entra aqui como fallback do webhook PAYMENT_DELETED: se a
      // cobrança já sumiu do Asaas, confirma o cancelamento (→ DELETED) mesmo
      // que o webhook não tenha chegado.
      const stale = !asaasPayments.hasMore
        ? payments.filter(
            (p) =>
              !asaasIds.has(p.asaasPaymentId) &&
              (p.status === "PENDING" ||
                p.status === "OVERDUE" ||
                p.status === "DELETING"),
          )
        : []
      if (stale.length > 0) {
        await prisma.tenantPayment
          .updateMany({
            where: {
              tenantId: id,
              asaasPaymentId: { in: stale.map((p) => p.asaasPaymentId) },
            },
            data: { status: "DELETED" },
          })
          .catch(swallow("admin.revendedores"))
      }

      // Complementa com registros do banco que não apareceram no Asaas e que
      // NÃO são órfãos pendentes (ex.: pagos antigos fora da janela de 24).
      const staleIds = new Set(stale.map((p) => p.asaasPaymentId))
      const fromDb = payments.filter(
        (p) => !asaasIds.has(p.asaasPaymentId) && !staleIds.has(p.asaasPaymentId),
      )

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
        // Telefone informado no cadastro da unidade (User.phone do titular).
        ownerPhone: tenant.owner?.phone ?? null,
        asaasCustomerId: tenant.asaasCustomerId,
        asaasSubscriptionId: tenant.asaasSubscriptionId,
        asaasPromoSubscriptionId: tenant.asaasPromoSubscriptionId,
        mpConnected: tenant.mpConnected,
        plataformaVendedorId: tenant.plataformaVendedorId,
        accountManagerId: tenant.accountManagerId,
        accountManagerName: tenant.accountManager?.name ?? null,
        asaasNextDueDate,
        asaasSubscriptionStatus,
        asaasSubscriptionValue,
        promoValue: tenant.promoValue != null ? Number(tenant.promoValue) : null,
        promoMonths: tenant.promoMonths ?? null,
        // Indicacao
        referralCode: tenant.referralCode,
        referralPercent:
          tenant.referralPercent != null ? Number(tenant.referralPercent) : null,
        referralMinReferrals: tenant.referralMinReferrals ?? null,
        referralTiers: tenant.referralTiers ?? null,
        activatedAt: tenant.activatedAt?.toISOString() ?? null,
        pixKey: tenant.pixKey,
        pixKeyType: tenant.pixKeyType,
        // Override do motor de comissao por faixas/multi-fase (regra propria da
        // unidade quando ela e a INDICADORA). Null em cada campo => herda global.
        commissionMode: tenant.commissionMode,
        commissionBracketBasis: tenant.commissionBracketBasis,
        commissionRateType: tenant.commissionRateType,
        commissionPayoutBase: tenant.commissionPayoutBase,
        commissionBrackets: tenant.commissionBrackets ?? null,
        commissionPlan: tenant.commissionPlan ?? null,
        commissionOverrideSource: tenant.commissionOverrideSource ?? null,
        commissionPreview,
        // Unidade Tecnica
        tecnicaEnabled: tenant.tecnicaEnabled,
        tecnicaUrl: tenant.tecnicaUrl,
        tecnicaLabel: tenant.tecnicaLabel,
        tecnicaCourses: (() => {
          const raw = tenant.tecnicaCourses
          if (!Array.isArray(raw)) return []
          return raw
            .map((item: unknown, idx: number) => {
              if (!item || typeof item !== "object") return null
              const obj = item as Record<string, unknown>
              const name = typeof obj.name === "string" ? obj.name : ""
              const url = typeof obj.url === "string" ? obj.url : ""
              if (!name) return null
              return { name, url, order: typeof obj.order === "number" ? obj.order : idx }
            })
            .filter((x): x is { name: string; url: string; order: number } => x !== null)
            .sort((a, b) => a.order - b.order)
            .map((c) => ({ name: c.name, url: c.url }))
        })(),
        // EJA (banner com link por unidade)
        ejaEnabled: tenant.ejaEnabled,
        ejaUrl: tenant.ejaUrl,
        ejaLabel: tenant.ejaLabel,
        // Automacao (WhatsApp + Leads CRM)
        automationEnabled: tenant.automationEnabled,
        // Modulo "Revender revendas"
        canSellResellers: tenant.canSellResellers,
        courseAuthoringEnabled: tenant.courseAuthoringEnabled,
        waConnectedPhone: tenant.waConnectedPhone,
        waStatus: tenant.waStatus,
        // Pagamento parcelado/mensalidade (habilita tb. o carnê no boleto)
        monthlyAllowed: tenant.monthlyAllowed,
        monthlyEnabled: tenant.monthlyEnabled,
        monthlyScope: tenant.monthlyScope,
        // Gateway de vendas da unidade. `checkoutMode` vem do MESMO helper que a
        // vitrine usa: sem ele o card do admin afirmava "Ativo: Mercado Pago"
        // para unidade nenhuma conta conectada, e o suporte concluia que a loja
        // vendia normalmente enquanto o checkout estava morto (NONE).
        asaasConnected: tenant.asaasConnected,
        salesGateway: tenant.salesGateway,
        checkoutMode: tenantCheckoutMode(tenant),
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

const cancelSchema = z.object({
  /** Bloqueia os alunos da unidade na plataforma de aulas. */
  blockStudents: z.boolean().optional().default(false),
  /** Apaga as mensalidades já emitidas e ainda em aberto (PENDING/OVERDUE). */
  deleteOpenCharges: z.boolean().optional().default(true),
  reason: z.string().trim().max(500).optional(),
})

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.delete", route: "/api/admin/revendedores/[id]" },
  async (request: Request, { params }) => {
  const guard = await requireAdmin("unidades.governanca")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx
  // Cancelar tenant é ação destrutiva — restringe a SUPER_ADMIN.
  const { id } = await params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }
  const parsed = cancelSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }
  const { blockStudents, deleteOpenCharges, reason } = parsed.data

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: CANCELABLE_TENANT_SELECT,
  })

  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  // Núcleo compartilhado com o cancelamento em LOTE — ver `lib/resellers/cancel`.
  const outcome = await cancelTenant(tenant, { blockStudents, deleteOpenCharges })
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }
  const { cancelledSubscriptions, deletedCharges, studentsBlocked, warnings } = outcome

  // SAAS-001: trilha de auditoria de cancelamento de revenda (ação destrutiva).
  await logAudit({
    action: "tenant.cancel",
    resource: "Tenant",
    resourceId: id,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorEmail: ctx.email,
    tenantId: id,
    payloadBefore: {
      slug: outcome.before.slug,
      status: outcome.before.status,
      hadAsaasSubscription: outcome.before.hadSubscription,
      hadAsaasPromoSubscription: outcome.before.hadPromoSubscription,
    },
    payloadAfter: {
      status: "CANCELLED",
      cancelledSubscriptions,
      deletedCharges,
      studentsBlocked,
      blockStudents,
      warnings,
      reason: reason ?? null,
    },
  })

  return NextResponse.json({
    data: { ok: true, deletedCharges, studentsBlocked, warnings },
  })
  },
)
