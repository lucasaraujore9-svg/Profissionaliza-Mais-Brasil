import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  createPreference,
  createPreapproval,
  decryptTenantMpToken,
} from "@/lib/mercadopago/client"
import { upsertStudent } from "@/lib/students/upsert"
import { provisionStudentAccess } from "@/lib/students/access"

const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/
const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/

const bodySchema = z.object({
  courseId: z.string().min(1),
  couponCode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : undefined)),
  nome: z.string().trim().min(3).max(160),
  email: z.string().email().toLowerCase().trim(),
  cpf: z
    .string()
    .trim()
    .regex(cpfRegex, "CPF inválido")
    .transform((v) => v.replace(/\D/g, "")),
  fone: z.string().trim().regex(phoneRegex, "Telefone inválido"),
  endereco: z.string().trim().max(300).optional(),
})

type ParsedBody = z.infer<typeof bodySchema>

function normalize(s: string): string {
  return s.trim()
}

export async function POST(request: Request) {
  const tenantId = request.headers.get("x-tenant-id")
  const tenantSlug = request.headers.get("x-tenant-slug")

  if (!tenantId) {
    return NextResponse.json(
      { error: "Tenant não identificado", code: "TENANT_MISSING" },
      { status: 400 },
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: "JSON inválido", code: "INVALID_JSON" },
      { status: 400 },
    )
  }

  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const data: ParsedBody = parsed.data

  try {
    const [tenant, tenantCourse] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          slug: true,
          name: true,
          mpAccessToken: true,
          plataformaVendedorId: true,
        },
      }),
      prisma.tenantCourse.findFirst({
        where: { id: data.courseId, tenantId, isVisible: true },
        include: {
          course: {
            select: {
              nome: true,
              slug: true,
              plataformaCourseId: true,
              monthlyMonthsMain: true,
            },
          },
        },
      }),
    ])

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant inválido", code: "TENANT_INVALID" },
        { status: 404 },
      )
    }

    if (!tenantCourse) {
      return NextResponse.json(
        { error: "Curso não encontrado", code: "COURSE_NOT_FOUND" },
        { status: 404 },
      )
    }

    if (!tenant.mpAccessToken) {
      return NextResponse.json(
        {
          error: "Loja ainda não configurou o pagamento",
          code: "MP_NOT_CONFIGURED",
        },
        { status: 503 },
      )
    }

    const basePrice = Number(tenantCourse.price)

    let discountAmount = 0
    let couponId: string | null = null
    if (data.couponCode) {
      const now = new Date()
      const coupon = await prisma.coupon.findFirst({
        where: {
          tenantId,
          code: data.couponCode,
          isActive: true,
          validFrom: { lte: now },
          validUntil: { gte: now },
        },
      })

      if (!coupon) {
        return NextResponse.json(
          { error: "Cupom inválido", code: "COUPON_INVALID" },
          { status: 400 },
        )
      }

      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        return NextResponse.json(
          { error: "Cupom esgotado", code: "COUPON_EXHAUSTED" },
          { status: 400 },
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

    const student = await upsertStudent({
      tenantId,
      nome: normalize(data.nome),
      email: data.email,
      cpf: data.cpf,
      fone: data.fone,
      endereco: data.endereco,
      polo: tenant.slug,
      vendedorId: tenant.plataformaVendedorId,
      plataformaAlunoIdFallback: `pending_${Date.now()}`,
    })

    await provisionStudentAccess(student.id, {
      isPmbVitrine: false,
      slug: tenant.slug,
      name: tenant.name,
    }).catch((err) => {
      console.error("[loja-checkout] provisionStudentAccess falhou:", err)
    })

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: tenantCourse.courseId,
        tenantId,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: { id: true, status: true },
    })
    if (existingEnrollment) {
      return NextResponse.json(
        {
          error:
            existingEnrollment.status === "PENDING"
              ? "Você já tem uma cobrança pendente para este curso"
              : "Você já possui este curso",
          code: "DUPLICATE_ENROLLMENT",
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
        tenantId,
        studentId: student.id,
        tenantCourseId: tenantCourse.id,
        courseId: tenantCourse.courseId,
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

    const externalReference = `enr_${enrollment.id}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
    const host = request.headers.get("host") ?? ""
    const protocol = request.headers.get("x-forwarded-proto") ?? "https"
    const storeUrl =
      tenantSlug && appUrl
        ? `${protocol}://${tenantSlug}.${new URL(appUrl).host}`
        : `${protocol}://${host}`

    const accessToken = decryptTenantMpToken(tenant.mpAccessToken)

    if (isMonthly && monthlyMonths) {
      // Cursos mensais usam preapproval (subscription recorrente do MP).
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
        back_url: `${storeUrl}/loja/confirmacao?enrollment_id=${enrollment.id}`,
        notification_url: appUrl
          ? `${appUrl}/api/webhooks/mercadopago?tenant=${tenantSlug}`
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
        data: {
          mpSubscriptionId: preapproval.id,
          externalReference,
        },
      })

      return NextResponse.json({
        data: {
          enrollmentId: enrollment.id,
          mode: "subscription",
          installmentsTotal: monthlyMonths,
          initPoint: preapproval.init_point,
        },
      })
    }

    const preference = await createPreference(accessToken, {
      items: [
        {
          id: tenantCourse.id,
          title: tenantCourse.course.nome,
          quantity: 1,
          unit_price: finalAmount,
          currency_id: "BRL",
        },
      ],
      payer: {
        name: student.nome,
        email: student.email ?? data.email,
        identification: { type: "CPF", number: data.cpf },
      },
      back_urls: {
        success: `${storeUrl}/loja/confirmacao?enrollment_id=${enrollment.id}`,
        failure: `${storeUrl}/loja/checkout?course_id=${tenantCourse.id}&error=payment_failed`,
        pending: `${storeUrl}/loja/confirmacao?enrollment_id=${enrollment.id}`,
      },
      auto_return: "approved",
      external_reference: externalReference,
      notification_url: `${appUrl}/api/webhooks/mercadopago?tenant=${tenantSlug}`,
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
        mode: "one_time",
        initPoint: preference.init_point,
      },
    })
  } catch (error) {
    console.error("[checkout] error:", error)
    return NextResponse.json(
      { error: "Erro ao processar checkout", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
}
