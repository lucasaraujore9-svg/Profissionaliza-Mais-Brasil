import { guardianRequirement, hasGuardian } from "@/lib/students/guardian"
import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import {
  AUTHORED_COURSE_SELECT,
  authoredSaleGate,
} from "@/lib/course-authoring/checkout-gate"
import {
  resolveSaleSplit,
  saleRequiresSplit,
} from "@/lib/course-authoring/split-server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { pmbMpAccessToken } from "@/lib/pmb-config"
import {
  assertPmbCharge,
  assertCouponMatchesEnrollment,
  isPmbTenantSlug,
} from "@/lib/checkout/assert-tenant-gateway"
import { getSystemSettings } from "@/lib/system-settings"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { resolveSaleGateway } from "@/lib/checkout/sale-gateway"
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
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"

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
  // Enum do banco (NOT NULL, default MP) — tipar como `string` obrigaria a
  // reafirmar o par MP|ASAAS na resolucao do gateway da venda.
  salesGateway: "MP" | "ASAAS"
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
      asaasConnected: tenant.asaasConnected,
      mpAccessToken: tenant.mpAccessToken,
      mpPublicKey: tenant.mpPublicKey,
    })

    const [student, tenantCourse] = await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: { ...PAYER_SELECT, nascimento: true },
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
              monthlyMonthsMain: true,
              parcelasSugeridas: true,
              parcelasOverride: true,
              // Recompra tambem alcanca curso de autoria de outra unidade.
              ...AUTHORED_COURSE_SELECT,
            },
          },
        },
      }),
    ])

    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    // O gateway so pode ser decidido depois de saber QUAL curso e (rateio
    // obriga Asaas) e QUANTO sera cobrado (cupom de 100% nao vai a gateway
    // nenhum) — a resolucao acontece depois do bloco de cupom, mais abaixo.
    const requiresSplit = tenantCourse
      ? saleRequiresSplit(tenantCourse.course, tenantId)
      : false

    if (!student.email) {
      return NextResponse.json(
        { error: "Cadastre seu email no perfil antes de comprar" },
        { status: 400 },
      )
    }
    // Menor sem responsavel na ficha: a recompra NAO recoleta dados, entao a
    // cobranca sairia no CPF da crianca. Manda completar o perfil em vez de
    // deixar passar.
    if (
      guardianRequirement(student.nascimento) === "REQUIRED" &&
      !hasGuardian(student)
    ) {
      return NextResponse.json(
        {
          error:
            "Cadastro incompleto: aluno menor de 18 anos precisa de responsável financeiro. Fale com a sua unidade para completar o cadastro.",
          code: "GUARDIAN_REQUIRED",
        },
        { status: 400 },
      )
    }

    // Quem PAGA — com aluno menor, o responsavel financeiro ja cadastrado.
    // A recompra NAO recoleta dados: o pagador sai do que ja esta na ficha.
    const payer = resolvePayer(student)

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

    // Gate de rateio antes do cupom — recusar depois de consumi-lo vazaria um uso.
    const gate = await authoredSaleGate({
      courses: [tenantCourse.course],
      sellerTenantId: tenantId,
      seller: {
        asaasConnected: tenant.asaasConnected,
        asaasWebhookToken: tenant.asaasWebhookToken,
      },
      listPrice: basePrice,
    })
    if (!gate.ok) return gate.response

    let discountAmount = 0
    let couponId: string | null = null
    let finalAmountFromCoupon: number | null = null
    let couponToReserve: string | null = null
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
      couponToReserve = coupon.id
    }

    const finalAmount = finalAmountFromCoupon ?? basePrice

    // Gateway da recompra — resolvido DEPOIS do desconto de propósito. Cupom que
    // zera o valor não vai a gateway nenhum: a matrícula é liberada como bolsa,
    // e por isso a unidade que ainda não conectou conta bancária consegue honrar
    // o cupom de 100% que ela mesma emitiu. Regra única em sale-gateway.ts.
    const gatewayGate = resolveSaleGateway({
      mode,
      salesGateway: tenant.salesGateway,
      asaasWebhookToken: tenant.asaasWebhookToken,
      requiresSplit,
      finalAmount,
    })
    if (!gatewayGate.ok) {
      return NextResponse.json(
        { error: gatewayGate.error, code: gatewayGate.code },
        { status: gatewayGate.status },
      )
    }
    const gateway = gatewayGate.gateway

    // Asaas exige CPF do pagador e o Payment Brick (payMode) não reenvia o CPF
    // digitado — sem CPF no cadastro a cobrança trava no /pagar. Só vale quando
    // há cobrança: numa liberação gratuita não existe pagador a identificar.
    // Antes da reserva do cupom, para não queimar um uso numa venda recusada.
    if (!gatewayGate.free && gateway === "ASAAS" && !payer.cpf) {
      return NextResponse.json(
        {
          error:
            payer.kind === "GUARDIAN"
              ? "Cadastre o CPF do responsável financeiro antes de comprar nesta loja"
              : "Cadastre seu CPF no perfil antes de comprar nesta loja",
          code: "STUDENT_CPF_REQUIRED",
        },
        { status: 400 },
      )
    }

    // Reserva atômica DEPOIS dos gates: recusar a venda com a reserva já feita
    // queimaria um uso numa compra que nem aconteceu.
    if (couponToReserve) {
      const reserved = await tryConsumeCoupon(couponToReserve)
      if (!reserved) {
        return NextResponse.json({ error: "Cupom esgotado", code: "COUPON_EXHAUSTED" }, { status: 400 })
      }
      couponId = couponToReserve
      consumedCouponId = couponToReserve
    }

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

    // Com desconto o rateio muda: a parte do produtor continua sobre a tabela e
    // a do vendedor absorve o abatimento. Sem remontar, os percentuais do
    // snapshot (calculados sem desconto) fariam o PRODUTOR pagar a promocao.
    let splitSnapshot = gate.split
    if (splitSnapshot && discountAmount > 0) {
      const recomputed = await resolveSaleSplit({
        course: tenantCourse.course,
        sellerTenantId: tenantId,
        listPrice: basePrice,
        discount: discountAmount,
      })
      if (!recomputed.ok) {
        if (consumedCouponId) {
          await releaseCoupon(consumedCouponId).catch(swallow("aluno.comprar"))
          consumedCouponId = null
        }
        return NextResponse.json(
          { error: recomputed.message, code: recomputed.error },
          { status: 400 },
        )
      }
      splitSnapshot = recomputed.value
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
        authorSplitSnapshot: splitSnapshot
          ? (splitSnapshot as unknown as Prisma.InputJsonValue)
          : undefined,
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
      // Dados do comprador usados no ramo PMB abaixo — selecionados já aqui para
      // não repetir um segundo student.findUnique da MESMA linha por checkout.
      // PAYER_SELECT tras tambem o responsavel financeiro: quem paga por um
      // aluno menor e ele, nao o aluno.
      ...PAYER_SELECT,
      nascimento: true,
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
  if (
    guardianRequirement(student.nascimento) === "REQUIRED" &&
    !hasGuardian(student)
  ) {
    return NextResponse.json(
      {
        error:
          "Cadastro incompleto: aluno menor de 18 anos precisa de responsável financeiro. Fale com a sua unidade para completar o cadastro.",
        code: "GUARDIAN_REQUIRED",
      },
      { status: 400 },
    )
  }
  // Quem PAGA nesta venda direta PMB — responsavel financeiro quando houver.
  const payer = resolvePayer(student)
  const course = await prisma.course.findUnique({
    where: { id: parsed.data.courseId },
    select: {
      status: true,
      precoVitrineMain: true,
      precoPromocional: true,
      precoOriginal: true,
      paymentTypeMain: true,
      monthlyMonthsMain: true,
      ...AUTHORED_COURSE_SELECT,
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

  // Gate de rateio antes do cupom (mesma razao das outras portas: recusar
  // depois de consumir o cupom vazaria um uso).
  const gate = await authoredSaleGate({
    courses: [course],
    sellerTenantId: null,
    seller: null,
    listPrice: basePrice,
  })
  if (!gate.ok) return gate.response

  // `forcedGateway` é ORDEM, não sugestão: sem esta variável ele ia para a
  // matrícula e a cobrança continuava sendo montada por
  // `settings.pmbDirectSaleGateway` — com a vitrine PMB no Mercado Pago, o
  // curso de autoria era vendido por um gateway sem rateio.
  const effectiveGateway = gate.forcedGateway ?? gateway
  if (
    effectiveGateway === "ASAAS" &&
    (!process.env.ASAAS_API_URL || !process.env.ASAAS_API_KEY)
  ) {
    return NextResponse.json(
      { error: "Asaas não configurado" },
      { status: 503 },
    )
  }
  if (effectiveGateway === "MP" && !(await pmbMpAccessToken())) {
    return NextResponse.json({ error: "Mercado Pago não configurado" }, { status: 503 })
  }
  // A página de pagamento da PMB cobra no Asaas com o CPF de quem paga e o
  // cadastro completo do aluno. Recusar aqui, antes de reservar cupom e criar a
  // matrícula, dá ao aluno o que fazer — em vez de uma página que não cobra.
  if (effectiveGateway === "ASAAS" && (!payer.cpf || !student.cpf || !student.fone)) {
    return NextResponse.json(
      {
        error:
          !payer.cpf && payer.kind === "GUARDIAN"
            ? "Cadastre o CPF do responsável financeiro antes de comprar."
            : "Cadastre seu CPF e telefone no perfil antes de comprar.",
      },
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

  let splitSnapshot = gate.split
  if (splitSnapshot && discountAmount > 0) {
    const recomputed = await resolveSaleSplit({
      course,
      sellerTenantId: null,
      listPrice: basePrice,
      discount: discountAmount,
    })
    if (!recomputed.ok) {
      // O cupom já foi reservado acima: sem devolvê-lo, um uso é queimado numa
      // venda que não aconteceu (as outras três portas já liberavam aqui).
      if (couponId) await releaseCoupon(couponId).catch(swallow("aluno.comprar"))
      return NextResponse.json(
        { error: recomputed.message, code: recomputed.error },
        { status: 400 },
      )
    }
    splitSnapshot = recomputed.value
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId: null,
      studentId: student.id,
      tenantCourseId: null,
      courseId: course.id,
      paymentType: course.paymentTypeMain,
      status: "PENDING",
      gateway: effectiveGateway,
      originalAmount: basePrice,
      discountAmount,
      finalAmount,
      couponId,
      installmentsTotal: monthlyMonths,
      authorSplitSnapshot: splitSnapshot
        ? (splitSnapshot as unknown as Prisma.InputJsonValue)
        : undefined,
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

  // ── Pagamento na página da plataforma, nunca na do gateway ──────────────
  // Nada nasce no gateway aqui: o aluno escolhe o meio em `/pagar/<id>` (Asaas
  // via /api/checkout/enrollment/[id], Mercado Pago via
  // /api/checkout/mp/process). Antes esta rota criava a fatura do Asaas ou a
  // preference/preapproval do MP e redirecionava o aluno para a página deles.
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { externalReference: `pmb_enr_${enrollment.id}` },
  })

  return NextResponse.json({
    data: {
      enrollmentId: enrollment.id,
      gateway: effectiveGateway,
      payPath: `/pagar/${enrollment.id}`,
      finalAmount,
    },
  })
  },
)
