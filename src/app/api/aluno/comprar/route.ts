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
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import {
  assertPmbCharge,
  assertCouponMatchesEnrollment,
  isPmbTenantSlug,
} from "@/lib/checkout/assert-tenant-gateway"
import { getSystemSettings } from "@/lib/system-settings"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { dueDateInDays } from "@/lib/checkout/due-date"
import { mpWebhookUrl, asaasWebhookUrl } from "@/lib/tenant/urls"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { effectivePaymentType } from "@/lib/tenant/monthly-policy"
import { isSellablePrice } from "@/lib/checkout/price-guard"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import {
  isFreeAmount,
  pmbTenantContext,
  releaseFreeEnrollment,
  resellerTenantContext,
} from "@/lib/checkout/free-enrollment"
import { contextLogger } from "@/lib/logger"

const createSchema = z.object({
  courseId: z.string().min(1),
  couponCode: z.string().trim().max(64).optional(),
})

interface ResellerTenant {
  id: string
  slug: string
  name: string
  status: string
  mpAccessToken: string | null
  mpPublicKey: string | null
  plataformaVendedorId: string | null
  salesGateway: string | null
  asaasGatewayEnabled: boolean
  asaasConnected: boolean
  asaasWebhookToken: string | null
  monthlyAllowed: boolean
  monthlyEnabled: boolean
  monthlyScope: "DIRECT_ONLY" | "DIRECT_AND_VITRINE"
}

/**
 * Init de recompra para aluno de REVENDA. Espelha o caminho tenant-scoped de
 * /api/loja/checkout (preço da unidade = TenantCourse.price, gateway da própria
 * conta, cupons do tenant, matrícula escopada), mas autenticado: sem campos de
 * convidado e sem gate de CPF. NÃO cobra aqui — apenas cria a matrícula PENDING
 * e devolve os dados para o Payment Brick (cobrança em /api/aluno/comprar/process).
 */
async function handleResellerInit(
  tenantId: string,
  studentId: string,
  tenant: ResellerTenant,
  data: { courseId: string; couponCode?: string },
): Promise<NextResponse> {
  let consumedCouponId: string | null = null
  let createdEnrollmentId: string | null = null

  try {
    if (tenant.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Esta loja não está aceitando vendas no momento", code: "TENANT_INACTIVE" },
        { status: 403 },
      )
    }

    const mode = tenantCheckoutMode({
      salesGateway: tenant.salesGateway,
      asaasGatewayEnabled: tenant.asaasGatewayEnabled,
      asaasConnected: tenant.asaasConnected,
      mpAccessToken: tenant.mpAccessToken,
      mpPublicKey: tenant.mpPublicKey,
    })
    if (mode === "ASAAS" && !tenant.asaasWebhookToken) {
      return NextResponse.json(
        { error: "Gateway Asaas incompleto", code: "ASAAS_NOT_CONFIGURED" },
        { status: 503 },
      )
    }
    if (mode === "NONE") {
      return NextResponse.json(
        { error: "Loja ainda não configurou o pagamento", code: "CHECKOUT_UNAVAILABLE" },
        { status: 503 },
      )
    }
    const gateway: "MP" | "ASAAS" = mode

    const [student, tenantCourse] = await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, email: true, cpf: true },
      }),
      prisma.tenantCourse.findFirst({
        where: {
          tenantId,
          courseId: data.courseId,
          isVisible: true,
          price: { gt: 0 },
          course: { status: "ATIVO" },
        },
        include: {
          course: {
            select: {
              nome: true,
              monthlyMonthsMain: true,
              parcelasSugeridas: true,
              parcelasOverride: true,
            },
          },
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
    // Asaas exige CPF do pagador e o Payment Brick (payMode) não reenvia o CPF
    // digitado — sem CPF no cadastro a cobrança trava no /pagar. Bloqueia cedo
    // com mensagem clara (nenhum cupom foi consumido até aqui).
    if (gateway === "ASAAS" && !student.cpf) {
      return NextResponse.json(
        {
          error: "Cadastre seu CPF no perfil antes de comprar nesta loja",
          code: "STUDENT_CPF_REQUIRED",
        },
        { status: 400 },
      )
    }
    if (!tenantCourse) {
      return NextResponse.json(
        { error: "Curso não encontrado", code: "COURSE_NOT_FOUND" },
        { status: 404 },
      )
    }

    const basePrice = Number(tenantCourse.price)
    if (!isSellablePrice(basePrice)) {
      return NextResponse.json(
        { error: "Curso sem valor para venda", code: "COURSE_NO_PRICE" },
        { status: 400 },
      )
    }

    let discountAmount = 0
    let couponId: string | null = null
    let finalAmountFromCoupon: number | null = null
    if (data.couponCode) {
      const code = data.couponCode.toUpperCase()
      const now = new Date()
      const coupon = await prisma.coupon.findFirst({
        where: {
          tenantId,
          code,
          isActive: true,
          validFrom: { lte: now },
          validUntil: { gte: now },
        },
      })
      if (!coupon) {
        return NextResponse.json({ error: "Cupom inválido", code: "COUPON_INVALID" }, { status: 400 })
      }
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        return NextResponse.json({ error: "Cupom esgotado", code: "COUPON_EXHAUSTED" }, { status: 400 })
      }
      // Cupom e matrícula pertencem à mesma unidade (ambos `tenantId`). Bloqueia
      // cupom PMB (tenantId=null) aplicado a uma venda de revenda.
      assertCouponMatchesEnrollment({
        couponTenantId: coupon.tenantId,
        enrollmentTenantId: tenantId,
        context: "aluno.comprar.reseller.coupon",
      })
      const calc = applyCouponDiscount({
        basePrice,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      })
      discountAmount = calc.discountAmount
      finalAmountFromCoupon = calc.finalAmount
      const reserved = await tryConsumeCoupon(coupon.id)
      if (!reserved) {
        return NextResponse.json({ error: "Cupom esgotado", code: "COUPON_EXHAUSTED" }, { status: 400 })
      }
      couponId = coupon.id
      consumedCouponId = coupon.id
    }

    const finalAmount = finalAmountFromCoupon ?? basePrice

    const effectiveType = effectivePaymentType(tenantCourse.paymentType, tenant, "vitrine")
    const isMonthly = effectiveType === "MONTHLY"
    const monthlyMonths = isMonthly ? tenantCourse.course.monthlyMonthsMain ?? 12 : null

    // Bloqueio/reaproveitamento de matrícula existente (mesma regra da loja):
    // ACTIVE/COMPLETED → 409; PENDING → reaproveita (permite trocar cartão/método).
    const existing = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: tenantCourse.courseId,
        tenantId,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: { id: true, status: true, couponId: true, finalAmount: true },
    })

    if (existing && existing.status !== "PENDING") {
      if (consumedCouponId) {
        await releaseCoupon(consumedCouponId).catch(swallow("aluno.comprar.reseller"))
        consumedCouponId = null
      }
      return NextResponse.json(
        { error: "Você já possui este curso", code: "DUPLICATE_ENROLLMENT" },
        { status: 409 },
      )
    }

    if (existing) {
      let reusedAmount = Number(existing.finalAmount)
      if (consumedCouponId && !existing.couponId) {
        await prisma.enrollment.update({
          where: { id: existing.id },
          data: { originalAmount: basePrice, discountAmount, finalAmount, couponId },
        })
        reusedAmount = finalAmount
      } else if (consumedCouponId) {
        await releaseCoupon(consumedCouponId).catch(swallow("aluno.comprar.reseller"))
        consumedCouponId = null
      }
      // Cupom zerou o valor da matrícula reaproveitada: libera aqui, senão o
      // aluno cairia na tela de pagamento com R$ 0 (mesma regra de
      // /api/loja/checkout no reuso).
      if (isFreeAmount(reusedAmount)) {
        // Zerado ANTES do await: o cupom já está gravado na matrícula
        // reaproveitada, então devolvê-lo no catch liberaria um uso que segue
        // vinculado a uma venda viva.
        consumedCouponId = null
        await releaseFreeEnrollment(resellerTenantContext(tenant), existing.id)
        return NextResponse.json({ data: { enrollmentId: existing.id, free: true } })
      }
      // O cliente (student-buy-client) usa só enrollmentId; a tela /pagar
      // re-lê preço/gateway/parcelas do banco. Não devolvemos campos derivados
      // (e potencialmente defasados no reaproveitamento) que ninguém consome.
      return NextResponse.json({ data: { enrollmentId: existing.id } })
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId,
        studentId: student.id,
        tenantCourseId: tenantCourse.id,
        courseId: tenantCourse.courseId,
        paymentType: effectiveType,
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
    createdEnrollmentId = enrollment.id

    // ── Cupom cobriu 100% ────────────────────────────────────────────────────
    // Gateway recusa R$ 0: libera o acesso na hora, sem mandar o aluno para a
    // tela de pagamento.
    //
    // Rollback PRÓPRIO (e não o catch externo) porque `releaseFreeEnrollment`
    // provisiona o acesso e marca a matrícula ACTIVE ANTES de escrever as
    // notificações: uma falha tardia faria o catch externo apagar uma matrícula
    // JÁ provisionada. Só desfazemos o que continua PENDING.
    if (isFreeAmount(finalAmount)) {
      try {
        await releaseFreeEnrollment(resellerTenantContext(tenant), enrollment.id)
      } catch (err) {
        const stillPending = await prisma.enrollment
          .findUnique({ where: { id: enrollment.id }, select: { status: true } })
          .catch(() => null)
        if (stillPending?.status === "PENDING") {
          await prisma.enrollment
            .delete({ where: { id: enrollment.id } })
            .catch(swallow("aluno.comprar.reseller.free_rollback"))
          if (consumedCouponId) {
            await releaseCoupon(consumedCouponId).catch(
              swallow("aluno.comprar.reseller.free_rollback"),
            )
          }
        }
        createdEnrollmentId = null
        consumedCouponId = null
        contextLogger().error(
          { err, event: "aluno.comprar.reseller.free_failed", enrollmentId: enrollment.id },
          "liberacao de compra com desconto integral falhou",
        )
        return NextResponse.json(
          { error: "Falha ao liberar o curso. Tente novamente." },
          { status: 502 },
        )
      }
      consumedCouponId = null // venda concluída: não liberar a reserva no catch
      createdEnrollmentId = null // matrícula viva: o catch externo não pode apagá-la
      return NextResponse.json({
        data: { enrollmentId: enrollment.id, free: true },
      })
    }

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { externalReference: `enr_${enrollment.id}` },
    })

    return NextResponse.json({ data: { enrollmentId: enrollment.id } })
  } catch (error) {
    contextLogger().error(
      { err: error, event: "aluno.comprar.reseller_init_failed", tenantId },
      "init de recompra (revenda) falhou",
    )
    if (createdEnrollmentId) {
      await prisma.enrollment
        .delete({ where: { id: createdEnrollmentId } })
        .catch(swallow("aluno.comprar.reseller.rollback"))
    }
    if (consumedCouponId) {
      await releaseCoupon(consumedCouponId).catch(swallow("aluno.comprar.reseller.rollback"))
    }
    return NextResponse.json(
      { error: "Erro ao iniciar compra", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
}


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

  // Detecção PMB vs revenda por IDENTIFICAÇÃO POSITIVA do tenant AUTORITATIVO do
  // aluno (Student.tenantId no banco) — NUNCA pelo claim do JWT. Antes a decisão
  // usava o sinal NEGATIVO `!session.tenantId`: um aluno de revenda cujo token
  // chegasse sem tenantId colapsava no ramo PMB e a venda caía na conta Asaas da
  // PMB (vazamento de receita — caso Polo Betim et al.). `Student.tenantId` é NOT
  // NULL; o aluno PMB aponta para o placeholder `__pmb__`. Aluno de revenda SEMPRE
  // recompra na conta da própria unidade (preço/gateway/cupom/matrícula escopados).
  const studentRecord = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: {
      id: true,
      // Dados do comprador usados no ramo PMB abaixo — selecionados já aqui para
      // não repetir um segundo student.findUnique da MESMA linha por checkout.
      nome: true,
      email: true,
      cpf: true,
      fone: true,
      asaasCustomerId: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          mpAccessToken: true,
          mpPublicKey: true,
          plataformaVendedorId: true,
          salesGateway: true,
          asaasGatewayEnabled: true,
          asaasConnected: true,
          asaasWebhookToken: true,
          monthlyAllowed: true,
          monthlyEnabled: true,
          monthlyScope: true,
        },
      },
    },
  })
  const studentTenant = studentRecord?.tenant ?? null
  if (!studentRecord || !studentTenant) {
    // Student.tenantId é NOT NULL; ausência aqui = aluno inexistente.
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  if (!isPmbTenantSlug(studentTenant.slug)) {
    return handleResellerInit(
      studentTenant.id,
      session.studentId,
      studentTenant,
      parsed.data,
    )
  }

  // Defesa em profundidade: daqui em diante é a venda direta PMB (conta Asaas/MP
  // do sistema mãe). Confirma que o aluno é realmente PMB (placeholder __pmb__) —
  // uma venda de revenda jamais pode cobrar na conta-mãe.
  assertPmbCharge({
    enrollmentTenantId: null,
    studentTenantSlug: studentTenant.slug,
    context: "aluno.comprar.pmb",
  })

  const settings = await getSystemSettings()
  const gateway = settings.pmbDirectSaleGateway

  // `studentRecord` (já lido acima para o roteamento) traz os dados do comprador;
  // reaproveita em vez de reconsultar a mesma linha.
  const student = studentRecord
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
    // Cupom PMB tem tenantId=null, como a matrícula PMB. Bloqueia cupom de
    // revenda (tenantId != null) aplicado a uma venda PMB.
    assertCouponMatchesEnrollment({
      couponTenantId: coupon.tenantId,
      enrollmentTenantId: null,
      context: "aluno.comprar.pmb.coupon",
    })
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

  // ── Cupom cobriu 100% ──────────────────────────────────────────────────────
  // Gateway recusa R$ 0: libera o acesso na hora, sem cobrança. O rollback é
  // obrigatório: sem ele, uma falha da plataforma de aulas deixaria exatamente
  // o estado que este guard existe para evitar — matrícula PENDING de R$ 0 com
  // o cupom consumido, travando o aluno em "cobrança pendente" nas retentativas.
  if (isFreeAmount(finalAmount)) {
    try {
      const pmbTenant = await getOrCreatePmbTenant()
      await releaseFreeEnrollment(pmbTenantContext(pmbTenant), enrollment.id)
    } catch (err) {
      await prisma.enrollment
        .delete({ where: { id: enrollment.id } })
        .catch(swallow("aluno.comprar.free_rollback"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("aluno.comprar.free_rollback"))
      contextLogger().error(
        { err, event: "aluno.comprar.free_failed", enrollmentId: enrollment.id },
        "liberacao de compra com desconto integral falhou",
      )
      return NextResponse.json(
        { error: "Falha ao liberar o curso. Tente novamente." },
        { status: 502 },
      )
    }
    return NextResponse.json({
      data: { enrollmentId: enrollment.id, free: true },
    })
  }

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
        notificationUrl: asaasWebhookUrl(),
      }, motherAsaasKey())

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
