import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { hash } from "bcryptjs"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { tenantScopeWhere } from "@/lib/auth/scope"
import {
  AsaasApiError,
  createCustomer,
  createSubscription,
  listPayments,
} from "@/lib/asaas/client"
import { createPromoBilling } from "@/lib/asaas/promo"
import { sendEmail, isEmailConfigured } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"
import { appUrl, vitrineUrl as buildVitrineUrl } from "@/lib/tenant/urls"
import { generateUniqueReferralCode } from "@/lib/referrals/code"
import { resolveReferrerFromCookie } from "@/lib/referrals/capture"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import { ensureTenantHomeSections } from "@/lib/home/sections"
import { DEFAULT_AUTOMATION_TEMPLATES } from "@/lib/automation/default-templates"
import { forbiddenNameError } from "@/lib/tenant/forbidden-names"
import { SLUG_REGEX, validateSlugFormat, isSlugAvailable } from "@/lib/tenant/slug"

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
        owner: { select: { email: true } },
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

function isoDayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

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

  // Formato do slug (regex/tamanho/reservados/marca). validateSlugFormat ja
  // cobre os subdominios reservados e o nome de marca proibido no slug.
  const slugError = validateSlugFormat(data.slug)
  if (slugError) {
    return NextResponse.json({ error: slugError }, { status: 400 })
  }

  // Marcas reservadas (contrato): o NOME da unidade tambem nao pode conter
  // Bolsa Mais Brasil / Profissionaliza / Escola de Ensino a Distância / Livre
  // Cursos (nem variacoes). Vale tambem na edicao (painel/config).
  const forbidden = forbiddenNameError(data.name)
  if (forbidden) {
    return NextResponse.json(
      { error: forbidden, fields: { name: [forbidden] } },
      { status: 400 },
    )
  }

  // Disponibilidade: tenant existente OU slug reservado (rename nos ultimos 15d).
  const availability = await isSlugAvailable(data.slug)
  if (!availability.available) {
    return NextResponse.json({ error: availability.reason }, { status: 409 })
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: data.ownerEmail },
    select: { id: true },
  })
  if (existingEmail) {
    return NextResponse.json(
      { error: `Já existe um usuário com o email ${data.ownerEmail}` },
      { status: 409 },
    )
  }

  // Senha temporária — admin deve enviar manualmente; pode disparar
  // /forgot-password depois.
  const tempPassword = randomBytes(9).toString("base64url")
  const passwordHash = await hash(tempPassword, 12)

  // Tenta criar customer + subscription no Asaas. Se ASAAS_API_KEY não
  // estiver configurada, segue sem (admin pode anexar manual depois).
  // Revenda gratuita: mensalidade 0 → nasce ATIVA, sem cobranca no Asaas.
  // O admin pode ligar a cobranca depois pela tela de billing.
  const isFree = data.planValue === 0
  const isPromo =
    !isFree && data.promoMonths !== undefined && data.promoValue !== undefined

  let asaasCustomerId: string | null = null
  let asaasSubscriptionId: string | null = null
  let asaasPromoSubscriptionId: string | null = null
  let invoiceUrl: string | null = null
  let firstPaymentId: string | null = null
  let asaasError: string | null = null

  if (!isFree && process.env.ASAAS_API_KEY) {
    try {
      const customer = await createCustomer({
        name: data.ownerName,
        email: data.ownerEmail,
        cpfCnpj: data.ownerCpfCnpj,
        mobilePhone: data.ownerPhone,
        externalReference: `tenant:${data.slug}`,
      })
      asaasCustomerId = customer.id

      if (isPromo) {
        const result = await createPromoBilling({
          customerId: customer.id,
          slug: data.slug,
          name: data.name,
          planValue: data.planValue,
          promoValue: data.promoValue!,
          promoMonths: data.promoMonths!,
          baseDueDate: isoDayPlus(3),
        })
        asaasSubscriptionId = result.regularSubscriptionId
        asaasPromoSubscriptionId = result.promoSubscriptionId
        invoiceUrl = result.invoiceUrl
        firstPaymentId = result.firstPaymentId
      } else {
        const subscription = await createSubscription({
          customer: customer.id,
          billingType: "UNDEFINED",
          value: data.planValue,
          nextDueDate: isoDayPlus(3),
          cycle: "MONTHLY",
          description: `Mensalidade Profissionaliza Mais Brasil — ${data.name}`,
          externalReference: `tenant:${data.slug}`,
        })
        asaasSubscriptionId = subscription.id

        // Buscar primeiro payment criado pela subscription para pegar invoiceUrl
        try {
          const payments = await listPayments({
            subscription: subscription.id,
            limit: 1,
          })
          const firstPayment = payments.data[0] ?? null
          invoiceUrl = firstPayment?.invoiceUrl ?? null
          firstPaymentId = firstPayment?.id ?? null
        } catch {
          // sem invoiceUrl ainda — webhook vai atualizar depois
        }
      }
    } catch (error) {
      asaasError =
        error instanceof AsaasApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Erro Asaas"
    }
  }

  const referralCode = await generateUniqueReferralCode(data.slug)

  // Atribuicao da indicacao: numa conversao de lead, usamos o referrer gravado
  // no proprio lead (capturado quando o interessado preencheu o formulario) —
  // o cookie pmb_referral aqui seria o do navegador do admin, nao do indicado.
  // Fora da conversao, mantemos o cookie como fonte.
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

  const tenant = await prisma.tenant.create({
    data: {
      name: data.name,
      slug: data.slug,
      // Gratuita ja nasce ATIVA (nao ha pagamento a aguardar). Caso contrario,
      // aguarda o primeiro pagamento (webhook PAYMENT_RECEIVED ativa).
      status: isFree ? "ACTIVE" : "PENDING",
      billingMode: "AUTO",
      planValue: data.planValue,
      asaasCustomerId,
      asaasSubscriptionId,
      asaasPromoSubscriptionId,
      promoValue: isPromo ? data.promoValue : null,
      promoMonths: isPromo ? data.promoMonths : null,
      // Gratuita nunca parcela (não há cobrança). Paga guarda o teto escolhido.
      firstPaymentMaxInstallments: isFree ? 1 : data.firstPaymentMaxInstallments,
      accountManagerId: data.accountManagerId ?? null,
      salesUserId,
      poloName: data.slug,
      referralCode,
      referrerTenantId,
      // Opcionais ligados já na criação. EJA/Técnica guardam o link (o schema
      // garante que veio quando o flag está ligado); automação não precisa de
      // link — os templates default são criados logo abaixo.
      automationEnabled: data.automationEnabled,
      ejaEnabled: data.ejaEnabled,
      ejaUrl: data.ejaEnabled ? (data.ejaUrl ?? null) : null,
      tecnicaEnabled: data.tecnicaEnabled,
      tecnicaUrl: data.tecnicaEnabled ? (data.tecnicaUrl ?? null) : null,
      updatedAt: new Date(),
    },
    select: { id: true, slug: true, name: true, status: true },
  })

  // Automação ligada na criação: cria os templates default (espelha a primeira
  // ativação em .../[id]/automacao). Tenant recém-criado nunca tem templates.
  if (data.automationEnabled) {
    try {
      await prisma.automationMessageTemplate.createMany({
        data: DEFAULT_AUTOMATION_TEMPLATES.map((t) => ({
          tenantId: tenant.id,
          key: t.key,
          body: t.body,
          enabled: true,
        })),
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "admin.revendedores.automation_templates_failed", tenantId: tenant.id },
        "falha ao criar templates default de automação na criação do revendedor",
      )
    }
  }

  // Bootstrap da vitrine: espelha o catálogo global em TenantCourse e clona as
  // seções da home do PMB. Sem isso, a vitrine nasce sem cursos (o hero e as
  // seções consultam tenant_courses) — só era preenchida quando o revendedor
  // abria /painel/cursos. Idempotente; falha aqui não impede a criação.
  try {
    await Promise.all([
      ensureTenantCourses(tenant.id),
      ensureTenantHomeSections(tenant.id),
    ])
  } catch (err) {
    contextLogger().error(
      { err, event: "admin.revendedores.bootstrap_vitrine_failed", tenantId: tenant.id },
      "bootstrap da vitrine (cursos/seções) falhou na criação do revendedor",
    )
  }

  const user = await prisma.user.create({
    data: {
      email: data.ownerEmail,
      name: data.ownerName,
      role: "RESELLER",
      status: "ATIVO",
      tenantId: tenant.id,
      passwordHash,
      phone: data.ownerPhone ?? null,
      mustChangePassword: true,
      updatedAt: new Date(),
    },
    select: { id: true, email: true },
  })

  // Conversao de lead: marca como convertido e liga ao tenant criado.
  if (lead) {
    await prisma.lead
      .update({
        where: { id: lead.id },
        data: { status: "CONVERTED", tenantId: tenant.id },
      })
      .catch((err: unknown) => {
        contextLogger().error(
          { err, event: "admin.revendedores.lead_convert_link_failed", leadId: lead?.id },
          "falha ao marcar lead como convertido",
        )
      })
  }

  // Dispara email de onboarding com credenciais e link de pagamento.
  // Falha silenciosa se nenhum provedor estiver configurado — não quebra a criação.
  const baseUrl = appUrl()
  const vitrineUrl = buildVitrineUrl(data.slug)
  let emailSent = false
  let emailError: string | null = null
  try {
    await sendEmail({
      to: data.ownerEmail,
      subject: invoiceUrl
        ? `Sua revenda ${data.name} foi criada — finalize o pagamento`
        : `Sua revenda ${data.name} foi criada`,
      template: {
        type: "reseller-onboarding",
        props: {
          ownerName: data.ownerName,
          resellerName: data.name,
          loginEmail: data.ownerEmail,
          tempPassword,
          loginUrl: `${baseUrl}/login`,
          vitrineUrl,
          paymentUrl: invoiceUrl,
          planValue: data.planValue,
        },
      },
    })
    emailSent = true
  } catch (err) {
    emailError = err instanceof Error ? err.message : "Erro ao enviar email"
    contextLogger().error(
      { err, event: "admin.revendedores.onboarding_email_failed" },
      "onboarding email do revendedor falhou",
    )
  }

  // Notifica gerentes de revendedor + super admin sobre novo revendedor
  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "INFO",
    title: `Novo revendedor: ${data.name}`,
    body: invoiceUrl
      ? "Aguardando primeiro pagamento."
      : "Cadastro concluído.",
    category: "tenant",
    href: `/admin/revendedores/${tenant.id}`,
  })
  if (data.accountManagerId) {
    await createNotification({
      audience: "USER",
      userId: data.accountManagerId,
      level: "INFO",
      title: `Você foi atribuído ao revendedor ${data.name}`,
      body: `Slug: ${data.slug} · Plano R$ ${data.planValue.toFixed(2).replace(".", ",")}`,
      category: "tenant",
      href: `/admin/revendedores/${tenant.id}`,
    })
  }

  return NextResponse.json({
    data: {
      tenant,
      owner: { id: user.id, email: user.email },
      // Só retorna a senha em claro quando o e-mail de onboarding NÃO foi enviado
      // (fallback para o admin repassar). Com e-mail entregue, o revendedor já
      // recebeu as credenciais — evita expor a senha no corpo da resposta (R10).
      tempPassword: emailSent ? null : tempPassword,
      vitrineUrl,
      asaas: {
        configured: Boolean(process.env.ASAAS_API_KEY),
        customerId: asaasCustomerId,
        subscriptionId: asaasSubscriptionId,
        promoSubscriptionId: asaasPromoSubscriptionId,
        free: isFree,
        invoiceUrl,
        firstPaymentId,
        error: asaasError,
      },
      email: {
        configured: isEmailConfigured(),
        sent: emailSent,
        error: emailError,
      },
    },
  })
  },
)
