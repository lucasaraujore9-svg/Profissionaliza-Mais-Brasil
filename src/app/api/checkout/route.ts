import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { createPreference } from "@/lib/mercadopago/client"
import {
  findOrCreateAsaasCustomer,
  createPayment as createAsaasPayment,
  AsaasApiError,
} from "@/lib/asaas/client"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import {
  pmbEaPolo,
  pmbEaVendedorId,
  pmbMpAccessToken,
} from "@/lib/pmb-config"
import { getSystemSettings } from "@/lib/system-settings"

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

function dueDateInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: Request) {
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
    const settings = await getSystemSettings()
    const gateway = settings.pmbDirectSaleGateway

    // Pré-check do gateway escolhido — falha cedo se faltam credenciais.
    if (gateway === "MP") {
      const token = await pmbMpAccessToken()
      if (!token) {
        return NextResponse.json(
          {
            error: "Pagamento PMB ainda não configurado",
            code: "MP_NOT_CONFIGURED",
          },
          { status: 503 },
        )
      }
    } else {
      if (!process.env.ASAAS_API_URL || !process.env.ASAAS_API_KEY) {
        return NextResponse.json(
          {
            error: "Pagamento PMB ainda não configurado",
            code: "ASAAS_NOT_CONFIGURED",
          },
          { status: 503 },
        )
      }
    }

    const course = await prisma.course.findUnique({
      where: { id: data.courseId },
      select: {
        id: true,
        nome: true,
        slug: true,
        status: true,
        hiddenMain: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        paymentTypeMain: true,
      },
    })

    if (!course || course.status !== "ATIVO" || course.hiddenMain) {
      return NextResponse.json(
        { error: "Curso não disponível", code: "COURSE_NOT_FOUND" },
        { status: 404 },
      )
    }

    // Venda direta pública suporta apenas ONE_TIME. Cursos mensais exigem
    // atendimento pelo time PMB (admin cria a venda manualmente).
    if (course.paymentTypeMain !== "ONE_TIME") {
      return NextResponse.json(
        {
          error:
            "Este curso é vendido por mensalidade. Entre em contato com nossa equipe para concluir a matrícula.",
          code: "COURSE_REQUIRES_MANUAL_SALE",
        },
        { status: 400 },
      )
    }

    const basePrice = Number(
      course.precoVitrineMain ??
        course.precoPromocional ??
        course.precoOriginal ??
        0,
    )
    if (basePrice <= 0) {
      return NextResponse.json(
        { error: "Curso sem preço configurado", code: "COURSE_NO_PRICE" },
        { status: 400 },
      )
    }

    let discountAmount = 0
    let couponId: string | null = null
    if (data.couponCode) {
      const now = new Date()
      const coupon = await prisma.coupon.findFirst({
        where: {
          tenantId: null,
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

    const pmbTenant = await getOrCreatePmbTenant()

    const student = await prisma.student.upsert({
      where: {
        tenantId_email: { tenantId: pmbTenant.id, email: data.email },
      },
      create: {
        tenantId: pmbTenant.id,
        nome: normalize(data.nome),
        email: data.email,
        fone: data.fone,
        cpf: data.cpf,
        rua: data.endereco,
        polo: pmbEaPolo(),
        vendedorId: pmbEaVendedorId(),
        eaAlunoId: `pending_${Date.now()}`,
        status: "ATIVO",
      },
      update: {
        nome: normalize(data.nome),
        fone: data.fone,
        cpf: data.cpf,
        rua: data.endereco ?? undefined,
      },
      select: {
        id: true,
        email: true,
        nome: true,
        cpf: true,
        fone: true,
        asaasCustomerId: true,
      },
    })

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: course.id,
        tenantId: null,
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

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId: null,
        studentId: student.id,
        tenantCourseId: null,
        courseId: course.id,
        paymentType: course.paymentTypeMain,
        status: "PENDING",
        gateway,
        originalAmount: basePrice,
        discountAmount,
        finalAmount,
        couponId,
      },
      select: { id: true },
    })

    const externalReference = `pmb_enr_${enrollment.id}`
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")
    const host = request.headers.get("host") ?? ""
    const protocol = request.headers.get("x-forwarded-proto") ?? "https"
    const siteUrl = appUrl || `${protocol}://${host}`

    if (gateway === "MP") {
      // Token já validado no pré-check acima.
      const mpToken = (await pmbMpAccessToken())!

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
          email: student.email ?? data.email,
          identification: { type: "CPF", number: data.cpf },
        },
        back_urls: {
          success: `${siteUrl}/checkout/confirmacao?enrollment_id=${enrollment.id}`,
          failure: `${siteUrl}/checkout?course_id=${course.id}&error=payment_failed`,
          pending: `${siteUrl}/checkout/confirmacao?enrollment_id=${enrollment.id}`,
        },
        auto_return: "approved",
        external_reference: externalReference,
        notification_url: appUrl
          ? `${appUrl}/api/webhooks/mercadopago`
          : undefined,
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
          gateway: "MP",
          initPoint: preference.init_point,
        },
      })
    }

    // gateway === "ASAAS"
    try {
      const { customer } = await findOrCreateAsaasCustomer({
        name: student.nome,
        email: student.email ?? data.email,
        cpfCnpj: data.cpf,
        mobilePhone: student.fone ?? data.fone,
        externalReference: `pmb_student_${student.id}`,
      })

      if (!student.asaasCustomerId) {
        await prisma.student.update({
          where: { id: student.id },
          data: { asaasCustomerId: customer.id },
        })
      }

      const payment = await createAsaasPayment({
        customer: customer.id,
        billingType: "UNDEFINED",
        value: finalAmount,
        dueDate: dueDateInDays(3),
        description: `Curso: ${course.nome}`,
        externalReference,
        notificationUrl: appUrl ? `${appUrl}/api/webhooks/asaas` : undefined,
      })

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          externalReference,
          asaasCustomerId: customer.id,
          asaasPaymentId: payment.id,
          asaasInvoiceUrl: payment.invoiceUrl,
        },
      })

      return NextResponse.json({
        data: {
          enrollmentId: enrollment.id,
          gateway: "ASAAS",
          initPoint: payment.invoiceUrl,
        },
      })
    } catch (error) {
      await prisma.enrollment
        .delete({ where: { id: enrollment.id } })
        .catch(() => undefined)
      const message =
        error instanceof AsaasApiError
          ? error.message
          : "Falha ao gerar cobrança no Asaas"
      return NextResponse.json(
        { error: message, code: "ASAAS_ERROR" },
        { status: 502 },
      )
    }
  } catch (error) {
    console.error("[pmb-checkout] error:", error)
    return NextResponse.json(
      { error: "Erro ao processar checkout", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
}
