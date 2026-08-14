import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { resolveReferrerFromCookie } from "@/lib/referrals/capture"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { SLUG_REGEX } from "@/lib/tenant/slug"
import {
  MIN_REASON_LENGTH,
  MAX_REASON_LENGTH,
  NEVER_ACTIVATED_WHERE,
} from "@/lib/tenants/lifecycle"
import {
  parseResellerListFilters,
  resellerListWhere,
} from "@/lib/admin/resellers/list-query"
import {
  getOpenChargesByTenant,
  payUrlFor,
  rollupOpenCharges,
} from "@/lib/tenant-billing/charges"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { createReseller } from "@/lib/resellers/create"
import { requireAdmin, type AdminContext } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.revendedores.list", route: "/api/admin/revendedores" },
  async (request: Request) => {
  const guard = await requireAdmin("unidades.view")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

  // O que a TELA pode mostrar. Vai junto com a lista para o cliente não
  // reimplementar a matriz — antes ele gateava a coluna "gerente de conta" e o
  // botão de cadastrar por `role === "SUPER_ADMIN"`, e qualquer papel novo com
  // as permissões certas nascia com a UI incompleta.
  const can = {
    viewAll: ctx.can("unidades.viewAll"),
    governanca: ctx.can("unidades.governanca"),
    create: ctx.can("unidades.create"),
  }

  const { searchParams } = new URL(request.url)
  const filters = parseResellerListFilters(searchParams)

  // Escopo de visibilidade: `unidades.viewAll` vê todas; sem ela vale o recorte
  // do papel (gerente de unidades -> as que dá suporte; vendedor de revenda ->
  // as que vendeu; gerente de vendas -> as do time). `null` = nenhuma unidade.
  const query = await resellerListWhere(ctx, filters)
  if (!query) {
    return NextResponse.json({
      data: {
        stats: { total: 0, active: 0, pending: 0, suspended: 0, cancelled: 0 },
        resellers: [],
        role: ctx.role,
        can,
      },
    })
  }
  const { where, scope } = query
  const scopeOnly = Object.keys(scope).length ? scope : undefined

  const [tenants, stats, nuncaAtivouStats, nuncaAtivouRows] = await Promise.all([
    prisma.tenant.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        planValue: true,
        createdAt: true,
        owner: { select: { email: true, name: true } },
        // Indicacao 1-nivel: nome da revenda que indicou esta (badge na lista).
        referrerTenantId: true,
        referrer: { select: { name: true } },
        accountManagerId: true,
        accountManager: { select: { id: true, name: true } },
        salesUserId: true,
        salesUser: { select: { id: true, name: true } },
        _count: { select: { students: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.tenant.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: scopeOnly,
    }),
    prisma.tenant.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { ...(scopeOnly ?? {}), ...NEVER_ACTIVATED_WHERE, slug: { not: PMB_TENANT_SLUG } },
    }),
    // Quais das unidades LISTADAS nunca pagaram — alimenta o selo e a seleção
    // em lote sem uma segunda consulta por linha.
    prisma.tenant.findMany({
      where: { AND: [where, NEVER_ACTIVATED_WHERE] },
      select: { id: true },
    }),
  ])

  // Vencimento da mensalidade: não existe coluna no `Tenant` (o `nextDueDate` do
  // Asaas é da assinatura e só sai numa chamada live, inviável por linha). A
  // fonte é `TenantPayment` — em UMA consulta para as 200 linhas, não uma por
  // unidade.
  const openByTenant = await getOpenChargesByTenant(tenants.map((t) => t.id))

  const statsMap: Record<string, number> = {
    ACTIVE: 0,
    PENDING: 0,
    SUSPENDED: 0,
    CANCELLED: 0,
  }
  for (const row of stats) {
    statsMap[row.status] = row._count._all
  }

  const total = Object.values(statsMap).reduce((a, b) => a + b, 0)

  // Quem nunca pagou sai de "Suspensas"/"Canceladas" e ganha balde próprio —
  // as duas populações são comercialmente diferentes: uma é cliente perdido, a
  // outra nunca chegou a ser cliente.
  const nuncaAtivouPorStatus: Record<string, number> = { SUSPENDED: 0, CANCELLED: 0 }
  for (const row of nuncaAtivouStats) {
    nuncaAtivouPorStatus[row.status] = row._count._all
  }
  const nuncaAtivouSuspensas = nuncaAtivouPorStatus.SUSPENDED
  const nuncaAtivouCanceladas = nuncaAtivouPorStatus.CANCELLED
  const nuncaAtivouTotal = nuncaAtivouSuspensas + nuncaAtivouCanceladas
  const nuncaAtivouIds = new Set(nuncaAtivouRows.map((r) => r.id))

  return NextResponse.json({
    data: {
      stats: {
        total,
        active: statsMap.ACTIVE,
        pending: statsMap.PENDING,
        // "Suspensas" e "Canceladas" descontam quem nunca pagou — mesma
        // separação do relatório, senão a tela e o BI discordam.
        suspended: statsMap.SUSPENDED - nuncaAtivouSuspensas,
        cancelled: statsMap.CANCELLED - nuncaAtivouCanceladas,
        nuncaAtivou: nuncaAtivouTotal,
      },
      resellers: tenants.map((t) => {
        const billing = rollupOpenCharges(openByTenant.get(t.id) ?? [])
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          email: t.owner?.email ?? null,
          ownerName: t.owner?.name ?? null,
          referrerName: t.referrer?.name ?? null,
          mrr: Number(t.planValue),
          students: t._count.students,
          accountManagerId: t.accountManagerId,
          accountManagerName: t.accountManager?.name ?? null,
          salesUserId: t.salesUserId,
          salesUserName: t.salesUser?.name ?? null,
          createdAt: t.createdAt.toISOString(),
          nuncaAtivou: nuncaAtivouIds.has(t.id),
          // Próximo vencimento = a vencida mais antiga quando há atraso, senão a
          // próxima a vencer (mesma regra do painel da unidade).
          nextDue: billing.next
            ? {
                dueDate: billing.next.dueDate,
                amount: billing.next.amount,
                daysUntilDue: billing.next.daysUntilDue,
                urgency: billing.next.urgency,
                payUrl: payUrlFor(billing.next),
              }
            : null,
          openCount: billing.openCount,
          overdueCount: billing.overdueCount,
          overdueAmount: billing.overdueAmount,
        }
      }),
      role: ctx.role,
      can,
    },
  })
  },
)

// ─── POST: criar revenda ─────────────────────────────────────────────
// Regex/reservados/marcas e disponibilidade do slug vivem em @/lib/tenant/slug
// (reusados na edicao do subdominio em .../[id]/slug).
const createSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(3)
    .max(32)
    .toLowerCase()
    .regex(SLUG_REGEX, "Use apenas letras, números e hífen"),
  ownerName: z.string().min(2).max(80),
  ownerEmail: z.string().email().toLowerCase(),
  ownerCpfCnpj: z.string().min(11).max(20),
  ownerPhone: z.string().min(8).max(20).optional(),
  // planValue 0 = revenda gratuita (sem cobranca no Asaas, nasce ACTIVE).
  planValue: z.number().min(0).max(99999),
  // Teto de parcelas no cartao para a 1a mensalidade (1 = a vista). Asaas
  // aceita ate 21x; limitamos a 12x por padrao de mercado.
  firstPaymentMaxInstallments: z.number().int().min(1).max(12).default(1),
  // Promocao: as primeiras `promoMonths` mensalidades saem por `promoValue`.
  promoMonths: z.number().int().min(1).max(24).optional(),
  promoValue: z.number().min(0).max(99999).optional(),
  // Opcionais ativados já na criação (espelham os PUT de .../[id]/{automacao,eja,tecnica}).
  // Automação não precisa de link; EJA e Técnica exigem o link de destino.
  automationEnabled: z.boolean().optional().default(false),
  ejaEnabled: z.boolean().optional().default(false),
  ejaUrl: z.string().trim().url("URL inválida").max(500).optional(),
  tecnicaEnabled: z.boolean().optional().default(false),
  tecnicaUrl: z.string().trim().url("URL inválida").max(500).optional(),
  accountManagerId: z.string().optional().nullable(),
  // Vendedor de revenda atribuido a unidade. Em conversao de lead, herda o dono
  // do lead; em criacao manual por super/gerente, pode vir explicito.
  salesUserId: z.string().optional().nullable(),
  // Conversao de lead → revenda: id do Lead de origem. Quando presente, a
  // indicacao vem do referrerTenantId gravado no lead (nao do cookie do admin)
  // e o lead e marcado CONVERTED + ligado ao tenant criado.
  leadId: z.string().optional().nullable(),
  // Justificativa da cortesia excepcional por TITULAR (ver lib/tenants/lifecycle).
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(MAX_REASON_LENGTH).optional(),
})
  .refine(
    (d) =>
      (d.promoMonths === undefined && d.promoValue === undefined) ||
      (d.promoMonths !== undefined && d.promoValue !== undefined),
    { message: "Informe promoMonths e promoValue juntos", path: ["promoValue"] },
  )
  .refine((d) => d.promoMonths === undefined || d.planValue > 0, {
    message: "Promoção exige mensalidade cheia maior que zero",
    path: ["promoValue"],
  })
  .refine((d) => !d.ejaEnabled || Boolean(d.ejaUrl), {
    message: "Informe o link da página de EJA para habilitá-la",
    path: ["ejaUrl"],
  })
  .refine((d) => !d.tecnicaEnabled || Boolean(d.tecnicaUrl), {
    message: "Informe o link da Unidade Técnica para habilitá-la",
    path: ["tecnicaUrl"],
  })

/**
 * O lead está no escopo de quem chamou? Usa o mesmo `leadsRevendaWhere()` do
 * guard (dono, time de vendas ou rede inteira) em vez de re-derivar pelo papel.
 */
async function leadInScope(ctx: AdminContext, leadId: string): Promise<boolean> {
  const scope = await ctx.leadsRevendaWhere()
  if (!scope) return false
  const found = await prisma.lead.findFirst({
    where: { id: leadId, ...scope },
    select: { id: true },
  })
  return !!found
}

export const POST = withRequestContext(
  { action: "admin.revendedores.create", route: "/api/admin/revendedores" },
  async (request: Request) => {
  const guard = await requireAdmin("unidades.create")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const data = parsed.data

  // Atribuição da indicação + vendedor atribuído: numa conversão de lead usamos
  // o referrer gravado no próprio lead (capturado no formulário do interessado),
  // não o cookie do navegador do admin. Essa resolução fica no route porque
  // depende do contexto do admin/lead; a criação em si vai para createReseller.
  let lead: { id: string; referrerTenantId: string | null; ownerUserId: string | null } | null =
    null
  if (data.leadId) {
    lead = await prisma.lead.findUnique({
      where: { id: data.leadId },
      select: { id: true, referrerTenantId: true, ownerUserId: true },
    })
    // Só converte o lead que está no seu escopo. Antes a checagem só disparava
    // para PMB_REVENDA_SALES, então quem tinha `unidades.create` por preset
    // (gerente de vendas) ou por override convertia o lead de outra pessoa,
    // herdando o referrerTenantId e definindo o salesUserId.
    if (lead && !(await leadInScope(ctx, lead.id))) {
      return NextResponse.json(
        { error: "Este lead não está atribuído a você" },
        { status: 403 },
      )
    }
  }
  const referrerTenantId = lead
    ? lead.referrerTenantId
    : await resolveReferrerFromCookie()

  // Vendedor de revenda atribuído à unidade. Prioridade: dono do lead → quem
  // converteu (se for do comercial de revenda, assume a própria unidade para
  // ela não sumir do escopo dele) → escolha explícita do super/gerente.
  const salesUserId =
    lead?.ownerUserId ??
    (ctx.role === "PMB_REVENDA_SALES" || ctx.role === "PMB_SALES_MGR"
      ? ctx.userId
      : data.salesUserId ?? null)

  const result = await createReseller({
    // Só o super admin fura a trava por titular; os demais tomam 403.
    cortesiaOverride: {
      allowed: ctx.can("unidades.cortesiaExcepcional"),
      reason: data.reason,
    },
    name: data.name,
    slug: data.slug,
    ownerName: data.ownerName,
    ownerEmail: data.ownerEmail,
    ownerCpfCnpj: data.ownerCpfCnpj,
    ownerPhone: data.ownerPhone,
    planValue: data.planValue,
    firstPaymentMaxInstallments: data.firstPaymentMaxInstallments,
    promoMonths: data.promoMonths,
    promoValue: data.promoValue,
    automationEnabled: data.automationEnabled,
    ejaEnabled: data.ejaEnabled,
    ejaUrl: data.ejaUrl ?? null,
    tecnicaEnabled: data.tecnicaEnabled,
    tecnicaUrl: data.tecnicaUrl ?? null,
    accountManagerId: data.accountManagerId ?? null,
    salesUserId,
    referrerTenantId,
    actor: { userId: ctx.userId, role: ctx.role, email: ctx.email },
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.fields ? { fields: result.fields } : {}),
        // Sinaliza ao cliente que a pessoa TEM o poder e só falta justificar —
        // é o que abre o diálogo de motivo em vez de um erro seco.
        ...(result.requiresReason ? { requiresReason: true } : {}),
      },
      { status: result.status },
    )
  }

  // Conversão de lead → revenda: marca como convertido e liga ao tenant criado.
  if (lead) {
    await prisma.lead
      .update({
        where: { id: lead.id },
        data: { status: "CONVERTED", tenantId: result.tenant.id },
      })
      .catch((err: unknown) => {
        contextLogger().error(
          { err, event: "admin.revendedores.lead_convert_link_failed", leadId: lead?.id },
          "falha ao marcar lead como convertido",
        )
      })
  }

  return NextResponse.json({
    data: {
      tenant: result.tenant,
      owner: result.owner,
      tempPassword: result.tempPassword,
      vitrineUrl: result.vitrineUrl,
      asaas: result.asaas,
      email: result.email,
    },
  })
  },
)
