import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
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
import { effectivePaymentType } from "@/lib/tenant/monthly-policy"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"

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
  { action: "loja.checkout.start", route: "/api/loja/checkout" },
  async (request: Request) => {
  // Endpoint público — vitrine de revendedor. Sem rate-limit, atacante pode
  // disparar centenas de checkouts/seg gerando custo Resend + ruído no DB +
  // bloqueio do MP do revendedor por rate-limit upstream.
  const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
  if (!rl.ok) return rateLimitResponse(rl)

  const tenantIdHeader = request.headers.get("x-tenant-id")
  const tenantSlug = request.headers.get("x-tenant-slug")

  // O proxy só injeta x-tenant-id nos paths de vitrine (rewrite p/ /loja). Em
  // /api/loja/* chega APENAS x-tenant-slug — então resolvemos o id pelo slug.
  // Antes a rota exigia x-tenant-id e devolvia TENANT_MISSING em TODO checkout
  // de revenda (o proxy nunca seta o id aqui), bloqueando 100% das vendas via
  // vitrine. Espelha o resolveTenantFromRequest usado nas outras rotas /api/loja.
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

  // Trackeia cupom consumido + enrollment criada para limpar em caso de
  // falha no fluxo abaixo. Antes só o cupom era liberado; a enrollment
  // ficava órfã (status PENDING) e bloqueava o aluno de re-tentar
  // (cai em DUPLICATE_ENROLLMENT). Espelha o rollback das outras 3 rotas
  // de checkout (/aluno/comprar, /painel/vendas, /admin/vendas).
  let consumedCouponId: string | null = null
  let createdEnrollmentId: string | null = null

  try {
    const [tenant, tenantCourse] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          mpAccessToken: true,
          mpPublicKey: true,
          plataformaVendedorId: true,
          automationEnabled: true,
          monthlyAllowed: true,
          monthlyEnabled: true,
          monthlyScope: true,
          // Gateway de vendas da unidade (MP padrão | ASAAS quando liberado+conectado).
          salesGateway: true,
          asaasGatewayEnabled: true,
          asaasConnected: true,
          asaasWebhookToken: true,
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
              parcelasSugeridas: true,
              parcelasOverride: true,
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

    if (tenant.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: "Esta loja não está aceitando vendas no momento",
          code: "TENANT_INACTIVE",
        },
        { status: 403 },
      )
    }

    if (!tenantCourse) {
      return NextResponse.json(
        { error: "Curso não encontrado", code: "COURSE_NOT_FOUND" },
        { status: 404 },
      )
    }

    // Gateway efetivo da unidade via helper central (mesma regra das páginas
    // de vitrine): MP | ASAAS | NONE. Toda venda usa SEMPRE o gateway da própria
    // revenda — jamais o do sistema mãe.
    const mode = tenantCheckoutMode({
      salesGateway: tenant.salesGateway,
      asaasGatewayEnabled: tenant.asaasGatewayEnabled,
      asaasConnected: tenant.asaasConnected,
      mpAccessToken: tenant.mpAccessToken,
      mpPublicKey: tenant.mpPublicKey,
    })

    // Asaas precisa do token do webhook p/ validar o callback antes de cobrar.
    // O helper usa o invariante salesGateway===ASAAS ⇒ token presente; aqui
    // confirmamos de forma autoritativa.
    if (mode === "ASAAS" && !tenant.asaasWebhookToken) {
      return NextResponse.json(
        { error: "Gateway Asaas incompleto", code: "ASAAS_NOT_CONFIGURED" },
        { status: 503 },
      )
    }

    // Sem gateway próprio: a vitrine exibe o formulário de contato (e-mail p/ a
    // revenda + lead) em vez de cobrar. Não há cobrança possível aqui. 503
    // (serviço indisponível por configuração) — mesma semântica do antigo
    // MP_NOT_CONFIGURED.
    if (mode === "NONE") {
      return NextResponse.json(
        {
          error: "Loja ainda não configurou o pagamento",
          code: "CHECKOUT_UNAVAILABLE",
        },
        { status: 503 },
      )
    }

    const gateway: "MP" | "ASAAS" = mode

    const basePrice = Number(tenantCourse.price)

    let discountAmount = 0
    let couponId: string | null = null
    let finalAmountFromCoupon: number | null = null
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

      // Cálculo via helper centralizado (Prisma.Decimal) — alinha com
      // /api/aluno/comprar e /api/painel/vendas. Antes cada rota fazia
      // (basePrice * Number(val)) / 100 em float, divergindo arredondamento.
      const calc = applyCouponDiscount({
        basePrice,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      })
      discountAmount = calc.discountAmount
      finalAmountFromCoupon = calc.finalAmount

      // Reserva atômica do cupom — evita estouro de maxUses em compras concorrentes.
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

    const finalAmount = finalAmountFromCoupon ?? basePrice

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
      contextLogger().error(
        { err, event: "loja_checkout.provision_access_failed", studentId: student.id, tenantSlug: tenant.slug },
        "provisionStudentAccess falhou",
      )
    })

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: tenantCourse.courseId,
        tenantId,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: {
        id: true,
        status: true,
        couponId: true,
        finalAmount: true,
        paymentType: true,
        installmentsTotal: true,
      },
    })

    if (existingEnrollment && existingEnrollment.status !== "PENDING") {
      // Libera a reserva de cupom feita acima — sem isso o uso vazava no 409.
      if (consumedCouponId) {
        await releaseCoupon(consumedCouponId).catch(swallow("loja.checkout"))
        consumedCouponId = null
      }
      return NextResponse.json(
        { error: "Você já possui este curso", code: "DUPLICATE_ENROLLMENT" },
        { status: 409 },
      )
    }

    if (existingEnrollment) {
      // Matrícula PENDING existente (ex.: cartão recusado e página recarregada,
      // PIX gerado e abandonado): REAPROVEITA em vez de bloquear com 409.
      // Antes o aluno ficava permanentemente travado em DUPLICATE_ENROLLMENT,
      // sem conseguir tentar outro cartão ou outro método de pagamento.
      let reusedAmount = Number(existingEnrollment.finalAmount)
      if (consumedCouponId && !existingEnrollment.couponId) {
        // Cupom novo aplicado nesta tentativa — atualiza o preço da pendente.
        await prisma.enrollment.update({
          where: { id: existingEnrollment.id },
          data: {
            originalAmount: basePrice,
            discountAmount,
            finalAmount,
            couponId,
          },
        })
        reusedAmount = finalAmount
      } else if (consumedCouponId) {
        // A pendente já tem cupom — devolve a reserva para não consumir 2 usos.
        await releaseCoupon(consumedCouponId).catch(swallow("loja.checkout"))
        consumedCouponId = null
      }

      const isMonthlyReuse = existingEnrollment.paymentType === "MONTHLY"
      return NextResponse.json({
        data: {
          enrollmentId: existingEnrollment.id,
          mode: isMonthlyReuse ? "subscription" : "one_time",
          gateway,
          amount: reusedAmount,
          publicKey: tenant.mpPublicKey,
          payerEmail: student.email ?? data.email,
          maxInstallments: isMonthlyReuse
            ? 1
            : tenantCourse.customParcelas ??
              tenantCourse.course.parcelasOverride ??
              tenantCourse.course.parcelasSugeridas ??
              12,
          installmentsTotal: existingEnrollment.installmentsTotal,
        },
      })
    }

    // Tipo efetivo: se a unidade nao tem parcelado habilitado para a vitrine,
    // o curso MONTHLY cai para ONE_TIME na compra self-service do lead.
    const effectiveType = effectivePaymentType(
      tenantCourse.paymentType,
      tenant,
      "vitrine",
    )
    const isMonthly = effectiveType === "MONTHLY"
    const monthlyMonths = isMonthly
      ? tenantCourse.course.monthlyMonthsMain ?? 12
      : null

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

    if (tenant.automationEnabled) {
      upsertLeadFromCheckout({
        tenantId,
        enrollmentId: enrollment.id,
        nome: normalize(data.nome),
        email: data.email,
        telefone: data.fone,
        courseId: tenantCourse.courseId,
        courseSnapshot: tenantCourse.course.nome,
        visitorId: readVisitorId(request),
      }).catch(swallow("loja_checkout.lead_link"))
    }

    const externalReference = `enr_${enrollment.id}`

    // Checkout Transparente: NÃO criamos preference/preapproval aqui. Apenas
    // marcamos a external_reference (usada pelo webhook e pelo /process) e
    // devolvemos ao browser os dados para montar o Payment Brick. A cobrança
    // de fato acontece em POST /api/loja/checkout/process com o token do cartão
    // (ou geração de PIX/boleto) tokenizado client-side.
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { externalReference },
    })

    // Parcelas máximas oferecidas no cartão (one-time). Mensal = recorrência,
    // sempre 1 parcela por cobrança.
    const maxInstallments = isMonthly
      ? 1
      : tenantCourse.customParcelas ??
        tenantCourse.course.parcelasOverride ??
        tenantCourse.course.parcelasSugeridas ??
        12

    return NextResponse.json({
      data: {
        enrollmentId: enrollment.id,
        mode: isMonthly ? "subscription" : "one_time",
        gateway,
        amount: finalAmount,
        publicKey: tenant.mpPublicKey,
        payerEmail: student.email ?? data.email,
        maxInstallments,
        installmentsTotal: monthlyMonths,
      },
    })
  } catch (error) {
    contextLogger().error(
      { err: error, event: "loja_checkout.failed" },
      "loja checkout falhou",
    )
    // Limpa enrollment órfã — se mantida, próxima tentativa do mesmo aluno
    // cai em DUPLICATE_ENROLLMENT (409) e ele fica permanentemente bloqueado
    // do curso até intervenção manual no DB.
    if (createdEnrollmentId) {
      await prisma.enrollment
        .delete({ where: { id: createdEnrollmentId } })
        .catch(swallow("loja.checkout.rollback"))
    }
    // Libera reserva de cupom — checkout falhou, não consumimos o uso.
    if (consumedCouponId) {
      await releaseCoupon(consumedCouponId).catch(swallow("loja.checkout"))
    }
    // Conflito de email entre alunos diferentes da mesma loja — devolve 409
    // com mensagem específica em vez de 500 genérico (o aluno corrige o email
    // e refaz o checkout).
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
