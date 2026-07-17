import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { AsaasApiError } from "@/lib/asaas/client"
import { issuePmbAsaasCharge } from "@/lib/checkout/issue-pmb-asaas-charge"
import {
  pmbMaxBoletoInstallments,
  pmbMaxCardInstallments,
} from "@/lib/installments/pmb-rules"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { assertCouponMatchesEnrollment } from "@/lib/checkout/assert-tenant-gateway"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
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
import { cpfHasRegisteredLogin } from "@/lib/students/cpf-already-registered"
import { provisionStudentAccess } from "@/lib/students/access"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { clientIp } from "@/lib/http/client-ip"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { isPmbAppHost } from "@/lib/tenant/urls"
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
  // Parcelamento (gateway Asaas): mesmas regras do checkout de curso — boleto
  // R$50 mín/6 máx; cartão teto do admin. Validado contra o finalAmount do
  // servidor mais adiante.
  installments: z.number().int().min(1).max(12).optional(),
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

      // Gate de CPF — mesma regra do checkout avulso: CPF com login já definido
      // nesta vitrine não compra como convidado; precisa logar. Ver
      // cpf-already-registered.ts.
      if (await cpfHasRegisteredLogin(pmbTenant.id, data.cpf)) {
        return NextResponse.json(
          {
            error: "Este CPF já possui cadastro. Faça login para concluir a compra.",
            code: "CPF_ALREADY_REGISTERED",
            loginUrl: "/login",
          },
          { status: 409 },
        )
      }

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
        // Venda PMB: cupom e matrícula têm tenantId=null. Bloqueia cupom de
        // revenda (tenantId != null) aplicado a um pacote do sistema mãe.
        assertCouponMatchesEnrollment({
          couponTenantId: coupon.tenantId,
          enrollmentTenantId: null,
          context: "pmb.checkout.package.coupon",
        })
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

      // ── Validação do parcelamento (mesmas regras do checkout de curso),
      // contra o finalAmount do SERVIDOR. Falhou → libera o cupom e 400.
      const installmentsChosen = data.installments ?? 1
      if (installmentsChosen > 1) {
        const rejectInstallments = async (message: string, code: string) => {
          if (consumedCouponId) {
            await releaseCoupon(consumedCouponId).catch(swallow("pmb-pkg-checkout"))
          }
          return NextResponse.json({ error: message, code }, { status: 400 })
        }
        if (gateway !== "ASAAS") {
          return rejectInstallments(
            "Parcelamento indisponível neste gateway",
            "INSTALLMENTS_UNSUPPORTED",
          )
        }
        if (data.paymentMethod === "BOLETO") {
          const cap = pmbMaxBoletoInstallments(finalAmount)
          if (installmentsChosen > cap) {
            return rejectInstallments(
              cap > 1
                ? `Para este valor, o boleto pode ser parcelado em até ${cap}x (parcela mínima de R$ 50).`
                : "Este valor não permite parcelamento no boleto (parcela mínima de R$ 50).",
              "INSTALLMENTS_INVALID",
            )
          }
        } else if (data.paymentMethod === "CREDIT_CARD") {
          const cap = pmbMaxCardInstallments(finalAmount)
          if (installmentsChosen > cap) {
            return rejectInstallments(
              `Para este valor, o cartão pode ser parcelado em até ${cap}x.`,
              "INSTALLMENTS_INVALID",
            )
          }
        } else {
          return rejectInstallments(
            "Parcelamento disponível apenas no cartão de crédito ou boleto",
            "INSTALLMENTS_INVALID",
          )
        }
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
      // Cobrança compartilhada com o checkout de curso (issuePmbAsaasCharge):
      // PIX/boleto/cartão à vista e PARCELADO (cartão via /installments/,
      // boleto via carnê) — pacotes são sempre one-time.
      const billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED" =
        data.paymentMethod ?? "UNDEFINED"

      try {
        const result = await issuePmbAsaasCharge({
          enrollmentId: enrollment.id,
          externalReference,
          student: {
            id: student.id,
            nome: student.nome,
            email: student.email ?? data.email,
            cpf: data.cpf,
            fone: student.fone ?? data.fone,
            asaasCustomerId: student.asaasCustomerId,
          },
          courseNome: primaryCourse.nome,
          description: `Pacote: ${pkg.name}`,
          finalAmount,
          isMonthly: false,
          monthlyMonths: null,
          billingType,
          installments: installmentsChosen,
          creditCard: data.creditCard,
          creditCardHolder: data.creditCardHolder,
          remoteIp: clientIp(request),
        })

        return NextResponse.json({
          data: { enrollmentId: enrollment.id, gateway: "ASAAS", ...result },
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
