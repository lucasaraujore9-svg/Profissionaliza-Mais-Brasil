import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { auth } from "@/lib/auth"
import {
  createPreference,
  decryptTenantMpToken,
} from "@/lib/mercadopago/client"

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
  tenantCourseId: z.string().cuid(),
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
      mpAccessToken: true,
      eaVendedorId: true,
    },
  })
  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant não encontrado" },
      { status: 404 },
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
      course: { select: { id: true, nome: true, slug: true } },
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
    if (
      coupon.discountType === "PERCENTAGE" &&
      Number(coupon.discountValue) > cap
    ) {
      return NextResponse.json(
        { error: `Cupom excede seu cap de desconto (${cap}%)` },
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
          eaAlunoId: "",
          polo: "",
          status: "INTERESSADO",
          updatedAt: new Date(),
        },
        select: { id: true, nome: true, email: true, cpf: true },
      })

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId: tenant.id,
      studentId: student.id,
      tenantCourseId: tenantCourse.id,
      courseId: tenantCourse.courseId,
      soldByUserId: userId,
      paymentType: tenantCourse.paymentType,
      status: "PENDING",
      originalAmount: basePrice,
      discountAmount,
      finalAmount,
      couponId,
    },
    select: { id: true },
  })

  const externalReference = `tenant_${tenant.slug}_enr_${enrollment.id}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const accessToken = decryptTenantMpToken(tenant.mpAccessToken)

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
    notification_url: appUrl
      ? `${appUrl}/api/webhooks/mercadopago`
      : undefined,
  })

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { mpPreferenceId: preference.id, externalReference },
  })

  return NextResponse.json({
    data: {
      enrollmentId: enrollment.id,
      initPoint: preference.init_point,
      finalAmount,
      discountAmount,
      basePrice,
      studentId: student.id,
    },
  })
}
