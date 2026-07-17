import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  deletePayment as deleteAsaasPayment,
  cancelSubscription as cancelAsaasSubscription,
  deleteInstallment as deleteAsaasInstallment,
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import {
  pmbMaxBoletoInstallments,
  pmbMaxCardInstallments,
} from "@/lib/installments/pmb-rules"
import { issuePmbAsaasCharge } from "@/lib/checkout/issue-pmb-asaas-charge"
import { assertCouponMatchesEnrollment } from "@/lib/checkout/assert-tenant-gateway"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
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
import { upsertLeadFromCheckout } from "@/lib/automation/leads"
import { readVisitorId } from "@/lib/automation/tracking"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { isPmbAppHost } from "@/lib/tenant/urls"

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
  // Parcelamento (gateway Asaas): cartão até o teto do admin; boleto com as
  // regras parcela mínima R$50 / máx 6 boletos — validadas adiante contra o
  // finalAmount do SERVIDOR (com cupom), nunca contra o que o client exibiu.
  installments: z.number().int().min(1).max(12).optional(),
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
  // Guard de host (defesa em profundidade): este endpoint cobra na conta
  // Asaas/MP da PMB (sistema mãe). Ele só pode ser acionado a partir do domínio
  // PMB. Se a requisição chega sob o domínio de uma revenda — subdomínio ou
  // domínio próprio, p.ex. quando o proxy entra em fail-open ao não resolver o
  // custom domain por uma falha transitória — recusamos: a venda da unidade tem
  // de passar por /api/loja/checkout, com o gateway da própria revenda. Sem isso
  // o dinheiro da unidade cai no caixa da PMB.
  if (!isPmbAppHost(request.headers.get("host"))) {
    return NextResponse.json(
      { error: "Checkout indisponível neste domínio", code: "WRONG_HOST" },
      { status: 404 },
    )
  }

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

    // Gate de CPF: se este CPF já tem aluno com acesso ao painel /aluno nesta
    // vitrine, o checkout como convidado é bloqueado — o aluno deve logar para
    // concluir (a recompra autenticada passa por /api/aluno/comprar). Não conta
    // aluno sem senha (checkout abandonado antes do pagamento), senão recompras
    // de quem nunca pagou ficariam presas. Ver cpf-already-registered.ts.
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
        asaasInstallmentId: true,
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
        // Parcelamento (carnê de boleto ou cartão parcelado): apagar o PLANO
        // remove todas as cobranças não pagas de uma vez — sem isso o Asaas
        // seguiria emitindo boletos da tentativa abandonada.
        if (existingEnrollment.asaasInstallmentId) {
          await deleteAsaasInstallment(
            existingEnrollment.asaasInstallmentId,
            motherAsaasKey(),
          ).catch(swallow("pmb-checkout.switch.delete_installment"))
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

      // Venda PMB: cupom e matrícula têm tenantId=null. Bloqueia cupom de
      // revenda (tenantId != null) aplicado a uma venda do sistema mãe.
      assertCouponMatchesEnrollment({
        couponTenantId: coupon.tenantId,
        enrollmentTenantId: null,
        context: "pmb.checkout.coupon",
      })

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

    // ── Validação do parcelamento (contra o finalAmount do SERVIDOR, já com
    // cupom). Regras: boleto = parcela mínima R$50 e máx 6 boletos; cartão =
    // teto do admin (parcelas sem juros) + mínimo R$5/parcela. Falhou → libera
    // o cupom reservado e devolve 400 com o máximo real.
    const installmentsChosen = data.installments ?? 1
    if (installmentsChosen > 1) {
      const rejectInstallments = async (message: string, code: string) => {
        if (consumedCouponId) {
          await releaseCoupon(consumedCouponId).catch(swallow("pmb-checkout"))
        }
        return NextResponse.json({ error: message, code }, { status: 400 })
      }
      if (gateway !== "ASAAS") {
        return rejectInstallments(
          "Parcelamento indisponível neste gateway",
          "INSTALLMENTS_UNSUPPORTED",
        )
      }
      if (isMonthly) {
        return rejectInstallments(
          "Cursos com mensalidade não aceitam parcelamento adicional",
          "INSTALLMENTS_NOT_ALLOWED",
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
        const cap = pmbMaxCardInstallments(
          finalAmount,
          settings.pmbInterestFreeInstallments,
        )
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
      // Cobrança Asaas (cliente + payment/subscription + persistência dos
      // campos asaas na matrícula). Lógica extraída para reuso pela tela /pagar.
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
        courseNome: course.nome,
        finalAmount,
        isMonthly,
        monthlyMonths,
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
