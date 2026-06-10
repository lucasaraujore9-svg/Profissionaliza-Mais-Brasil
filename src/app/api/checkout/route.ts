import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  findOrCreateAsaasCustomer,
  createPayment as createAsaasPayment,
  createSubscription as createAsaasSubscription,
  listPayments as listAsaasPayments,
  deletePayment as deleteAsaasPayment,
  cancelSubscription as cancelAsaasSubscription,
  getPixQrCode,
  getBillingInfo,
  payWithCreditCard,
  AsaasApiError,
} from "@/lib/asaas/client"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { dueDateInDays } from "@/lib/checkout/due-date"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import {
  pmbPlataformaPolo,
  pmbPlataformaVendedorId,
  pmbMpAccessToken,
  pmbMpPublicKey,
} from "@/lib/pmb-config"
import { getSystemSettings } from "@/lib/system-settings"
import { swallow } from "@/lib/errors"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
import { provisionStudentAccess } from "@/lib/students/access"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { upsertLeadFromCheckout } from "@/lib/automation/leads"
import { readVisitorId } from "@/lib/automation/tracking"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { asaasWebhookUrl } from "@/lib/tenant/urls"

// Cartão: aceitamos número com espaços, validade MM/AA ou MM/AAAA, CCV 3-4 dígitos.
const creditCardSchema = z.object({
  holderName: z.string().trim().min(3).max(160),
  number: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 13 && v.length <= 19, "Número do cartão inválido"),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, "Mês inválido"),
  expiryYear: z
    .string()
    .regex(/^\d{2}(\d{2})?$/, "Ano inválido")
    .transform((v) => (v.length === 2 ? `20${v}` : v)),
  ccv: z.string().regex(/^\d{3,4}$/, "CCV inválido"),
})

const creditCardHolderSchema = z.object({
  postalCode: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 8, "CEP inválido"),
  addressNumber: z.string().trim().min(1).max(20),
  addressComplement: z.string().trim().max(60).optional(),
})

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
    .refine(isValidCpf, "CPF inválido")
    .transform(stripCpf),
  fone: z
    .string()
    .trim()
    .refine(isValidPhone, "Telefone inválido")
    .transform(normalizePhone),
  endereco: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]).optional(),
  creditCard: creditCardSchema.optional(),
  creditCardHolder: creditCardHolderSchema.optional(),
  // Aceite obrigatório dos Termos de Uso e da Política de Privacidade — reforço
  // server-side do gate do checkout (o form já bloqueia, mas garantimos aqui
  // que nenhuma venda é concluída sem o aceite registrado).
  acceptedTerms: z.literal(true, {
    message: "É necessário aceitar os Termos de Uso e a Política de Privacidade",
  }),
})

type ParsedBody = z.infer<typeof bodySchema>

function normalize(s: string): string {
  return s.trim()
}

export const POST = withRequestContext(
  { action: "pmb.checkout.start", route: "/api/checkout" },
  async (request: Request) => {
  // Rate-limit anti-flood: a vitrine PMB é pública e cria cobranças Asaas/MP.
  // Mesmo bucket de /api/loja/checkout — bots não conseguem gerar cobranças em massa.
  const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
  if (!rl.ok) return rateLimitResponse(rl)

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

  // Trackeia cupom consumido p/ liberar em caso de falha no fluxo.
  let consumedCouponId: string | null = null
  // Trackeia enrollment criado p/ deletar em caso de falha (evita órfão que
  // bloqueia recompra com 409 DUPLICATE_ENROLLMENT). O branch Asaas já limpa
  // no seu catch interno; aqui cobrimos também a falha do branch MP.
  let createdEnrollmentId: string | null = null

  try {
    const settings = await getSystemSettings()
    const gateway = settings.pmbDirectSaleGateway

    // Pré-check do gateway escolhido — falha cedo se faltam credenciais.
    if (gateway === "MP") {
      const token = await pmbMpAccessToken()
      // Checkout transparente do MP precisa da public key (monta o form de
      // cartão no browser), além do access token.
      if (!token || !pmbMpPublicKey()) {
        return NextResponse.json(
          {
            error: "Pagamento PMB ainda não configurado",
            code: "MP_NOT_CONFIGURED",
          },
          { status: 503 },
        )
      }
    } else {
      const missing = [
        !process.env.ASAAS_API_URL && "ASAAS_API_URL",
        !process.env.ASAAS_API_KEY && "ASAAS_API_KEY",
      ].filter(Boolean) as string[]
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Asaas não configurado: faltam ${missing.join(", ")}`,
            code: "ASAAS_NOT_CONFIGURED",
          },
          { status: 503 },
        )
      }
    }

    // Validações específicas de método (apenas Asaas suporta transparente).
    if (gateway === "ASAAS" && data.paymentMethod === "CREDIT_CARD") {
      if (!data.creditCard || !data.creditCardHolder) {
        return NextResponse.json(
          {
            error: "Dados do cartão obrigatórios",
            code: "CREDIT_CARD_REQUIRED",
          },
          { status: 400 },
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
        monthlyMonthsMain: true,
      },
    })

    if (!course || course.status !== "ATIVO" || course.hiddenMain) {
      return NextResponse.json(
        { error: "Curso não disponível", code: "COURSE_NOT_FOUND" },
        { status: 404 },
      )
    }

    const isMonthly = course.paymentTypeMain === "MONTHLY"
    const monthlyMonths = isMonthly ? course.monthlyMonthsMain ?? 12 : null

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

    const pmbTenant = await getOrCreatePmbTenant()

    const student = await upsertStudent({
      tenantId: pmbTenant.id,
      nome: normalize(data.nome),
      email: data.email,
      cpf: data.cpf,
      fone: data.fone,
      endereco: data.endereco,
      polo: pmbPlataformaPolo(),
      vendedorId: pmbPlataformaVendedorId(),
      plataformaAlunoIdFallback: `pending_${Date.now()}`,
    })

    await provisionStudentAccess(student.id, {
      isPmbVitrine: true,
      slug: pmbTenant.slug,
    }).catch((err) => {
      contextLogger().error(
        { err, event: "pmb_checkout.provision_access_failed", studentId: student.id },
        "provisionStudentAccess falhou",
      )
    })

    // Detecta matrícula existente ANTES de consumir o cupom — assim, ao trocar
    // de forma de pagamento, o cupom reservado pela cobrança anterior é
    // liberado antes de o novo consumo acontecer (senão a troca com cupom de
    // uso único cairia em COUPON_EXHAUSTED).
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: course.id,
        tenantId: null,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: {
        id: true,
        status: true,
        couponId: true,
        gateway: true,
        asaasPaymentId: true,
        asaasSubscriptionId: true,
      },
    })
    if (existingEnrollment) {
      // ACTIVE/COMPLETED: o aluno já comprou o curso — bloqueia de fato.
      if (existingEnrollment.status !== "PENDING") {
        return NextResponse.json(
          { error: "Você já possui este curso", code: "DUPLICATE_ENROLLMENT" },
          { status: 409 },
        )
      }
      // PENDING: o aluno está trocando de forma de pagamento (ex.: gerou um PIX
      // e agora quer pagar no cartão). Antes isto retornava 409 e travava a
      // troca. Cancelamos a cobrança anterior no Asaas pra não deixar duas
      // cobranças em aberto, liberamos o cupom reservado e removemos a
      // enrollment órfã — o fluxo abaixo recria tudo com o novo método.
      if (existingEnrollment.gateway === "ASAAS") {
        if (existingEnrollment.asaasSubscriptionId) {
          await cancelAsaasSubscription(
            existingEnrollment.asaasSubscriptionId,
          ).catch(swallow("pmb-checkout.switch.cancel_subscription"))
        }
        if (existingEnrollment.asaasPaymentId) {
          await deleteAsaasPayment(existingEnrollment.asaasPaymentId).catch(
            swallow("pmb-checkout.switch.delete_payment"),
          )
        }
      }
      if (existingEnrollment.couponId) {
        await releaseCoupon(existingEnrollment.couponId).catch(
          swallow("pmb-checkout.switch.release_coupon"),
        )
      }
      await prisma.enrollment
        .delete({ where: { id: existingEnrollment.id } })
        .catch(swallow("pmb-checkout.switch.delete_enrollment"))
    }

    let discountAmount = 0
    let finalAmount = basePrice
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

      // Cálculo unificado em Prisma.Decimal (mesmo helper das outras rotas) —
      // evita divergência de centavos entre o valor cobrado e os relatórios.
      const applied = applyCouponDiscount({
        basePrice,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      })
      discountAmount = applied.discountAmount
      finalAmount = applied.finalAmount
      const reserved = await tryConsumeCoupon(coupon.id)
      if (!reserved) {
        return NextResponse.json(
          { error: "Cupom esgotado", code: "COUPON_EXHAUSTED" },
          { status: 400 },
        )
      }
      couponId = coupon.id
      consumedCouponId = coupon.id
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
        installmentsTotal: monthlyMonths,
      },
      select: { id: true },
    })
    createdEnrollmentId = enrollment.id

    // Modulo Automacao PMB: gera StudentLead com stage=CHECKOUT_STARTED.
    // Cron sweep-abandoned-leads move pra ABANDONED apos N horas; webhook
    // MP move pra WON quando aprovado.
    const pmbSettings = await prisma.systemSettings
      .findUnique({
        where: { id: "default" },
        select: { pmbAutomationEnabled: true },
      })
      .catch(() => null)
    if (pmbSettings?.pmbAutomationEnabled) {
      upsertLeadFromCheckout({
        tenantId: null,
        enrollmentId: enrollment.id,
        nome: normalize(data.nome),
        email: data.email,
        telefone: data.fone,
        courseId: course.id,
        courseSnapshot: course.nome,
        visitorId: readVisitorId(request),
      }).catch(swallow("pmb_checkout.lead_link"))
    }

    const externalReference = `pmb_enr_${enrollment.id}`

    // ── MP (Checkout Transparente) ────────────────────────────────────────
    // Não criamos preference aqui: apenas marcamos a external_reference e
    // devolvemos os dados para o form montar o checkout (cartão/PIX/boleto) na
    // própria tela. A cobrança acontece em POST /api/checkout/mp/process.
    if (gateway === "MP") {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { externalReference },
      })

      return NextResponse.json({
        data: {
          enrollmentId: enrollment.id,
          gateway: "MP",
          mode: "mp_transparent",
          payerEmail: student.email ?? data.email,
        },
      })
    }

    // ── ASAAS (checkout transparente) ─────────────────────────────────────
    // billingType: o que será enviado ao Asaas. UNDEFINED = link checkout
    // (compat com clientes antigos que não enviam paymentMethod).
    const billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED" =
      data.paymentMethod ?? "UNDEFINED"

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

      // ──── MONTHLY ────
      if (isMonthly && monthlyMonths) {
        const subscription = await createAsaasSubscription({
          customer: customer.id,
          billingType,
          value: finalAmount,
          nextDueDate: dueDateInDays(3),
          cycle: "MONTHLY",
          description: `Mensalidade — ${course.nome}`,
          externalReference,
          maxPayments: monthlyMonths,
          notificationUrl: asaasWebhookUrl(),
        })

        // Asaas gera as cobranças async; busca a 1a invoice em até 3 tentativas
        let firstPayment: { id: string; invoiceUrl: string; bankSlipUrl: string | null } | null = null
        for (let i = 0; i < 3; i++) {
          const list = await listAsaasPayments({
            subscription: subscription.id,
            limit: 1,
            offset: 0,
          }).catch(() => null)
          const first = list?.data?.[0]
          if (first) {
            firstPayment = {
              id: first.id,
              invoiceUrl: first.invoiceUrl,
              bankSlipUrl: first.bankSlipUrl,
            }
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
            asaasPaymentId: firstPayment?.id ?? null,
            asaasInvoiceUrl: firstPayment?.invoiceUrl ?? null,
          },
        })

        // Cartão de crédito recorrente: cobra a 1ª parcela transparente
        // (gera creditCardToken que o Asaas associa à subscription).
        if (billingType === "CREDIT_CARD" && firstPayment && data.creditCard && data.creditCardHolder) {
          const result = await payWithCreditCard(firstPayment.id, {
            creditCard: data.creditCard,
            creditCardHolderInfo: {
              name: student.nome,
              email: student.email ?? data.email,
              cpfCnpj: data.cpf,
              postalCode: data.creditCardHolder.postalCode,
              addressNumber: data.creditCardHolder.addressNumber,
              addressComplement: data.creditCardHolder.addressComplement,
              phone: (student.fone ?? data.fone).replace(/\D/g, ""),
              mobilePhone: (student.fone ?? data.fone).replace(/\D/g, ""),
            },
          })
          return NextResponse.json({
            data: {
              enrollmentId: enrollment.id,
              gateway: "ASAAS",
              mode: "credit_card_result",
              status: result.status, // CONFIRMED | RECEIVED | etc.
              paymentId: result.id,
            },
          })
        }

        if (billingType === "PIX" && firstPayment) {
          const qr = await getPixQrCode(firstPayment.id).catch(() => null)
          return NextResponse.json({
            data: {
              enrollmentId: enrollment.id,
              gateway: "ASAAS",
              mode: "pix",
              paymentId: firstPayment.id,
              pix: qr,
            },
          })
        }

        if (billingType === "BOLETO" && firstPayment) {
          const billing = await getBillingInfo(firstPayment.id).catch(() => null)
          return NextResponse.json({
            data: {
              enrollmentId: enrollment.id,
              gateway: "ASAAS",
              mode: "boleto",
              paymentId: firstPayment.id,
              bankSlipUrl: firstPayment.bankSlipUrl ?? billing?.bankSlip?.bankSlipUrl ?? null,
              identificationField: billing?.bankSlip?.identificationField ?? null,
              barCode: billing?.bankSlip?.barCode ?? null,
            },
          })
        }

        // Fallback: link de checkout Asaas (UNDEFINED ou sem 1ª invoice)
        return NextResponse.json({
          data: {
            enrollmentId: enrollment.id,
            gateway: "ASAAS",
            mode: "redirect",
            initPoint: firstPayment?.invoiceUrl ?? null,
          },
        })
      }

      // ──── ONE_TIME ────
      const payment = await createAsaasPayment({
        customer: customer.id,
        billingType,
        value: finalAmount,
        dueDate: dueDateInDays(3),
        description: `Curso: ${course.nome}`,
        externalReference,
        notificationUrl: asaasWebhookUrl(),
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

      if (billingType === "CREDIT_CARD" && data.creditCard && data.creditCardHolder) {
        const result = await payWithCreditCard(payment.id, {
          creditCard: data.creditCard,
          creditCardHolderInfo: {
            name: student.nome,
            email: student.email ?? data.email,
            cpfCnpj: data.cpf,
            postalCode: data.creditCardHolder.postalCode,
            addressNumber: data.creditCardHolder.addressNumber,
            addressComplement: data.creditCardHolder.addressComplement,
            phone: (student.fone ?? data.fone).replace(/\D/g, ""),
            mobilePhone: (student.fone ?? data.fone).replace(/\D/g, ""),
          },
        })
        return NextResponse.json({
          data: {
            enrollmentId: enrollment.id,
            gateway: "ASAAS",
            mode: "credit_card_result",
            status: result.status,
            paymentId: result.id,
          },
        })
      }

      if (billingType === "PIX") {
        const qr = await getPixQrCode(payment.id).catch(() => null)
        return NextResponse.json({
          data: {
            enrollmentId: enrollment.id,
            gateway: "ASAAS",
            mode: "pix",
            paymentId: payment.id,
            pix: qr,
          },
        })
      }

      if (billingType === "BOLETO") {
        const billing = await getBillingInfo(payment.id).catch(() => null)
        return NextResponse.json({
          data: {
            enrollmentId: enrollment.id,
            gateway: "ASAAS",
            mode: "boleto",
            paymentId: payment.id,
            bankSlipUrl: payment.bankSlipUrl ?? billing?.bankSlip?.bankSlipUrl ?? null,
            identificationField: billing?.bankSlip?.identificationField ?? null,
            barCode: billing?.bankSlip?.barCode ?? null,
          },
        })
      }

      // billingType === "UNDEFINED" → link checkout Asaas
      return NextResponse.json({
        data: {
          enrollmentId: enrollment.id,
          gateway: "ASAAS",
          mode: "redirect",
          initPoint: payment.invoiceUrl,
        },
      })
    } catch (error) {
      await prisma.enrollment
        .delete({ where: { id: enrollment.id } })
        .catch(swallow("pmb-checkout"))
      if (consumedCouponId) {
        await releaseCoupon(consumedCouponId).catch(swallow("pmb-checkout"))
      }
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
    // Loga o erro completo pra investigação futura (Pino redacta tokens).
    contextLogger().error(
      { err: error, event: "pmb_checkout.failed" },
      "pmb-checkout falhou",
    )
    // Limpa o enrollment PENDING órfão (ex: falha ao criar preference/preapproval
    // no MP), senão o aluno fica travado em 409 DUPLICATE_ENROLLMENT pra sempre.
    if (createdEnrollmentId) {
      await prisma.enrollment
        .delete({ where: { id: createdEnrollmentId } })
        .catch(swallow("pmb-checkout.cleanup"))
    }
    if (consumedCouponId) {
      await releaseCoupon(consumedCouponId).catch(swallow("pmb-checkout"))
    }
    // Erros conhecidos da API Asaas viram resposta 502 com a mensagem real.
    if (error instanceof AsaasApiError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "ASAAS_ERROR",
          details: error.errors,
        },
        { status: 502 },
      )
    }
    // Conflito de email entre alunos: devolve 409 com mensagem clara.
    if (error instanceof StudentEmailConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      )
    }
    // Demais erros: devolve a mensagem do Error pra acelerar diagnóstico.
    const message =
      error instanceof Error ? error.message : "Erro ao processar checkout"
    return NextResponse.json(
      { error: message, code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
  },
)
