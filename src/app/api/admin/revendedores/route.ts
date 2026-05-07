import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { hash } from "bcryptjs"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import {
  AsaasApiError,
  createCustomer,
  createSubscription,
  listPayments,
} from "@/lib/asaas/client"
import { sendEmail } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"

export async function GET(request: Request) {
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

  // Escopo: PMB_RESELLER_MGR ve so seus. SUPER_ADMIN ve todos.
  // PMB_SALES nao entra aqui (via sidebar ja filtrado), mas se chegar, nao devolve nada.
  if (ctx.role === "PMB_RESELLER_MGR") {
    where.accountManagerId = ctx.userId
  } else if (ctx.role === "PMB_SALES") {
    where.id = "__none__"
  } else {
    const managerFilter = searchParams.get("manager")?.trim()
    if (managerFilter === "unassigned") where.accountManagerId = null
    else if (managerFilter) where.accountManagerId = managerFilter
  }

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
        _count: { select: { students: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.tenant.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: ctx.role === "PMB_RESELLER_MGR" ? { accountManagerId: ctx.userId } : undefined,
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
        createdAt: t.createdAt.toISOString(),
      })),
      role: ctx.role,
    },
  })
}

// ─── POST: criar revenda ─────────────────────────────────────────────
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/
const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "painel",
  "loja",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "staging",
  "dev",
  "test",
  "__pmb__",
])

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
  planValue: z.number().positive().max(99999),
  accountManagerId: z.string().optional().nullable(),
})

function isoDayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: Request) {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "PMB_RESELLER_MGR") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN e gerente de revendedores podem criar" },
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

  if (RESERVED_SLUGS.has(data.slug)) {
    return NextResponse.json(
      { error: "Este subdomínio é reservado, escolha outro" },
      { status: 400 },
    )
  }

  // Conflitos
  const [existingSlug, existingEmail] = await Promise.all([
    prisma.tenant.findFirst({ where: { slug: data.slug }, select: { id: true } }),
    prisma.user.findUnique({
      where: { email: data.ownerEmail },
      select: { id: true },
    }),
  ])
  if (existingSlug) {
    return NextResponse.json(
      { error: `Já existe uma revenda com o slug "${data.slug}"` },
      { status: 409 },
    )
  }
  if (existingEmail) {
    return NextResponse.json(
      { error: `Já existe um usuário com o email ${data.ownerEmail}` },
      { status: 409 },
    )
  }

  // Senha temporária — admin deve enviar manualmente; pode disparar
  // /forgot-password depois.
  const tempPassword = randomBytes(9).toString("base64url")
  const passwordHash = await hash(tempPassword, 10)

  // Tenta criar customer + subscription no Asaas. Se ASAAS_API_KEY não
  // estiver configurada, segue sem (admin pode anexar manual depois).
  let asaasCustomerId: string | null = null
  let asaasSubscriptionId: string | null = null
  let invoiceUrl: string | null = null
  let firstPaymentId: string | null = null
  let asaasError: string | null = null

  if (process.env.ASAAS_API_KEY) {
    try {
      const customer = await createCustomer({
        name: data.ownerName,
        email: data.ownerEmail,
        cpfCnpj: data.ownerCpfCnpj,
        mobilePhone: data.ownerPhone,
        externalReference: `tenant:${data.slug}`,
      })
      asaasCustomerId = customer.id

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
    } catch (error) {
      asaasError =
        error instanceof AsaasApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Erro Asaas"
    }
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: data.name,
      slug: data.slug,
      status: "PENDING",
      billingMode: "AUTO",
      planValue: data.planValue,
      asaasCustomerId,
      asaasSubscriptionId,
      accountManagerId: data.accountManagerId ?? null,
      poloName: data.slug,
      updatedAt: new Date(),
    },
    select: { id: true, slug: true, name: true, status: true },
  })

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

  // Dispara email de onboarding com credenciais e link de pagamento.
  // Falha silenciosa em dev (sem RESEND_API_KEY) — não quebra a criação.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://www.profissionalizamaisbrasil.com.br"
  const vitrineUrl = `https://${data.slug}.profissionalizamaisbrasil.com.br`
  let emailSent = false
  let emailError: string | null = null
  if (process.env.RESEND_API_KEY) {
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
    }
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
      tempPassword,
      vitrineUrl,
      asaas: {
        configured: Boolean(process.env.ASAAS_API_KEY),
        customerId: asaasCustomerId,
        subscriptionId: asaasSubscriptionId,
        invoiceUrl,
        firstPaymentId,
        error: asaasError,
      },
      email: {
        configured: Boolean(process.env.RESEND_API_KEY),
        sent: emailSent,
        error: emailError,
      },
    },
  })
}
