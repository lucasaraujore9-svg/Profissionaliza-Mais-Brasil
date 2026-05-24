import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { auth } from "@/lib/auth"
import {
  createPreference,
  createPreapproval,
  decryptTenantMpToken,
} from "@/lib/mercadopago/client"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { swallow } from "@/lib/errors"

const cpfRegex = /^\d{11}$/
const phoneRegex = /^\d{10,11}$/

const createSchema = z.object({
  // Dados do aluno (cria ou reaproveita por CPF/email)
  nome: z.string().trim().min(3).max(160),
  email: z.string().email().toLowerCase().trim(),
  cpf: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(cpfRegex, "CPF inválido")),
  fone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(phoneRegex, "Telefone inválido")),

  // Curso a vender (TenantCourse do próprio tenant)
  tenantCourseId: z.string().min(1),
  couponCode: z.string().trim().max(64).optional(),
})

export async function GET() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  // Pega vendas diretas (com soldByUserId definido) do tenant.
  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: ctx.tenantId,
      soldByUserId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      student: { select: { nome: true, email: true } },
      course: { select: { nome: true } },
      coupon: { select: { code: true } },
      soldByUser: { select: { name: true } },
    },
  })

  return NextResponse.json({
    data: enrollments.map((e) => ({
      id: e.id,
      studentName: e.student.nome,
      studentEmail: e.student.email,
      courseName: e.course.nome,
      couponCode: e.coupon?.code ?? null,
      originalAmount: Number(e.originalAmount),
      discountAmount: Number(e.discountAmount),
      finalAmount: Number(e.finalAmount),
      status: e.status,
      soldByName: e.soldByUser?.name ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  })
}

export async function POST(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  // Cap de desconto se for consultor (TenantMember)
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
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

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      id: true,
      slug: true,
      status: true,
      mpAccessToken: true,
      plataformaVendedorId: true,
    },
  })
  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant não encontrado" },
      { status: 404 },
    )
  }
  if (tenant.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Sua loja está suspensa. Regularize o pagamento para vender." },
      { status: 403 },
    )
  }
  if (!tenant.mpAccessToken) {
    return NextResponse.json(
      { error: "Conecte o Mercado Pago em /painel/configuracoes" },
      { status: 503 },
    )
  }

  const tenantCourse = await prisma.tenantCourse.findFirst({
    where: { id: data.tenantCourseId, tenantId: tenant.id, isVisible: true },
    include: {
      course: {
        select: { id: true, nome: true, slug: true, monthlyMonthsMain: true },
      },
    },
  })
  if (!tenantCourse) {
    return NextResponse.json(
      { error: "Curso não encontrado na sua vitrine" },
      { status: 404 },
    )
  }

  const basePrice = Number(tenantCourse.price)
  if (basePrice <= 0) {
    return NextResponse.json(
      { error: "Curso sem preço configurado" },
      { status: 400 },
    )
  }

  // Cap de desconto: owner do tenant tem 100%; consultor tem maxDiscount
  const member = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId },
    select: { maxDiscount: true, role: true, status: true },
  })
  const isOwner = !member // owner não tem TenantMember; é o user com role=RESELLER e tenantId
  if (member && member.status !== "ATIVO") {
    return NextResponse.json(
      { error: "Sua conta de consultor está inativa" },
      { status: 403 },
    )
  }
  const cap = isOwner ? 100 : (member?.maxDiscount ?? 0)

  let discountAmount = 0
  let couponId: string | null = null
  if (data.couponCode) {
    const code = data.couponCode.toUpperCase()
    const now = new Date()
    const coupon = await prisma.coupon.findFirst({
      where: {
        OR: [{ tenantId: tenant.id }, { tenantId: null }],
        code,
        isActive: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
    })
    if (!coupon) {
      return NextResponse.json({ error: "Cupom inválido" }, { status: 400 })
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 })
    }
    const raw =
      coupon.discountType === "PERCENTAGE"
        ? (basePrice * Number(coupon.discountValue)) / 100
        : Number(coupon.discountValue)
    discountAmount = Math.min(raw, basePrice)

    // Aplica o cap percentual sobre o desconto efetivo (% sobre basePrice),
    // assim cupons FIXED também são limitados — antes só PERCENTAGE era validado.
    if (!isOwner && basePrice > 0) {
      const effectivePct = (discountAmount / basePrice) * 100
      if (effectivePct > cap) {
        return NextResponse.json(
          { error: `Cupom excede seu cap de desconto (${cap}%)` },
          { status: 403 },
        )
      }
    }

    // Reserva atômica do cupom (evita estouro de maxUses em concorrência).
    const reserved = await tryConsumeCoupon(coupon.id)
    if (!reserved) {
      return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 })
    }
    couponId = coupon.id
  }

  const finalAmount = Number((basePrice - discountAmount).toFixed(2))

  // Cria ou reaproveita aluno por CPF (no contexto do tenant)
  const existingStudent = await prisma.student.findFirst({
    where: { tenantId: tenant.id, cpf: data.cpf },
    select: { id: true },
  })

  const student = existingStudent
    ? await prisma.student.update({
        where: { id: existingStudent.id },
        data: {
          nome: data.nome,
          email: data.email,
          fone: data.fone,
          updatedAt: new Date(),
        },
        select: { id: true, nome: true, email: true, cpf: true },
      })
    : await prisma.student.create({
        data: {
          tenantId: tenant.id,
          nome: data.nome,
          email: data.email,
          fone: data.fone,
          cpf: data.cpf,
          plataformaAlunoId: `pending_${Date.now()}`,
          polo: tenant.slug,
          vendedorId: tenant.plataformaVendedorId,
          status: "INTERESSADO",
          updatedAt: new Date(),
        },
        select: { id: true, nome: true, email: true, cpf: true },
      })

  const existingEnrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: student.id,
      courseId: tenantCourse.courseId,
      tenantId: tenant.id,
      status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
    },
    select: { id: true, status: true },
  })
  if (existingEnrollment) {
    if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas"))
    return NextResponse.json(
      {
        error:
          existingEnrollment.status === "PENDING"
            ? "Este aluno já tem uma cobrança pendente para este curso"
            : "Este aluno já possui este curso ativo",
      },
      { status: 409 },
    )
  }

  const isMonthly = tenantCourse.paymentType === "MONTHLY"
  const monthlyMonths = isMonthly
    ? tenantCourse.course.monthlyMonthsMain ?? 12
    : null

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId: tenant.id,
      studentId: student.id,
      tenantCourseId: tenantCourse.id,
      courseId: tenantCourse.courseId,
      soldByUserId: userId,
      paymentType: tenantCourse.paymentType,
      status: "PENDING",
      gateway: "MP",
      originalAmount: basePrice,
      discountAmount,
      finalAmount,
      couponId,
      installmentsTotal: monthlyMonths,
    },
    select: { id: true },
  })

  // Padronizado: `enr_<id>` (mesmo formato de /api/loja/checkout). O webhook
  // identifica o tenant pela query string `?tenant=<slug>` na notification_url.
  const externalReference = `enr_${enrollment.id}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const accessToken = decryptTenantMpToken(tenant.mpAccessToken)

  if (isMonthly && monthlyMonths) {
    const startDate = new Date(Date.now() + 60_000).toISOString()
    const endDate = new Date(
      Date.now() +
        monthlyMonths * 31 * 24 * 60 * 60 * 1000 +
        3 * 24 * 60 * 60 * 1000,
    ).toISOString()

    const preapproval = await createPreapproval(accessToken, {
      reason: `Mensalidade — ${tenantCourse.course.nome}`,
      external_reference: externalReference,
      payer_email: student.email ?? data.email,
      back_url: `${appUrl || `https://${process.env.NEXT_PUBLIC_APP_DOMAIN ?? "profissionalizamaisbrasil.com.br"}`}/painel/vendas?ok=${enrollment.id}`,
      notification_url: appUrl
        ? `${appUrl}/api/webhooks/mercadopago?tenant=${tenant.slug}`
        : undefined,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: finalAmount,
        currency_id: "BRL",
        start_date: startDate,
        end_date: endDate,
      },
      status: "pending",
    })

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { mpSubscriptionId: preapproval.id, externalReference },
    })

    return NextResponse.json({
      data: {
        enrollmentId: enrollment.id,
        mode: "subscription",
        installmentsTotal: monthlyMonths,
        initPoint: preapproval.init_point,
        finalAmount,
        discountAmount,
        basePrice,
        studentId: student.id,
      },
    })
  }

  const preference = await createPreference(accessToken, {
    items: [
      {
        id: tenantCourse.course.id,
        title: tenantCourse.course.nome,
        quantity: 1,
        unit_price: finalAmount,
        currency_id: "BRL",
      },
    ],
    payer: {
      name: student.nome,
      email: student.email ?? data.email,
      identification: student.cpf
        ? { type: "CPF", number: student.cpf }
        : undefined,
    },
    back_urls: appUrl
      ? {
          success: `${appUrl}/painel/vendas?ok=${enrollment.id}`,
          failure: `${appUrl}/painel/vendas?err=${enrollment.id}`,
          pending: `${appUrl}/painel/vendas?pend=${enrollment.id}`,
        }
      : undefined,
    auto_return: "approved",
    external_reference: externalReference,
    notification_url: appUrl ? `${appUrl}/api/webhooks/mercadopago?tenant=${tenant.slug}` : undefined,
  })

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { mpPreferenceId: preference.id, externalReference },
  })

  return NextResponse.json({
    data: {
      enrollmentId: enrollment.id,
      mode: "one_time",
      initPoint: preference.init_point,
      finalAmount,
      discountAmount,
      basePrice,
      studentId: student.id,
    },
  })
}
