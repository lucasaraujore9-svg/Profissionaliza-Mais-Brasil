/**
 * Export completo da lista de unidades (revendedores) — dados para planilha.
 *
 * Devolve JSON (abas + colunas + linhas); quem escreve o .xlsx é o cliente
 * (`reseller-export-button`), mesmo desenho do hub de relatórios. O servidor é
 * dono de QUAIS colunas existem e de QUAIS unidades entram.
 *
 * DUAS REGRAS QUE NÃO PODEM SER RELAXADAS AQUI:
 *
 * 1. O `where` sai de `resellerListWhere` — o MESMO da tela. Re-derivar o
 *    recorte de carteira nesta rota é como o export vira a porta larga: a pessoa
 *    vê 12 unidades na lista e baixa a planilha das 300 da rede.
 * 2. Nada de segredo entra no payload. `mpAccessToken`, `asaasApiKey`,
 *    `mpWebhookSecret` e `asaasWebhookToken` viram apenas "conectado: Sim/Não".
 *    O `select` abaixo é a allowlist — campo novo só aparece se for escrito ali.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import {
  EVER_PAID_PAYMENT_WHERE,
  NEVER_ACTIVATED_WHERE,
  NUNCA_ATIVOU_FILTER,
} from "@/lib/tenants/lifecycle"
import { MAX_EXPORT_ROWS } from "@/lib/reports/export-limit"
import {
  parseResellerListFilters,
  resellerListWhere,
} from "@/lib/admin/resellers/list-query"
import {
  getOpenChargesByTenant,
  rollupOpenCharges,
  toCharge,
} from "@/lib/tenant-billing/charges"
import {
  buildCobrancasSheet,
  buildHistoricoSheet,
  buildUnidadesSheet,
  type ResellerExportCharge,
  type ResellerExportUnit,
  type StudentStatusCounts,
} from "@/lib/admin/resellers/export-rows"
import type { ResellerExportPayload } from "@/lib/admin/resellers/export-types"
import { tenantStatusLabel } from "@/lib/labels"

export const dynamic = "force-dynamic"

/** Colunas da cobrança reaproveitadas pelas duas leituras de TenantPayment. */
const CHARGE_SELECT = {
  id: true,
  asaasPaymentId: true,
  amount: true,
  billingType: true,
  status: true,
  dueDate: true,
  paidAt: true,
  invoiceUrl: true,
  bankSlipUrl: true,
  markedPaidAt: true,
} as const

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

function filtersLabel(q: string, status: string): string {
  const parts: string[] = []
  if (q) parts.push(`busca "${q}"`)
  if (status === NUNCA_ATIVOU_FILTER) parts.push("apenas Nunca ativou")
  else if (status) parts.push(`status ${tenantStatusLabel(status)}`)
  return parts.length ? parts.join(" · ") : "todas as unidades do seu acesso"
}

export const GET = withRequestContext(
  { action: "admin.revendedores.export", route: "/api/admin/revendedores/export" },
  async (request: Request) => {
    const guard = await requireAdmin("unidades.view")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx

    const { searchParams } = new URL(request.url)
    const filters = parseResellerListFilters(searchParams)
    const query = await resellerListWhere(ctx, filters)
    if (!query) {
      return NextResponse.json(
        { error: "Você não tem acesso a nenhuma unidade" },
        { status: 403 },
      )
    }
    const { where } = query

    const tenants = await prisma.tenant.findMany({
      // O tenant placeholder da vitrine PMB não é uma revenda — ele existe só
      // para pendurar os alunos B2C. Mesmo recorte do relatório de revendedores.
      where: { AND: [where, { slug: { not: PMB_TENANT_SLUG } }] },
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        activatedAt: true,
        customDomain: true,
        domainVerified: true,
        planValue: true,
        promoValue: true,
        promoMonths: true,
        firstPaymentMaxInstallments: true,
        interestFreeInstallments: true,
        billingMode: true,
        asaasCustomerId: true,
        asaasSubscriptionId: true,
        referralCode: true,
        mpConnected: true,
        asaasConnected: true,
        salesGateway: true,
        plataformaVendedorId: true,
        poloName: true,
        automationEnabled: true,
        ejaEnabled: true,
        tecnicaEnabled: true,
        canSellResellers: true,
        monthlyAllowed: true,
        monthlyEnabled: true,
        monthlyScope: true,
        paceGateEnabled: true,
        waStatus: true,
        waConnectedPhone: true,
        whatsapp: true,
        supportEmail: true,
        owner: {
          select: {
            name: true,
            email: true,
            phone: true,
            cpf: true,
            status: true,
            lastActiveAt: true,
          },
        },
        accountManager: { select: { name: true } },
        salesUser: { select: { name: true } },
        referrer: { select: { name: true } },
        _count: {
          select: {
            students: true,
            tenantCourses: true,
            enrollments: true,
            referrals: true,
          },
        },
      },
    })

    const ids = tenants.map((t) => t.id)

    const [
      nuncaAtivouRows,
      referralsActive,
      studentsByStatus,
      activeEnrollments,
      sales,
      paidMensalidades,
      openByTenant,
      historyRows,
    ] = await Promise.all([
      prisma.tenant.findMany({
        where: { AND: [{ id: { in: ids } }, NEVER_ACTIVATED_WHERE] },
        select: { id: true },
      }),
      prisma.tenant.groupBy({
        by: ["referrerTenantId"],
        where: { referrerTenantId: { in: ids }, status: "ACTIVE" },
        _count: { _all: true },
      }),
      prisma.student.groupBy({
        by: ["tenantId", "status"],
        where: { tenantId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.enrollment.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: ids }, status: "ACTIVE" },
        _count: { _all: true },
      }),
      // Vendas aluno -> unidade. `mpStatus` é o status canônico do pagamento
      // nos DOIS gateways (o nome ficou do tempo em que só havia Mercado Pago).
      prisma.payment.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: ids }, mpStatus: "APPROVED" },
        _count: { _all: true },
        _sum: { amount: true },
        _max: { paidAt: true },
      }),
      // Mensalidades unidade -> PMB já liquidadas. O predicado é o mesmo do
      // churn (`EVER_PAID_PAYMENT_WHERE`): status é MUTÁVEL (estorno reescreve a
      // linha), então "já pagou" também olha `paidAt`/`markedPaidAt`.
      prisma.tenantPayment.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: ids }, ...EVER_PAID_PAYMENT_WHERE },
        _count: { _all: true },
        _sum: { amount: true },
        _max: { paidAt: true },
      }),
      getOpenChargesByTenant(ids),
      prisma.tenantPayment.findMany({
        // DELETED = cobrança removida do Asaas no cancelamento; não é histórico.
        where: { tenantId: { in: ids }, status: { not: "DELETED" } },
        select: { ...CHARGE_SELECT, tenantId: true, notes: true },
        orderBy: { dueDate: "desc" },
        take: MAX_EXPORT_ROWS,
      }),
    ])

    const nuncaAtivouIds = new Set(nuncaAtivouRows.map((r) => r.id))
    const referralsActiveById = new Map(
      referralsActive.map((r) => [r.referrerTenantId, r._count._all]),
    )
    const activeEnrollmentsById = new Map(
      activeEnrollments.map((r) => [r.tenantId, r._count._all]),
    )
    const salesById = new Map(sales.map((r) => [r.tenantId, r]))
    const paidById = new Map(paidMensalidades.map((r) => [r.tenantId, r]))

    const studentsById = new Map<string, StudentStatusCounts>()
    for (const row of studentsByStatus) {
      const counts = studentsById.get(row.tenantId) ?? {}
      counts[row.status] = row._count._all
      studentsById.set(row.tenantId, counts)
    }

    const now = new Date()
    const units: ResellerExportUnit[] = tenants.map((t) => {
      // Mesma conta da lista (`rollupOpenCharges`): recalcular "vencidas" aqui
      // faria a planilha e a tela discordarem sobre quem está em atraso.
      const billing = rollupOpenCharges(openByTenant.get(t.id) ?? [])
      const sale = salesById.get(t.id)
      const paid = paidById.get(t.id)
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        activatedAt: iso(t.activatedAt),
        nuncaAtivou: nuncaAtivouIds.has(t.id),
        customDomain: t.customDomain,
        domainVerified: t.domainVerified,

        ownerName: t.owner?.name ?? null,
        ownerEmail: t.owner?.email ?? null,
        ownerPhone: t.owner?.phone ?? null,
        ownerCpf: t.owner?.cpf ?? null,
        ownerStatus: t.owner?.status ?? null,
        ownerLastActiveAt: iso(t.owner?.lastActiveAt),

        accountManagerName: t.accountManager?.name ?? null,
        salesUserName: t.salesUser?.name ?? null,
        referrerName: t.referrer?.name ?? null,
        referralCode: t.referralCode,
        referralsCount: t._count.referrals,
        referralsActiveCount: referralsActiveById.get(t.id) ?? 0,

        planValue: Number(t.planValue),
        promoValue: t.promoValue === null ? null : Number(t.promoValue),
        promoMonths: t.promoMonths,
        firstPaymentMaxInstallments: t.firstPaymentMaxInstallments,
        interestFreeInstallments: t.interestFreeInstallments,
        billingMode: t.billingMode,
        asaasCustomerId: t.asaasCustomerId,
        asaasSubscriptionId: t.asaasSubscriptionId,

        nextCharge: billing.next,
        openCharges: billing.open,
        openCount: billing.openCount,
        openAmount: billing.openAmount,
        overdueCount: billing.overdueCount,
        overdueAmount: billing.overdueAmount,
        paidCount: paid?._count._all ?? 0,
        paidTotal: Number(paid?._sum.amount ?? 0),
        lastPaidAt: iso(paid?._max.paidAt),

        students: t._count.students,
        studentsByStatus: studentsById.get(t.id) ?? {},
        courses: t._count.tenantCourses,
        enrollments: t._count.enrollments,
        enrollmentsActive: activeEnrollmentsById.get(t.id) ?? 0,

        salesCount: sale?._count._all ?? 0,
        salesRevenue: Number(sale?._sum.amount ?? 0),
        lastSaleAt: iso(sale?._max.paidAt),

        mpConnected: t.mpConnected,
        asaasConnected: t.asaasConnected,
        salesGateway: t.salesGateway,
        plataformaVendedorId: t.plataformaVendedorId,
        poloName: t.poloName,

        automationEnabled: t.automationEnabled,
        ejaEnabled: t.ejaEnabled,
        tecnicaEnabled: t.tecnicaEnabled,
        canSellResellers: t.canSellResellers,
        monthlyAllowed: t.monthlyAllowed,
        monthlyEnabled: t.monthlyEnabled,
        monthlyScope: t.monthlyScope,
        paceGateEnabled: t.paceGateEnabled,

        waStatus: t.waStatus,
        waConnectedPhone: t.waConnectedPhone,
        whatsapp: t.whatsapp,
        supportEmail: t.supportEmail,
      }
    })

    const history: ResellerExportCharge[] = historyRows.map((row) => ({
      tenantId: row.tenantId,
      charge: toCharge(row, now),
      notes: row.notes,
    }))

    const unitsById = new Map(units.map((u) => [u.id, { name: u.name, slug: u.slug }]))

    // Truncamento é dito em voz alta: uma planilha cortada em silêncio lê como
    // "é tudo o que existe" — e alguém decide em cima dela.
    const unidadesNote =
      tenants.length === MAX_EXPORT_ROWS
        ? `Limite de ${MAX_EXPORT_ROWS} unidades atingido — use os filtros para exportar o restante.`
        : null
    const historicoNote =
      historyRows.length === MAX_EXPORT_ROWS
        ? `Limite de ${MAX_EXPORT_ROWS} cobranças atingido — as mais antigas ficaram de fora.`
        : null

    const stamp = now.toISOString().slice(0, 10)
    const payload: ResellerExportPayload = {
      filename: `revendedores-${stamp}`,
      generatedAt: now.toISOString(),
      filtersLabel: filtersLabel(filters.q, filters.status),
      sheets: [
        buildUnidadesSheet(units, unidadesNote),
        buildCobrancasSheet(units),
        buildHistoricoSheet(history, unitsById, historicoNote),
      ],
    }

    // Export de PII em lote (nome, e-mail, telefone e CPF do titular de cada
    // unidade da carteira). A trilha é o que permite responder "quem baixou a
    // base?" — sem ela, o vazamento não tem origem.
    await logAudit({
      action: "data.export",
      resource: "tenants",
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      payloadAfter: {
        unidades: units.length,
        cobrancasEmAberto: payload.sheets[1].rows.length,
        historico: history.length,
        filtros: { q: filters.q, status: filters.status, manager: filters.manager },
        truncado: Boolean(unidadesNote || historicoNote),
      },
    })

    contextLogger().info(
      { event: "admin.revendedores.export_ok", unidades: units.length },
      "export de revendedores gerado",
    )

    return NextResponse.json({ data: payload })
  },
)
