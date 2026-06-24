import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { tenantScopeWhere } from "@/lib/auth/scope"
import { resolveReferrerFromCookie } from "@/lib/referrals/capture"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { SLUG_REGEX } from "@/lib/tenant/slug"
import { createReseller } from "@/lib/resellers/create"

export const GET = withRequestContext(
  { action: "admin.revendedores.list", route: "/api/admin/revendedores" },
  async (request: Request) => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const status = searchParams.get("status")?.trim().toUpperCase() ?? ""

  const where: Prisma.TenantWhereInput = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { owner: { email: { contains: q, mode: "insensitive" } } },
      // Busca tambem pelo nome do admin/dono da revenda (User.tenantId @unique).
      { owner: { name: { contains: q, mode: "insensitive" } } },
    ]
  }
  if (status && ["ACTIVE", "PENDING", "SUSPENDED", "CANCELLED"].includes(status)) {
    where.status = status as Prisma.TenantWhereInput["status"]
  }

  // Escopo de visibilidade por papel (src/lib/auth/scope.ts):
  //   SUPER_ADMIN        -> todas;            PMB_RESELLER_MGR -> as que dá suporte
  //   PMB_REVENDA_SALES  -> as que vendeu;    PMB_SALES_MGR    -> as do seu time
  //   demais (ex: PMB_SALES = vendedor de curso) -> nenhuma (scope null)
  const scope = await tenantScopeWhere(ctx)
  if (!scope) {
    return NextResponse.json({
      data: {
        stats: { total: 0, active: 0, pending: 0, suspended: 0, cancelled: 0 },
        resellers: [],
        role: ctx.role,
      },
    })
  }
  Object.assign(where, scope)

  // Filtro manual por gerente de suporte: só faz sentido para quem vê todas.
  if (ctx.role === "SUPER_ADMIN") {
    const managerFilter = searchParams.get("manager")?.trim()
    if (managerFilter === "unassigned") where.accountManagerId = null
    else if (managerFilter) where.accountManagerId = managerFilter
  }

  const scopeOnly = Object.keys(scope).length ? scope : undefined

  const [tenants, stats] = await Promise.all([
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
  ])

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

  return NextResponse.json({
    data: {
      stats: {
        total,
        active: statsMap.ACTIVE,
        pending: statsMap.PENDING,
        suspended: statsMap.SUSPENDED,
        cancelled: statsMap.CANCELLED,
      },
      resellers: tenants.map((t) => ({
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
      })),
      role: ctx.role,
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

export const POST = withRequestContext(
  { action: "admin.revendedores.create", route: "/api/admin/revendedores" },
  async (request: Request) => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  // Quem pode criar/converter: super, gerente de suporte e o time comercial de
  // revenda (gerente de vendas + vendedor de revenda, que convertem leads).
  const CAN_CREATE = [
    "SUPER_ADMIN",
    "PMB_RESELLER_MGR",
    "PMB_SALES_MGR",
    "PMB_REVENDA_SALES",
  ]
  if (!CAN_CREATE.includes(ctx.role)) {
    return NextResponse.json(
      { error: "Sem permissão para criar revenda" },
      { status: 403 },
    )
  }

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
    // Vendedor de revenda só converte o que é dele.
    if (lead && ctx.role === "PMB_REVENDA_SALES" && lead.ownerUserId !== ctx.userId) {
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
      result.fields
        ? { error: result.error, fields: result.fields }
        : { error: result.error },
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
