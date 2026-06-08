import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { pmbMpAccessToken } from "@/lib/pmb-config"
import { createPreference, createPreapproval } from "@/lib/mercadopago/client"
import {
  findOrCreateAsaasCustomer,
  getCustomer as getAsaasCustomer,
  createPayment as createAsaasPayment,
  createSubscription as createAsaasSubscription,
  listPayments as listAsaasPayments,
  AsaasApiError,
} from "@/lib/asaas/client"
import { getSystemSettings } from "@/lib/system-settings"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { dueDateInDays } from "@/lib/checkout/due-date"
import { mpWebhookUrl } from "@/lib/tenant/urls"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"

const createSchema = z.object({
  courseId: z.string().min(1),
  couponCode: z.string().trim().max(64).optional(),
})


export const POST = withRequestContext(
  { action: "aluno.comprar", route: "/api/aluno/comprar" },
  async (request: Request) => {
  const session = await requireStudentSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
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

  const settings = await getSystemSettings()
  const gateway = settings.pmbDirectSaleGateway

  const [student, course] = await Promise.all([
    prisma.student.findUnique({
      where: { id: session.studentId },
      select: {
        id: true,
        nome: true,
        email: true,
        cpf: true,
        fone: true,
        asaasCustomerId: true,
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
        paymentTypeMain: true,
        monthlyMonthsMain: true,
      },
    }),
  ])

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }
  if (!student.email) {
    return NextResponse.json(
      { error: "Cadastre seu email no perfil antes de comprar" },
      { status: 400 },
    )
  }
  if (!course || course.status !== "ATIVO") {
    return NextResponse.json({ error: "Curso indisponível" }, { status: 404 })
  }

  // Bloqueia compra duplicada de curso ainda ativo
  const existingActive = await prisma.enrollment.findFirst({
    where: {
      studentId: student.id,
      courseId: course.id,
      status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
    },
    select: { id: true, status: true },
  })
  if (existingActive) {
    return NextResponse.json(
      {
        error:
          existingActive.status === "PENDING"
            ? "Você já tem uma cobrança pendente para este curso"
            : "Você já tem este curso na sua conta",
      },
      { status: 409 },
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
      { error: "Curso sem preço configurado na vitrine" },
      { status: 400 },
    )
  }

  let discountAmount = 0
  let couponId: string | null = null
  let finalAmountFromHelper: number | null = null
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
    // Cálculo via helper centralizado com Prisma.Decimal — evita drift de
    // arredondamento entre rotas e elimina float em arithmetic financeira.
    const result = applyCouponDiscount({
      basePrice,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    })
    discountAmount = result.discountAmount
    finalAmountFromHelper = result.finalAmount
    const reserved = await tryConsumeCoupon(coupon.id)
    if (!reserved) {
      return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 })
    }
    couponId = coupon.id
  }

  const finalAmount = finalAmountFromHelper ?? basePrice

  const isMonthly = course.paymentTypeMain === "MONTHLY"
  const monthlyMonths = isMonthly ? course.monthlyMonthsMain ?? 12 : null

  // MP+MONTHLY agora suportado via preapproval

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
      installmentsTotal: monthlyMonths,
    },
    select: { id: true },
  })

  const externalReference = `pmb_enr_${enrollment.id}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

  if (gateway === "MP") {
    const mpToken = await pmbMpAccessToken()
    if (!mpToken) {
      await prisma.enrollment.delete({ where: { id: enrollment.id } })
      if (couponId) await releaseCoupon(couponId).catch(swallow("aluno.comprar"))
      return NextResponse.json(
        { error: "Mercado Pago não configurado" },
        { status: 503 },
      )
    }

    // Wrapper try/catch obrigatório: se MP retornar 5xx/timeout, precisamos
    // deletar a enrollment PENDING (evita "duplicate enrollment" em retry) e
    // liberar o cupom (caso contrário o usedCount fica inflado pra sempre).
    // Antes este bloco rodava sem proteção e órfãos contaminavam o estoque
    // de cupons + bloqueavam novas compras.
    try {
      if (isMonthly && monthlyMonths) {
        const startDate = new Date(Date.now() + 60_000).toISOString()
        const endDate = new Date(
          Date.now() +
            monthlyMonths * 31 * 24 * 60 * 60 * 1000 +
            3 * 24 * 60 * 60 * 1000,
        ).toISOString()

        const preapproval = await createPreapproval(mpToken, {
          reason: `Mensalidade — ${course.nome}`,
          external_reference: externalReference,
          payer_email: student.email,
          back_url: `${appUrl || `https://${process.env.NEXT_PUBLIC_APP_DOMAIN ?? "profissionalizamaisbrasil.com.br"}`}/aluno/pagamentos?ok=${enrollment.id}`,
          // Vitrine PMB (sem slug) — host canônico www, o apex faz 307.
          notification_url: mpWebhookUrl(),
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
            gateway: "MP",
            mode: "subscription",
            installmentsTotal: monthlyMonths,
            initPoint: preapproval.init_point,
            finalAmount,
          },
        })
      }

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
              success: `${appUrl}/aluno/pagamentos?ok=${enrollment.id}`,
              failure: `${appUrl}/aluno/pagamentos?err=${enrollment.id}`,
              pending: `${appUrl}/aluno/pagamentos?pend=${enrollment.id}`,
            }
          : undefined,
        auto_return: "approved",
        external_reference: externalReference,
        // Vitrine PMB (sem slug) — host canônico www, o apex faz 307.
        notification_url: mpWebhookUrl(),
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
          finalAmount,
        },
      })
    } catch (mpError) {
      await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("aluno.comprar.rollback"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("aluno.comprar.rollback"))
      throw mpError
    }
  }

  // ASAAS
  if (!process.env.ASAAS_API_URL || !process.env.ASAAS_API_KEY) {
    await prisma.enrollment.delete({ where: { id: enrollment.id } })
    if (couponId) await releaseCoupon(couponId).catch(swallow("aluno.comprar"))
    return NextResponse.json({ error: "Asaas não configurado" }, { status: 503 })
  }
  if (!student.cpf) {
    await prisma.enrollment.delete({ where: { id: enrollment.id } })
    if (couponId) await releaseCoupon(couponId).catch(swallow("aluno.comprar"))
    return NextResponse.json(
      { error: "Cadastre seu CPF no perfil antes de comprar via Asaas" },
      { status: 400 },
    )
  }

  try {
    // Reutiliza customer Asaas existente — evita duplicatas em compras múltiplas.
    // Mas o asaasCustomerId salvo pode pertencer a OUTRA conta Asaas: alunos
    // criados em homologação (sandbox) guardam um cus_ que não existe na conta
    // de produção. Nesse caso o Asaas responde 404 ao buscar o customer; antes
    // esse 404 vazava como AsaasApiError e derrubava o checkout inteiro (a rota
    // respondia 502 com a mensagem "HTTP 404"). Tratamos o 404 como "id obsoleto":
    // recriamos o customer na conta atual e regravamos o id no aluno.
    let customer: Awaited<ReturnType<typeof getAsaasCustomer>> | null = null
    if (student.asaasCustomerId) {
      try {
        customer = await getAsaasCustomer(student.asaasCustomerId)
      } catch (err) {
        if (err instanceof AsaasApiError && err.statusCode === 404) {
          customer = null
        } else {
          throw err
        }
      }
    }

    if (!customer) {
      const result = await findOrCreateAsaasCustomer({
        name: student.nome,
        email: student.email,
        cpfCnpj: student.cpf,
        mobilePhone: student.fone ?? undefined,
        externalReference: `pmb_student_${student.id}`,
      })
      customer = result.customer
      await prisma.student.update({
        where: { id: student.id },
        data: { asaasCustomerId: customer.id },
      })
    }

    if (isMonthly && monthlyMonths) {
      const subscription = await createAsaasSubscription({
        customer: customer.id,
        billingType: "UNDEFINED",
        value: finalAmount,
        nextDueDate: dueDateInDays(3),
        cycle: "MONTHLY",
        description: `Mensalidade — ${course.nome}`,
        externalReference,
        maxPayments: monthlyMonths,
        notificationUrl: appUrl ? `${appUrl}/api/webhooks/asaas` : undefined,
      })

      let firstInvoiceUrl: string | null = null
      let firstPaymentId: string | null = null
      for (let i = 0; i < 3; i++) {
        const list = await listAsaasPayments({
          subscription: subscription.id,
          limit: 1,
          offset: 0,
        }).catch(() => null)
        const first = list?.data?.[0]
        if (first) {
          firstInvoiceUrl = first.invoiceUrl
          firstPaymentId = first.id
          break
        }
        await new Promise((r) => setTimeout(r, 500))
      }

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          externalReference,
          asaasCustomerId: customer.id,
          asaasSubscriptionId: subscription.id,
          asaasPaymentId: firstPaymentId,
          asaasInvoiceUrl: firstInvoiceUrl,
        },
      })

      return NextResponse.json({
        data: {
          enrollmentId: enrollment.id,
          gateway: "ASAAS",
          mode: "subscription",
          installmentsTotal: monthlyMonths,
          initPoint: firstInvoiceUrl,
          finalAmount,
        },
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
        mode: "one_time",
        initPoint: payment.invoiceUrl,
        finalAmount,
      },
    })
  } catch (error) {
    await prisma.enrollment
      .delete({ where: { id: enrollment.id } })
      .catch(swallow("aluno.comprar"))
    if (couponId) {
      await releaseCoupon(couponId).catch(swallow("aluno.comprar"))
    }
    const message =
      error instanceof AsaasApiError
        ? error.message
        : "Falha ao gerar cobrança no Asaas"
    return NextResponse.json({ error: message }, { status: 502 })
  }
  },
)
