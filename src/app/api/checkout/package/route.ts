import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  findOrCreateAsaasCustomer,
  createPayment as createAsaasPayment,
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
import { clientIp } from "@/lib/http/client-ip"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { asaasWebhookUrl, isPmbAppHost } from "@/lib/tenant/urls"
import { getPackageForCheckout } from "@/lib/packages/vitrine"

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
  packageId: z.string().min(1),
  couponCode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : undefined)),
  nome: z.string().trim().min(3).max(160),
  email: z.string().email().toLowerCase().trim(),
  cpf: z.string().trim().refine(isValidCpf, "CPF inválido").transform(stripCpf),
  fone: z
    .string()
    .trim()
    .refine(isValidPhone, "Telefone inválido")
    .transform(normalizePhone),
  endereco: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]).optional(),
  creditCard: creditCardSchema.optional(),
  creditCardHolder: creditCardHolderSchema.optional(),
  acceptedTerms: z.literal(true, {
    message: "É necessário aceitar os Termos de Uso e a Política de Privacidade",
  }),
})

type ParsedBody = z.infer<typeof bodySchema>

export const POST = withRequestContext(
  { action: "pmb.checkout.package.start", route: "/api/checkout/package" },
  async (request: Request) => {
    if (!isPmbAppHost(request.headers.get("host"))) {
      return NextResponse.json(
        { error: "Checkout indisponível neste domínio", code: "WRONG_HOST" },
        { status: 404 },
      )
    }

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
    let consumedCouponId: string | null = null
    let createdEnrollmentId: string | null = null

    try {
      const settings = await getSystemSettings()
      const gateway = settings.pmbDirectSaleGateway

      if (gateway === "MP") {
        const token = await pmbMpAccessToken()
        if (!token || !pmbMpPublicKey()) {
          return NextResponse.json(
            { error: "Pagamento PMB ainda não configurado", code: "MP_NOT_CONFIGURED" },
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
            { error: `Asaas não configurado: faltam ${missing.join(", ")}`, code: "ASAAS_NOT_CONFIGURED" },
            { status: 503 },
          )
        }
      }

      if (gateway === "ASAAS" && data.paymentMethod === "CREDIT_CARD") {
        if (!data.creditCard || !data.creditCardHolder) {
          return NextResponse.json(
            { error: "Dados do cartão obrigatórios", code: "CREDIT_CARD_REQUIRED" },
            { status: 400 },
          )
        }
      }

      const pkg = await getPackageForCheckout(null, data.packageId)
      if (!pkg) {
        return NextResponse.json(
          { error: "Pacote não disponível", code: "PACKAGE_NOT_FOUND" },
          { status: 404 },
        )
      }

      const basePrice = pkg.price
      const primaryCourse = pkg.courses[0]
      const pmbTenant = await getOrCreatePmbTenant()

      const student = await upsertStudent({
        tenantId: pmbTenant.id,
        nome: data.nome,
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
          { err, event: "pmb_pkg_checkout.provision_access_failed", studentId: student.id },
          "provisionStudentAccess falhou",
        )
      })

      // Matrícula primária existente para ESTE pacote.
      const existing = await prisma.enrollment.findFirst({
        where: {
          studentId: student.id,
          coursePackageId: pkg.id,
          packagePrimary: true,
          tenantId: null,
          status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
        },
        select: { id: true, status: true, couponId: true },
      })
      if (existing) {
        if (existing.status !== "PENDING") {
          return NextResponse.json(
            { error: "Você já possui este pacote", code: "DUPLICATE_PACKAGE" },
            { status: 409 },
          )
        }
        // PENDING: troca de forma de pagamento — libera cupom e remove a órfã.
        if (existing.couponId) {
          await releaseCoupon(existing.couponId).catch(swallow("pmb-pkg.switch.release_coupon"))
        }
        await prisma.enrollment
          .delete({ where: { id: existing.id } })
          .catch(swallow("pmb-pkg.switch.delete_enrollment"))
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
          courseId: primaryCourse.id,
          coursePackageId: pkg.id,
          packagePrimary: true,
          paymentType: "ONE_TIME",
          status: "PENDING",
          gateway,
          originalAmount: basePrice,
          discountAmount,
          finalAmount,
          couponId,
          installmentsTotal: null,
          externalReference: "",
        },
        select: { id: true },
      })
      createdEnrollmentId = enrollment.id
      const externalReference = `pmb_enr_${enrollment.id}`

      // ── MP (Checkout Transparente) — cobrança em /api/checkout/mp/process ──
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

      // ── ASAAS (checkout transparente, ONE_TIME) ──
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

        const payment = await createAsaasPayment({
          customer: customer.id,
          billingType,
          value: finalAmount,
          dueDate: dueDateInDays(3),
          description: `Pacote: ${pkg.name}`,
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
            remoteIp: clientIp(request),
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
          .catch(swallow("pmb-pkg-checkout"))
        if (consumedCouponId) {
          await releaseCoupon(consumedCouponId).catch(swallow("pmb-pkg-checkout"))
        }
        const message =
          error instanceof AsaasApiError ? error.message : "Falha ao gerar cobrança no Asaas"
        return NextResponse.json({ error: message, code: "ASAAS_ERROR" }, { status: 502 })
      }
    } catch (error) {
      contextLogger().error(
        { err: error, event: "pmb_pkg_checkout.failed" },
        "pmb package checkout falhou",
      )
      if (createdEnrollmentId) {
        await prisma.enrollment
          .delete({ where: { id: createdEnrollmentId } })
          .catch(swallow("pmb-pkg-checkout.cleanup"))
      }
      if (consumedCouponId) {
        await releaseCoupon(consumedCouponId).catch(swallow("pmb-pkg-checkout"))
      }
      if (error instanceof AsaasApiError) {
        return NextResponse.json(
          { error: error.message, code: "ASAAS_ERROR", details: error.errors },
          { status: 502 },
        )
      }
      if (error instanceof StudentEmailConflictError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 409 },
        )
      }
      const message = error instanceof Error ? error.message : "Erro ao processar checkout"
      return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 })
    }
  },
)
