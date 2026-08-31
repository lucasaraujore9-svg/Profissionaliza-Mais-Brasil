import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
import { cpfHasRegisteredLogin } from "@/lib/students/cpf-already-registered"
import { provisionStudentAccess } from "@/lib/students/access"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import {
  isFreeAmount,
  releaseFreeEnrollment,
  resellerTenantContext,
} from "@/lib/checkout/free-enrollment"
import { assertCouponMatchesEnrollment } from "@/lib/checkout/assert-tenant-gateway"
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
import {
  AUTHORED_COURSE_SELECT,
  authoredSaleGate,
} from "@/lib/course-authoring/checkout-gate"
import {
  resolveSaleSplit,
  saleRequiresSplit,
} from "@/lib/course-authoring/split-server"
import { tenantPolo } from "@/lib/tenant/slug"
import { isSellablePrice } from "@/lib/checkout/price-guard"
import { resolveSaleGateway } from "@/lib/checkout/sale-gateway"
import {
  buildGuardianWrite,
  guardianShape,
  nascimentoField,
  withGuardianRule,
} from "@/lib/students/guardian"

/**
 * Checkout. `nascimento` do ALUNO e obrigatorio: e o unico jeito de saber quem
 * e menor. Quando indicar menor de 18, `withGuardianRule` exige o bloco do
 * RESPONSAVEL FINANCEIRO — a cobranca sai no CPF dele e o certificado continua
 * saindo no nome do aluno.
 */
const bodySchema = withGuardianRule(
  z.object({
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
  nascimento: nascimentoField,
  ...guardianShape,
  }),
  // Declaracao de responsabilidade legal: os Termos (secao 183) e a Politica de
  // Privacidade (151) ja a prometem; ate aqui o codigo nunca a coletou.
  { requireDeclaracao: true },
)

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
          poloName: true,
          name: true,
          status: true,
          mpAccessToken: true,
          mpPublicKey: true,
          plataformaVendedorId: true,
          automationEnabled: true,
          monthlyAllowed: true,
          monthlyEnabled: true,
          monthlyScope: true,
          // Gateway de vendas da unidade (MP padrão | ASAAS quando conectado).
          salesGateway: true,
          asaasConnected: true,
          asaasWebhookToken: true,
        },
      }),
      prisma.tenantCourse.findFirst({
        // SAAS-004: a invariante "curso sem valor não vende" (price > 0) vale
        // também no caminho de receita, não só nas listagens/detalhe da vitrine.
        // Um TenantCourse com isVisible=true mas price=0 (estado inconsistente
        // do admin, nunca exibido na vitrine) não pode gerar enrollment R$0.
        where: {
          id: data.courseId,
          tenantId,
          isVisible: true,
          price: { gt: 0 },
          // Curso desativado/removido na origem (EA/LMS) fica status="INATIVO":
          // some das vitrines e tambem nao pode ser comprado via POST direto.
          course: { status: "ATIVO" },
        },
        include: {
          course: {
            select: {
              slug: true,
              monthlyMonthsMain: true,
              parcelasSugeridas: true,
              parcelasOverride: true,
              // Sem estas colunas o curso de autoria se apresenta como curso
              // comum da PMB e a venda sai SEM rateio: o produtor nunca recebe
              // e ninguem percebe.
              ...AUTHORED_COURSE_SELECT,
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
      asaasConnected: tenant.asaasConnected,
      mpAccessToken: tenant.mpAccessToken,
      mpPublicKey: tenant.mpPublicKey,
    })

    // Curso produzido por OUTRA unidade: o rateio só existe no Asaas, então o
    // gateway escolhido pela loja é ignorado aqui de propósito. Cair no MP
    // silenciosamente venderia o curso sem repasse nenhum ao produtor.
    const requiresSplit = saleRequiresSplit(tenantCourse.course, tenantId)

    const basePrice = Number(tenantCourse.price)

    // SAAS-004: trava explícita do preço positivo no caminho de receita.
    // Redundante com o `price: { gt: 0 }` da query (que já devolve 404), mas
    // protege contra qualquer conversão de Decimal não-positiva e documenta a
    // invariante no ponto onde o valor é cobrado.
    if (!isSellablePrice(basePrice)) {
      return NextResponse.json(
        { error: "Curso sem valor para venda", code: "COURSE_NO_PRICE" },
        { status: 400 },
      )
    }

    // Gate de CPF — mesma regra do checkout PMB: CPF com login já definido
    // nesta loja não compra como convidado; precisa logar (a recompra
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

    // Gate de rateio ANTES do bloco de cupom: recusar depois de
    // `tryConsumeCoupon` vazaria um uso do cupom numa venda que nem aconteceu.
    // Aqui ele valida composição da venda, gateway da loja, carteiras e preço;
    // o snapshot definitivo é remontado abaixo, já com o desconto.
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

      // Cupom e matrícula pertencem à mesma unidade. Bloqueia cupom PMB
      // (tenantId=null) aplicado a uma venda de revenda.
      assertCouponMatchesEnrollment({
        couponTenantId: coupon.tenantId,
        enrollmentTenantId: tenantId,
        context: "loja.checkout.coupon",
      })

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
      couponToReserve = coupon.id
    }

    const finalAmount = finalAmountFromCoupon ?? basePrice

    // Gateway da venda — resolvido DEPOIS do desconto de propósito. Cupom que
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

    // Reserva atômica do cupom — evita estouro de maxUses em compras
    // concorrentes. DEPOIS do gate acima: recusar a venda com a reserva já feita
    // queimaria um uso numa compra que nem aconteceu.
    if (couponToReserve) {
      const reserved = await tryConsumeCoupon(couponToReserve)
      if (!reserved) {
        return NextResponse.json(
          { error: "Cupom esgotado", code: "COUPON_EXHAUSTED" },
          { status: 400 },
        )
      }
      couponId = couponToReserve
      consumedCouponId = couponToReserve
    }

    // Com desconto o rateio muda: a parte do produtor continua sendo calculada
    // sobre a tabela e a do vendedor absorve o abatimento — remontamos para que
    // o snapshot congelado na matrícula reflita o que foi de fato cobrado.
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
          await releaseCoupon(consumedCouponId).catch(swallow("loja.checkout"))
          consumedCouponId = null
        }
        return NextResponse.json(
          { error: recomputed.message, code: recomputed.error },
          { status: 400 },
        )
      }
      splitSnapshot = recomputed.value
    }

    // Data de nascimento + responsavel financeiro, no formato tri-estado que o
    // upsert entende. `collected = true`: este formulario SEMPRE traz o bloco.
    const { nascimento, guardian } = buildGuardianWrite(data, {
        // Checkout ANONIMO: pode adicionar responsavel, nunca remover. Sem isto
        // qualquer pessoa com o CPF/e-mail de um aluno refaria o checkout com
        // uma data de adulto e apagaria o responsavel ja verificado — mandando
        // a proxima cobranca para o CPF do menor.
        allowClear: false,
      })

    const student = await upsertStudent({
      tenantId,
      nome: normalize(data.nome),
      email: data.email,
      cpf: data.cpf,
      fone: data.fone,
      endereco: data.endereco,
      polo: tenantPolo(tenant),
      vendedorId: tenant.plataformaVendedorId,
      plataformaAlunoIdFallback: `pending_${Date.now()}`,
      nascimento,
      guardian,
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

      // Cupom zerou o valor: libera na hora em vez de devolver o form de
      // pagamento (o gateway recusaria R$ 0).
      if (isFreeAmount(reusedAmount)) {
        // ANTES do await, não depois: o cupom já foi GRAVADO na matrícula
        // reaproveitada logo acima. Se `releaseFreeEnrollment` lançar (a EA
        // rethrow em `provisionEaAccess`), o catch externo devolveria um uso
        // que continua vinculado a uma venda viva — o cupom passaria de
        // `maxUses`. A matrícula reaproveitada não é apagada pelo catch
        // (`createdEnrollmentId` é null aqui), então o consumo segue válido.
        consumedCouponId = null
        await releaseFreeEnrollment(resellerTenantContext(tenant), existingEnrollment.id)
        return NextResponse.json({
          data: {
            enrollmentId: existingEnrollment.id,
            mode: "free",
            amount: 0,
          },
        })
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
        // Termos CONGELADOS: um carnê paga ao longo de meses e o produtor pode
        // editar a comissão no meio. As parcelas seguintes seguem o acordo
        // desta venda, não o do dia do pagamento.
        authorSplitSnapshot: splitSnapshot
          ? (splitSnapshot as unknown as Prisma.InputJsonValue)
          : undefined,
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

    // ── Cupom cobriu 100% ────────────────────────────────────────────────────
    // Não há cobrança a fazer (MP/Asaas recusam R$ 0): libera o acesso na hora,
    // como bolsa. O cupom consumido acima NÃO é devolvido — o uso foi efetivo.
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
            .catch(swallow("loja_checkout.free_rollback"))
          if (consumedCouponId) {
            await releaseCoupon(consumedCouponId).catch(
              swallow("loja_checkout.free_rollback"),
            )
          }
        }
        createdEnrollmentId = null
        consumedCouponId = null
        contextLogger().error(
          { err, event: "loja_checkout.free_failed", enrollmentId: enrollment.id },
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
        data: { enrollmentId: enrollment.id, mode: "free", amount: 0 },
      })
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
