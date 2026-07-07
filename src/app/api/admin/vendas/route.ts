import { NextResponse } from "next/server"
import { z } from "zod"
import type { PaymentType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbMpAccessToken } from "@/lib/pmb-config"
import { createPreference, createPreapproval } from "@/lib/mercadopago/client"
import {
  findOrCreateAsaasCustomer,
  createPayment as createAsaasPayment,
  createSubscription as createAsaasSubscription,
  listPayments as listAsaasPayments,
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import { getSystemSettings } from "@/lib/system-settings"
import { contextLogger } from "@/lib/logger"
import { provisionStudentAccess } from "@/lib/students/access"
import { fulfillScholarshipEnrollment } from "@/lib/enrollment/fulfill"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { assertCouponMatchesEnrollment } from "@/lib/checkout/assert-tenant-gateway"
import { dueDateInDays } from "@/lib/checkout/due-date"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { asaasWebhookUrl, mpWebhookUrl } from "@/lib/tenant/urls"
import { getPackageForCheckout } from "@/lib/packages/vitrine"

const PMB_SALES_CAP = 50

export const GET = withRequestContext(
  { action: "admin.vendas.list", route: "/api/admin/vendas" },
  async (request: Request) => {
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
      gateway: e.gateway,
      soldByName: e.soldByUser?.name ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  })
  },
)

const createSchema = z
  .object({
    studentId: z.string().min(1),
    // Alvo da venda: curso OU pacote (CoursePackage PMB). Exatamente um.
    courseId: z.string().min(1).optional(),
    packageId: z.string().min(1).optional(),
    couponCode: z.string().trim().max(64).optional(),
    // Bolsa de estudo: cria o aluno na plataforma sem gerar cobranca no gateway.
    bolsista: z.boolean().optional(),
  })
  .refine((v) => !!v.courseId !== !!v.packageId, {
    message: "Informe courseId ou packageId",
    path: ["courseId"],
  })

export const POST = withRequestContext(
  { action: "admin.vendas.create", route: "/api/admin/vendas" },
  async (request: Request) => {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

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

  const isBolsista = parsed.data.bolsista === true

  const settings = await getSystemSettings()
  const gateway = settings.pmbDirectSaleGateway

  // Bolsa nao toca no gateway — pulamos a validacao de credenciais MP/Asaas.
  if (!isBolsista) {
    if (gateway === "MP") {
      const exists = await pmbMpAccessToken()
      if (!exists) {
        return NextResponse.json(
          { error: "Token Mercado Pago PMB não configurado" },
          { status: 503 },
        )
      }
    }
    if (gateway === "ASAAS" && (!process.env.ASAAS_API_URL || !process.env.ASAAS_API_KEY)) {
      return NextResponse.json(
        { error: "Asaas não configurado (ASAAS_API_URL/ASAAS_API_KEY)" },
        { status: 503 },
      )
    }
  }

  const pmbTenant = await getOrCreatePmbTenant()

  const student = await prisma.student.findFirst({
    where: { id: parsed.data.studentId, tenantId: pmbTenant.id },
    select: {
      id: true,
      nome: true,
      email: true,
      cpf: true,
      fone: true,
      asaasCustomerId: true,
    },
  })

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }
  if (!student.email) {
    return NextResponse.json(
      { error: "Aluno sem email cadastrado" },
      { status: 400 },
    )
  }

  // Resolve o alvo da venda em variáveis unificadas (curso ou pacote PMB). O
  // pacote cria a matrícula PRIMÁRIA (packagePrimary=true, courseId=curso
  // primário); os satélites nascem no fulfill. Pacote é sempre pagamento único.
  const isPackage = !!parsed.data.packageId
  let basePrice: number
  let enrollmentCourseId: string
  let enrollmentCoursePackageId: string | null
  let purchaseName: string
  let rawPaymentType: PaymentType
  let monthlyMonthsMain: number | null

  if (isPackage) {
    const pkg = await getPackageForCheckout(null, parsed.data.packageId!)
    if (!pkg) {
      return NextResponse.json({ error: "Pacote não disponível" }, { status: 404 })
    }
    basePrice = pkg.price
    enrollmentCourseId = pkg.courses[0].id
    enrollmentCoursePackageId = pkg.id
    purchaseName = `Pacote: ${pkg.name}`
    rawPaymentType = "ONE_TIME"
    monthlyMonthsMain = null
  } else {
    const course = await prisma.course.findUnique({
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
    })
    if (!course || course.status !== "ATIVO") {
      return NextResponse.json({ error: "Curso não disponível" }, { status: 404 })
    }
    basePrice = Number(
      course.precoVitrineMain ?? course.precoPromocional ?? course.precoOriginal ?? 0,
    )
    if (basePrice <= 0) {
      return NextResponse.json(
        { error: "Curso sem preço da vitrine PMB" },
        { status: 400 },
      )
    }
    enrollmentCourseId = course.id
    enrollmentCoursePackageId = null
    purchaseName = course.nome
    rawPaymentType = course.paymentTypeMain
    monthlyMonthsMain = course.monthlyMonthsMain
  }

  // Na bolsa o fulfillScholarshipEnrollment cuida da senha do painel + email de
  // boas-vindas de forma sincrona, entao pulamos aqui pra nao reenviar.
  if (!isBolsista) {
    await provisionStudentAccess(student.id, {
      isPmbVitrine: true,
      slug: pmbTenant.slug,
    }).catch((err) => {
      contextLogger().error(
        { err, event: "admin.vendas.provision_access_failed", studentId: student.id },
        "provisionStudentAccess falhou",
      )
    })
  }

  // Duplicidade: pacote compara pela matrícula primária; curso, pelo Course.
  const existingEnrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: student.id,
      ...(isPackage
        ? { coursePackageId: enrollmentCoursePackageId!, packagePrimary: true }
        : { courseId: enrollmentCourseId }),
      status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
    },
    select: { id: true, status: true },
  })
  if (existingEnrollment) {
    const alvo = isPackage ? "pacote" : "curso"
    return NextResponse.json(
      {
        error:
          existingEnrollment.status === "PENDING"
            ? `Este aluno já tem uma cobrança pendente para este ${alvo}`
            : `Este aluno já possui este ${alvo} ativo`,
      },
      { status: 409 },
    )
  }

  // ── Bolsa de estudo ─────────────────────────────────────────────────────
  // Sem cobranca: marca o aluno como bolsista, cria a matricula ja ACTIVE e
  // provisiona o acesso na plataforma de aulas de forma sincrona. Cupom e
  // ignorado (nao ha valor a descontar). Valor cheio vai como desconto pra
  // refletir nos relatorios o quanto foi concedido.
  if (isBolsista) {
    await prisma.student.update({
      where: { id: student.id },
      data: { bolsista: true },
    })

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId: null,
        studentId: student.id,
        tenantCourseId: null,
        courseId: enrollmentCourseId,
        coursePackageId: enrollmentCoursePackageId,
        packagePrimary: isPackage,
        soldByUserId: guard.session.userId,
        paymentType: rawPaymentType,
        status: "PENDING",
        gateway,
        originalAmount: basePrice,
        discountAmount: basePrice,
        finalAmount: 0,
        couponId: null,
        installmentsTotal: null,
      },
      select: { id: true },
    })

    try {
      await fulfillScholarshipEnrollment(
        {
          id: pmbTenant.id,
          slug: pmbTenant.slug,
          plataformaVendedorId: null,
          isPmbVitrine: true,
          name: "Profissionaliza Mais Brasil",
        },
        enrollment.id,
      )
    } catch (err) {
      await prisma.enrollment
        .delete({ where: { id: enrollment.id } })
        .catch(swallow("admin.vendas.bolsa.rollback"))
      contextLogger().error(
        { err, event: "admin.vendas.bolsa_failed", studentId: student.id, courseId: enrollmentCourseId },
        "concessao de bolsa falhou",
      )
      return NextResponse.json(
        { error: "Falha ao matricular o aluno na plataforma de aulas. Tente novamente." },
        { status: 502 },
      )
    }

    return NextResponse.json({
      data: {
        enrollmentId: enrollment.id,
        scholarship: true,
        finalAmount: 0,
      },
    })
  }

  let discountAmount = 0
  let finalAmount = basePrice
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

    // Venda PMB: cupom e matrícula têm tenantId=null. Bloqueia cupom de revenda.
    assertCouponMatchesEnrollment({
      couponTenantId: coupon.tenantId,
      enrollmentTenantId: null,
      context: "admin.vendas.coupon",
    })

    // Cálculo unificado em Prisma.Decimal (mesmo helper das demais rotas) —
    // evita divergência de centavos entre o valor cobrado e os relatórios.
    const applied = applyCouponDiscount({
      basePrice,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    })

    // Cap aplicado sobre o desconto EFETIVO (cobre PERCENTAGE e FIXED).
    // Antes o cap só checava PERCENTAGE, então um cupom FIXED zerava o preço
    // e burlava o limite de 50% do PMB_SALES.
    const cap = guard.session.role === "PMB_SALES" ? PMB_SALES_CAP : 100
    const effectivePct = (applied.discountAmount / basePrice) * 100
    if (effectivePct > cap + 0.01) {
      return NextResponse.json(
        { error: `Cupom excede seu cap (${cap}%)` },
        { status: 403 },
      )
    }

    discountAmount = applied.discountAmount
    finalAmount = applied.finalAmount
    const reserved = await tryConsumeCoupon(coupon.id)
    if (!reserved) {
      return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 })
    }
    couponId = coupon.id
  }

  // Pacote é sempre pagamento único (rawPaymentType já vem "ONE_TIME").
  const isMonthly = rawPaymentType === "MONTHLY"
  const monthlyMonths = isMonthly ? monthlyMonthsMain ?? 12 : null

  // MP+MONTHLY agora suportado via preapproval (subscription)

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId: null,
      studentId: student.id,
      tenantCourseId: null,
      courseId: enrollmentCourseId,
      coursePackageId: enrollmentCoursePackageId,
      packagePrimary: isPackage,
      soldByUserId: guard.session.userId,
      paymentType: rawPaymentType,
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
      await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("admin.vendas"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("admin.vendas"))
      return NextResponse.json(
        { error: "Token Mercado Pago PMB não configurado" },
        { status: 503 },
      )
    }

    // Wrapper try/catch obrigatório: ver explicação na rota /api/aluno/comprar.
    // Sem isso, falha de MP (5xx, timeout) deixa enrollment PENDING órfã +
    // cupom com usedCount inflado pra sempre.
    try {
      if (isMonthly && monthlyMonths) {
        // Preapproval (subscription recorrente MP)
        const startDate = new Date(Date.now() + 60_000).toISOString()
        const endDate = new Date(
          Date.now() +
            monthlyMonths * 31 * 24 * 60 * 60 * 1000 +
            3 * 24 * 60 * 60 * 1000,
        ).toISOString()

        const preapproval = await createPreapproval(mpToken, {
          reason: `Mensalidade — ${purchaseName}`,
          external_reference: externalReference,
          payer_email: student.email,
          back_url: `${appUrl || `https://${process.env.NEXT_PUBLIC_APP_DOMAIN ?? "profissionalizamaisbrasil.com.br"}`}/admin/vendas?ok=${enrollment.id}`,
          // mpWebhookUrl() (sem ?tenant = PMB) NUNCA é undefined e usa o host
          // canônico www — evita o webhook perdido por env vazia OU pelo apex que
          // responde 307→www (que o MP não segue). Substitui a construção manual.
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
        }, externalReference)

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
            discountAmount,
          },
        })
      }

      const preference = await createPreference(mpToken, {
        items: [
          {
            id: enrollmentCourseId,
            title: purchaseName,
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
        // API-001: usa o helper canônico (host www, nunca undefined). A concat
        // manual perdia o webhook quando appUrl era vazio ou o apex (307→www
        // que o MP não segue) → venda paga sem matrícula automática.
        notification_url: mpWebhookUrl(),
      }, externalReference)

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
          mode: "one_time",
          initPoint: preference.init_point,
          finalAmount,
          discountAmount,
        },
      })
    } catch (mpError) {
      await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("admin.vendas.rollback"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("admin.vendas.rollback"))
      throw mpError
    }
  }

  // gateway === "ASAAS"
  if (!student.cpf) {
    await prisma.enrollment.delete({ where: { id: enrollment.id } })
    if (couponId) await releaseCoupon(couponId).catch(swallow("admin.vendas"))
    return NextResponse.json(
      { error: "Aluno precisa ter CPF cadastrado para cobrança via Asaas" },
      { status: 400 },
    )
  }

  try {
    const { customer } = await findOrCreateAsaasCustomer({
      name: student.nome,
      email: student.email ?? undefined,
      cpfCnpj: student.cpf,
      mobilePhone: student.fone ?? undefined,
      externalReference: `pmb_student_${student.id}`,
    })

    if (!student.asaasCustomerId) {
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
        description: `Mensalidade — ${purchaseName}`,
        externalReference,
        maxPayments: monthlyMonths,
        notificationUrl: asaasWebhookUrl(),
      }, motherAsaasKey())

      // Asaas gera as cobrancas async; busca a 1a invoice em ate 3 tentativas
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
          discountAmount,
        },
      })
    }

    // ONE_TIME
    const payment = await createAsaasPayment({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: finalAmount,
      dueDate: dueDateInDays(3),
      description: isPackage ? purchaseName : `Curso: ${purchaseName}`,
      externalReference,
      notificationUrl: asaasWebhookUrl(),
    }, motherAsaasKey())

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
        discountAmount,
      },
    })
  } catch (error) {
    await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("admin.vendas"))
    if (couponId) await releaseCoupon(couponId).catch(swallow("admin.vendas"))
    const message =
      error instanceof AsaasApiError
        ? error.message
        : "Falha ao criar cobrança no Asaas"
    return NextResponse.json({ error: message }, { status: 502 })
  }
  },
)
