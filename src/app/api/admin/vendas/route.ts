import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbMpAccessToken } from "@/lib/pmb-config"
import { createPreference } from "@/lib/mercadopago/client"

const PMB_SALES_CAP = 50

export async function GET(request: Request) {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200)

  const where =
    guard.session.role === "SUPER_ADMIN"
      ? { tenantId: null }
      : { tenantId: null, soldByUserId: guard.session.userId }

  const enrollments = await prisma.enrollment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      student: { select: { nome: true, email: true } },
      course: { select: { nome: true } },
      coupon: { select: { code: true } },
      soldByUser: { select: { name: true } },
    },
  })

  return NextResponse.json({
    role: guard.session.role,
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

const createSchema = z.object({
  studentId: z.string().cuid(),
  courseId: z.string().cuid(),
  couponCode: z.string().trim().max(64).optional(),
})

export async function POST(request: Request) {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  const mpToken = pmbMpAccessToken()
  if (!mpToken) {
    return NextResponse.json(
      { error: "PMB_MP_ACCESS_TOKEN não configurado" },
      { status: 503 },
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const pmbTenant = await getOrCreatePmbTenant()

  const [student, course] = await Promise.all([
    prisma.student.findFirst({
      where: { id: parsed.data.studentId, tenantId: pmbTenant.id },
      select: {
        id: true,
        nome: true,
        email: true,
        cpf: true,
      },
    }),
    prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: {
        id: true,
        nome: true,
        status: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
      },
    }),
  ])

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }
  if (!student.email) {
    return NextResponse.json(
      { error: "Aluno sem email cadastrado" },
      { status: 400 },
    )
  }
  if (!course || course.status !== "ATIVO") {
    return NextResponse.json({ error: "Curso não disponível" }, { status: 404 })
  }

  const basePrice = Number(
    course.precoVitrineMain ?? course.precoPromocional ?? course.precoOriginal ?? 0,
  )
  if (basePrice <= 0) {
    return NextResponse.json(
      { error: "Curso sem preço da vitrine PMB" },
      { status: 400 },
    )
  }

  let discountAmount = 0
  let couponId: string | null = null
  if (parsed.data.couponCode) {
    const code = parsed.data.couponCode.toUpperCase()
    const now = new Date()
    const coupon = await prisma.coupon.findFirst({
      where: {
        tenantId: null,
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

    // Cap por papel do vendedor no momento da aplicacao
    const cap = guard.session.role === "PMB_SALES" ? PMB_SALES_CAP : 100
    if (
      coupon.discountType === "PERCENTAGE" &&
      Number(coupon.discountValue) > cap
    ) {
      return NextResponse.json(
        { error: `Cupom excede seu cap (${cap}%)` },
        { status: 403 },
      )
    }

    const raw =
      coupon.discountType === "PERCENTAGE"
        ? (basePrice * Number(coupon.discountValue)) / 100
        : Number(coupon.discountValue)
    discountAmount = Math.min(raw, basePrice)
    couponId = coupon.id
  }

  const finalAmount = Number((basePrice - discountAmount).toFixed(2))

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId: null,
      studentId: student.id,
      tenantCourseId: null,
      courseId: course.id,
      soldByUserId: guard.session.userId,
      paymentType: "ONE_TIME",
      status: "PENDING",
      originalAmount: basePrice,
      discountAmount,
      finalAmount,
      couponId,
    },
    select: { id: true },
  })

  const externalReference = `pmb_enr_${enrollment.id}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

  const preference = await createPreference(mpToken, {
    items: [
      {
        id: course.id,
        title: course.nome,
        quantity: 1,
        unit_price: finalAmount,
        currency_id: "BRL",
      },
    ],
    payer: {
      name: student.nome,
      email: student.email,
      identification: student.cpf
        ? { type: "CPF", number: student.cpf }
        : undefined,
    },
    back_urls: appUrl
      ? {
          success: `${appUrl}/admin/vendas?ok=${enrollment.id}`,
          failure: `${appUrl}/admin/vendas?err=${enrollment.id}`,
          pending: `${appUrl}/admin/vendas?pend=${enrollment.id}`,
        }
      : undefined,
    auto_return: "approved",
    external_reference: externalReference,
    notification_url: appUrl ? `${appUrl}/api/webhooks/mercadopago` : undefined,
  })

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      mpPreferenceId: preference.id,
      externalReference,
    },
  })

  return NextResponse.json({
    data: {
      enrollmentId: enrollment.id,
      initPoint: preference.init_point,
      finalAmount,
      discountAmount,
    },
  })
}
