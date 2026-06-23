import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
import { cpfHasRegisteredLogin } from "@/lib/students/cpf-already-registered"
import { provisionStudentAccess } from "@/lib/students/access"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { upsertLeadFromCheckout } from "@/lib/automation/leads"
import { readVisitorId } from "@/lib/automation/tracking"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { tenantPolo } from "@/lib/tenant/slug"
import { getPackageForCheckout } from "@/lib/packages/vitrine"

// Checkout de PACOTE na vitrine da revenda. Pagamento à vista (ONE_TIME). Cria a
// matrícula PRIMÁRIA (packagePrimary=true) que carrega o pagamento do valor cheio
// do pacote; as matrículas satélite (demais cursos) nascem no fulfill. O brick
// (MpCheckoutForm/AsaasCheckoutForm) e o /process são reutilizados — esta rota só
// substitui a resolução de curso por pacote e devolve o mesmo shape.
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
  acceptedTerms: z.literal(true, {
    message: "É necessário aceitar os Termos de Uso e a Política de Privacidade",
  }),
})

type ParsedBody = z.infer<typeof bodySchema>

export const POST = withRequestContext(
  { action: "loja.checkout.package.start", route: "/api/loja/checkout/package" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)

    const tenantIdHeader = request.headers.get("x-tenant-id")
    const tenantSlug = request.headers.get("x-tenant-slug")

    let tenantId: string
    if (tenantIdHeader) {
      tenantId = tenantIdHeader
    } else if (tenantSlug) {
      const resolved = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      })
      if (!resolved) {
        return NextResponse.json(
          { error: "Tenant inválido", code: "TENANT_INVALID" },
          { status: 404 },
        )
      }
      tenantId = resolved.id
    } else {
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
    let consumedCouponId: string | null = null
    let createdEnrollmentId: string | null = null

    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          slug: true,
          poloName: true,
          name: true,
          status: true,
          mpAccessToken: true,
          mpPublicKey: true,
          plataformaVendedorId: true,
          automationEnabled: true,
          salesGateway: true,
          asaasGatewayEnabled: true,
          asaasConnected: true,
          asaasWebhookToken: true,
        },
      })

      if (!tenant) {
        return NextResponse.json(
          { error: "Tenant inválido", code: "TENANT_INVALID" },
          { status: 404 },
        )
      }
      if (tenant.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Esta loja não está aceitando vendas no momento", code: "TENANT_INACTIVE" },
          { status: 403 },
        )
      }

      const pkg = await getPackageForCheckout(tenantId, data.packageId)
      if (!pkg) {
        return NextResponse.json(
          { error: "Pacote não encontrado", code: "PACKAGE_NOT_FOUND" },
          { status: 404 },
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

      const basePrice = pkg.price
      const primaryCourse = pkg.courses[0]

      // Gate de CPF — mesma regra do checkout avulso: CPF com login já definido
      // nesta loja não compra como convidado; precisa logar (recompra
      // autenticada usa /api/aluno/comprar). Antes do consumo de cupom para não
      // reservar um uso à toa. Ver cpf-already-registered.ts.
      if (await cpfHasRegisteredLogin(tenantId, data.cpf)) {
        return NextResponse.json(
          {
            error: "Este CPF já possui cadastro. Faça login para concluir a compra.",
            code: "CPF_ALREADY_REGISTERED",
            loginUrl: "/login",
          },
          { status: 409 },
        )
      }

      let discountAmount = 0
      let couponId: string | null = null
      let finalAmount = basePrice
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
        const calc = applyCouponDiscount({
          basePrice,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
        })
        discountAmount = calc.discountAmount
        finalAmount = calc.finalAmount
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

      const student = await upsertStudent({
        tenantId,
        nome: data.nome,
        email: data.email,
        cpf: data.cpf,
        fone: data.fone,
        endereco: data.endereco,
        polo: tenantPolo(tenant),
        vendedorId: tenant.plataformaVendedorId,
        plataformaAlunoIdFallback: `pending_${Date.now()}`,
      })

      await provisionStudentAccess(student.id, {
        isPmbVitrine: false,
        slug: tenant.slug,
        name: tenant.name,
      }).catch((err) => {
        contextLogger().error(
          { err, event: "loja_pkg_checkout.provision_access_failed", studentId: student.id },
          "provisionStudentAccess falhou",
        )
      })

      // Matrícula primária existente para ESTE pacote (reaproveita PENDING, bloqueia ATIVO).
      const existing = await prisma.enrollment.findFirst({
        where: {
          studentId: student.id,
          coursePackageId: pkg.id,
          packagePrimary: true,
          tenantId,
          status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
        },
        select: { id: true, status: true, couponId: true, finalAmount: true },
      })
      if (existing && existing.status !== "PENDING") {
        if (consumedCouponId) {
          await releaseCoupon(consumedCouponId).catch(swallow("loja.pkg.checkout"))
          consumedCouponId = null
        }
        return NextResponse.json(
          { error: "Você já possui este pacote", code: "DUPLICATE_PACKAGE" },
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
          await releaseCoupon(consumedCouponId).catch(swallow("loja.pkg.checkout"))
          consumedCouponId = null
        }
        return NextResponse.json({
          data: {
            enrollmentId: existing.id,
            mode: "one_time",
            gateway,
            amount: reusedAmount,
            publicKey: tenant.mpPublicKey,
            payerEmail: student.email ?? data.email,
            maxInstallments: 1,
            installmentsTotal: null,
          },
        })
      }

      const enrollment = await prisma.enrollment.create({
        data: {
          tenantId,
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

      const externalReference = `enr_${enrollment.id}`
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { externalReference },
      })

      if (tenant.automationEnabled) {
        upsertLeadFromCheckout({
          tenantId,
          enrollmentId: enrollment.id,
          nome: data.nome,
          email: data.email,
          telefone: data.fone,
          courseId: primaryCourse.id,
          courseSnapshot: `Pacote: ${pkg.name}`,
          visitorId: readVisitorId(request),
        }).catch(swallow("loja_pkg_checkout.lead_link"))
      }

      return NextResponse.json({
        data: {
          enrollmentId: enrollment.id,
          mode: "one_time",
          gateway,
          amount: finalAmount,
          publicKey: tenant.mpPublicKey,
          payerEmail: student.email ?? data.email,
          maxInstallments: 1,
          installmentsTotal: null,
        },
      })
    } catch (error) {
      contextLogger().error(
        { err: error, event: "loja_pkg_checkout.failed" },
        "loja package checkout falhou",
      )
      if (createdEnrollmentId) {
        await prisma.enrollment
          .delete({ where: { id: createdEnrollmentId } })
          .catch(swallow("loja.pkg.checkout.rollback"))
      }
      if (consumedCouponId) {
        await releaseCoupon(consumedCouponId).catch(swallow("loja.pkg.checkout"))
      }
      if (error instanceof StudentEmailConflictError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: "Erro ao processar checkout", code: "INTERNAL_ERROR" },
        { status: 500 },
      )
    }
  },
)
