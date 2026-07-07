import { NextResponse } from "next/server"
import { z } from "zod"
import type { PaymentType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { auth } from "@/lib/auth"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { assertCouponMatchesEnrollment } from "@/lib/checkout/assert-tenant-gateway"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
import { fulfillScholarshipEnrollment } from "@/lib/enrollment/fulfill"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { effectivePaymentType, monthlyActive } from "@/lib/tenant/monthly-policy"
import { activeCustomDomain, vitrineUrl } from "@/lib/tenant/urls"
import { tenantPolo } from "@/lib/tenant/slug"
import { createBoletoInstallmentPlan } from "@/lib/installments/plan"
import {
  MIN_BOLETO_INSTALLMENTS,
  MAX_BOLETO_INSTALLMENTS,
} from "@/lib/installments/schedule"
import { getPackageForCheckout } from "@/lib/packages/vitrine"

const createSchema = z.object({
  // Dados do aluno (cria ou reaproveita por CPF/email)
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

  // Alvo da venda: curso (TenantCourse do próprio tenant) OU pacote
  // (CoursePackage). Exatamente um dos dois — validado no .refine abaixo.
  tenantCourseId: z.string().min(1).optional(),
  packageId: z.string().min(1).optional(),
  couponCode: z.string().trim().max(64).optional(),
  // Bolsa de estudo: matricula sem cobranca no Mercado Pago.
  bolsista: z.boolean().optional(),
  // Venda parcelada no boleto (carnê): a revenda define nº de parcelas + valor
  // de cada parcela + 1º vencimento. Só válido quando a unidade tem a capability.
  boletoInstallment: z
    .object({
      count: z.number().int().min(MIN_BOLETO_INSTALLMENTS).max(MAX_BOLETO_INSTALLMENTS),
      installmentValue: z.number().positive(),
      firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    })
    .optional(),
  // Endereço do aluno — exigido pelo Mercado Pago para emitir boleto. Só
  // necessário no carnê com gateway MP; salvo no aluno para o cron reemitir.
  endereco: z
    .object({
      cep: z.string().trim().min(8).max(9),
      rua: z.string().trim().min(2).max(160),
      numero: z.string().trim().min(1).max(20),
      bairro: z.string().trim().min(2).max(120),
      cidade: z.string().trim().min(2).max(120),
      estado: z.string().trim().length(2),
    })
    .optional(),
})
  // XOR: a venda é de um curso OU de um pacote, nunca ambos/nenhum.
  .refine((v) => !!v.tenantCourseId !== !!v.packageId, {
    message: "Informe tenantCourseId ou packageId",
    path: ["tenantCourseId"],
  })

export const GET = withRequestContext(
  { action: "painel.vendas.list", route: "/api/painel/vendas" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Pega vendas diretas (com soldByUserId definido) do tenant.
    const enrollments = await prisma.enrollment.findMany({
      where: {
        tenantId: ctx.tenantId,
        soldByUserId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        student: { select: { nome: true, email: true } },
        course: { select: { nome: true } },
        coupon: { select: { code: true } },
        soldByUser: { select: { name: true } },
      },
    })

    return NextResponse.json({
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
        soldByName: e.soldByUser?.name ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    })
  },
)

export const POST = withRequestContext(
  { action: "painel.vendas.create", route: "/api/painel/vendas" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Cap de desconto se for consultor (TenantMember)
    const session = await auth()
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data
    const isBolsista = data.bolsista === true

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        slug: true,
        poloName: true,
        name: true,
        status: true,
        mpAccessToken: true,
        mpPublicKey: true,
        customDomain: true,
        domainVerified: true,
        plataformaVendedorId: true,
        monthlyAllowed: true,
        monthlyEnabled: true,
        monthlyScope: true,
        salesGateway: true,
        asaasConnected: true,
        asaasApiKey: true,
      },
    })
    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant não encontrado" },
        { status: 404 },
      )
    }
    if (tenant.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Sua loja está suspensa. Regularize o pagamento para vender." },
        { status: 403 },
      )
    }

    // Carnê (parcelado no boleto): exige a capability ativa e usa o gateway de
    // venda da unidade (Asaas gera o carnê nativo; MP emite N boletos avulsos).
    const isInstallment = !isBolsista && !!data.boletoInstallment
    if (isInstallment) {
      // Carnê usa a MESMA capability de "Pagamento parcelado (mensalidade)".
      if (!monthlyActive(tenant)) {
        return NextResponse.json(
          { error: "Pagamento parcelado não está habilitado para sua unidade." },
          { status: 403 },
        )
      }
      if (tenant.salesGateway === "ASAAS") {
        if (!tenant.asaasConnected || !tenant.asaasApiKey) {
          return NextResponse.json(
            { error: "Conecte o Asaas em /painel/configuracoes para gerar carnês." },
            { status: 503 },
          )
        }
      } else if (!tenant.mpAccessToken) {
        return NextResponse.json(
          { error: "Conecte o Mercado Pago em /painel/configuracoes" },
          { status: 503 },
        )
      }
    } else if (!isBolsista && !tenant.mpAccessToken) {
      // Venda normal (link transparente) — sempre pelo Mercado Pago.
      return NextResponse.json(
        { error: "Conecte o Mercado Pago em /painel/configuracoes" },
        { status: 503 },
      )
    }

    // Resolve o alvo da venda em variáveis unificadas (curso ou pacote). O
    // pacote cria a matrícula PRIMÁRIA (packagePrimary=true, tenantCourseId=null,
    // courseId=curso primário); os satélites nascem no fulfill/settle. Pacote é
    // sempre pagamento único.
    const isPackage = !!data.packageId
    let basePrice: number
    let enrollmentCourseId: string
    let enrollmentTenantCourseId: string | null
    let enrollmentCoursePackageId: string | null
    let rawPaymentType: PaymentType
    let monthlyMonthsMain: number | null

    if (isPackage) {
      const pkg = await getPackageForCheckout(tenant.id, data.packageId!)
      if (!pkg) {
        return NextResponse.json(
          { error: "Pacote não encontrado na sua vitrine" },
          { status: 404 },
        )
      }
      basePrice = pkg.price
      enrollmentCourseId = pkg.courses[0].id
      enrollmentTenantCourseId = null
      enrollmentCoursePackageId = pkg.id
      rawPaymentType = "ONE_TIME"
      monthlyMonthsMain = null
    } else {
      const tenantCourse = await prisma.tenantCourse.findFirst({
        where: { id: data.tenantCourseId, tenantId: tenant.id, isVisible: true },
        include: {
          course: {
            select: {
              id: true,
              nome: true,
              slug: true,
              monthlyMonthsMain: true,
              status: true,
            },
          },
        },
      })
      if (!tenantCourse) {
        return NextResponse.json(
          { error: "Curso não encontrado na sua vitrine" },
          { status: 404 },
        )
      }
      // SAAS-010: mesmo gate de ec832d0 aplicado à venda manual do painel. Um
      // curso desativado/removido na origem (EA/LMS → status="INATIVO") não pode
      // ser vendido nem via POST direto, mesmo que o revendedor tenha mantido
      // TenantCourse.isVisible=true (a visibilidade é flag independente). Evita
      // gerar matrícula cujo provisionamento na plataforma parceira falharia.
      if (tenantCourse.course.status !== "ATIVO") {
        return NextResponse.json(
          { error: "Curso indisponível" },
          { status: 404 },
        )
      }
      basePrice = Number(tenantCourse.price)
      if (basePrice <= 0) {
        return NextResponse.json(
          { error: "Curso sem preço configurado" },
          { status: 400 },
        )
      }
      enrollmentCourseId = tenantCourse.courseId
      enrollmentTenantCourseId = tenantCourse.id
      enrollmentCoursePackageId = null
      rawPaymentType = tenantCourse.paymentType
      monthlyMonthsMain = tenantCourse.course.monthlyMonthsMain
    }
    if (basePrice <= 0) {
      return NextResponse.json(
        { error: "Preço não configurado" },
        { status: 400 },
      )
    }

    // Cap de desconto: owner do tenant tem 100%; consultor tem maxDiscount
    const member = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId },
      select: { maxDiscount: true, role: true, status: true },
    })
    const isOwner = !member // owner não tem TenantMember; é o user com role=RESELLER e tenantId
    if (member && member.status !== "ATIVO") {
      return NextResponse.json(
        { error: "Sua conta de consultor está inativa" },
        { status: 403 },
      )
    }
    const cap = isOwner ? 100 : (member?.maxDiscount ?? 0)

    let discountAmount = 0
    let couponId: string | null = null
    let finalAmountFromCoupon: number | null = null
    // Cupom não se aplica a carnê (valor definido manualmente pela revenda).
    if (!isBolsista && !isInstallment && data.couponCode) {
      const code = data.couponCode.toUpperCase()
      const now = new Date()
      // Cupom só do próprio tenant — cupons PMB (tenantId=null) não vazam
      // para checkout de revendedor. Antes o OR aceitava `tenantId: null` e
      // permitia que cupons criados em /admin/vendas/cupons fossem aplicados
      // em vendas de tenants, consumindo `usedCount` global indevidamente.
      const coupon = await prisma.coupon.findFirst({
        where: {
          tenantId: tenant.id,
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
      // Cupom e matrícula pertencem à mesma unidade (ambos tenant.id).
      assertCouponMatchesEnrollment({
        couponTenantId: coupon.tenantId,
        enrollmentTenantId: tenant.id,
        context: "painel.vendas.coupon",
      })
      // Cálculo via helper centralizado (Prisma.Decimal).
      const calc = applyCouponDiscount({
        basePrice,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      })
      discountAmount = calc.discountAmount
      finalAmountFromCoupon = calc.finalAmount

      // Aplica o cap percentual sobre o desconto efetivo (% sobre basePrice),
      // assim cupons FIXED também são limitados — antes só PERCENTAGE era validado.
      if (!isOwner && basePrice > 0) {
        const effectivePct = (discountAmount / basePrice) * 100
        if (effectivePct > cap) {
          return NextResponse.json(
            { error: `Cupom excede seu cap de desconto (${cap}%)` },
            { status: 403 },
          )
        }
      }

      // Reserva atômica do cupom (evita estouro de maxUses em concorrência).
      const reserved = await tryConsumeCoupon(coupon.id)
      if (!reserved) {
        return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 })
      }
      couponId = coupon.id
    }

    const finalAmount = finalAmountFromCoupon ?? basePrice

    // Reuso o upsertStudent: protege contra corrupção de CPF entre alunos
    // distintos com o mesmo email e trata race condition de checkouts paralelos.
    // Status inicial "INTERESSADO" porque o aluno ainda não pagou — o fulfill
    // promove para ATIVO quando o webhook confirma.
    let student: { id: string; nome: string; email: string | null; cpf: string | null }
    try {
      student = await upsertStudent({
        tenantId: tenant.id,
        nome: data.nome,
        email: data.email,
        cpf: data.cpf,
        fone: data.fone,
        polo: tenantPolo(tenant),
        vendedorId: tenant.plataformaVendedorId,
        plataformaAlunoIdFallback: `pending_${Date.now()}`,
        initialStatus: "INTERESSADO",
      })
    } catch (err) {
      if (err instanceof StudentEmailConflictError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 409 },
        )
      }
      throw err
    }

    // Duplicidade: pacote compara pela matrícula primária do pacote; curso, pelo
    // Course. Espelha o gate do checkout de pacote (checkout/package/route.ts).
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        ...(isPackage
          ? { coursePackageId: enrollmentCoursePackageId!, packagePrimary: true }
          : { courseId: enrollmentCourseId }),
        tenantId: tenant.id,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: { id: true, status: true },
    })
    if (existingEnrollment) {
      if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas"))
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

    // ── Bolsa de estudo ───────────────────────────────────────────────────
    // Sem cobranca no Mercado Pago: marca o aluno como bolsista, matricula ja
    // ACTIVE e provisiona o acesso na plataforma de aulas de forma sincrona.
    // Valor cheio entra como desconto pra refletir nos relatorios.
    if (isBolsista) {
      await prisma.student.update({
        where: { id: student.id },
        data: { bolsista: true },
      })

      const enrollment = await prisma.enrollment.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          tenantCourseId: enrollmentTenantCourseId,
          courseId: enrollmentCourseId,
          coursePackageId: enrollmentCoursePackageId,
          packagePrimary: isPackage,
          soldByUserId: userId,
          paymentType: rawPaymentType,
          status: "PENDING",
          gateway: "MP",
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
            id: tenant.id,
            slug: tenant.slug,
            plataformaVendedorId: tenant.plataformaVendedorId,
            isPmbVitrine: false,
            name: tenant.name,
          },
          enrollment.id,
        )
      } catch (err) {
        await prisma.enrollment
          .delete({ where: { id: enrollment.id } })
          .catch(swallow("painel.vendas.bolsa_rollback"))
        contextLogger().error(
          { err, event: "painel.vendas.bolsa_failed", studentId: student.id },
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
          studentId: student.id,
        },
      })
    }

    // ── Carnê (venda parcelada no boleto) ─────────────────────────────────────
    // Cria a matrícula BOLETO_INSTALLMENT (installmentsTotal = nº de parcelas) e
    // dispara a geração do plano: Asaas gera o carnê nativo; MP emite a 1ª parcela
    // agora e o cron emite as demais ~7 dias antes de cada vencimento.
    if (isInstallment && data.boletoInstallment) {
      const { count, installmentValue, firstDueDate } = data.boletoInstallment
      if (count > MAX_BOLETO_INSTALLMENTS) {
        return NextResponse.json(
          { error: `Máximo de ${MAX_BOLETO_INSTALLMENTS}x.` },
          { status: 400 },
        )
      }
      const firstDue = new Date(`${firstDueDate}T12:00:00Z`)
      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      if (
        Number.isNaN(firstDue.getTime()) ||
        firstDue.getTime() < todayStart.getTime()
      ) {
        return NextResponse.json(
          { error: "O 1º vencimento deve ser hoje ou uma data futura." },
          { status: 400 },
        )
      }
      // MP exige endereço do pagador no boleto.
      if (tenant.salesGateway === "MP" && !data.endereco) {
        return NextResponse.json(
          { error: "Informe o endereço do aluno para gerar o boleto (Mercado Pago)." },
          { status: 400 },
        )
      }
      // Persiste o endereço no aluno (o cron reemite os boletos MP com ele).
      if (data.endereco) {
        await prisma.student
          .update({
            where: { id: student.id },
            data: {
              cep: data.endereco.cep,
              rua: data.endereco.rua,
              numero: data.endereco.numero,
              bairro: data.endereco.bairro,
              cidade: data.endereco.cidade,
              estado: data.endereco.estado,
            },
          })
          .catch(swallow("painel.vendas.carne.address"))
      }

      const total = Math.round(count * installmentValue * 100) / 100
      const enrollment = await prisma.enrollment.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          tenantCourseId: enrollmentTenantCourseId,
          courseId: enrollmentCourseId,
          coursePackageId: enrollmentCoursePackageId,
          packagePrimary: isPackage,
          soldByUserId: userId,
          paymentType: "BOLETO_INSTALLMENT",
          status: "PENDING",
          gateway: tenant.salesGateway,
          originalAmount: total,
          discountAmount: 0,
          finalAmount: total,
          couponId: null,
          installmentsTotal: count,
        },
        select: { id: true },
      })

      try {
        const plan = await createBoletoInstallmentPlan({
          enrollmentId: enrollment.id,
          count,
          installmentValue,
          firstDueDate: firstDue,
        })
        return NextResponse.json({
          data: {
            enrollmentId: enrollment.id,
            studentId: student.id,
            finalAmount: total,
            installment: {
              count,
              installmentValue,
              total,
              firstBoletoUrl: plan.firstBoletoUrl,
            },
          },
        })
      } catch (err) {
        await prisma.enrollment
          .delete({ where: { id: enrollment.id } })
          .catch(swallow("painel.vendas.carne.rollback"))
        contextLogger().error(
          { err, event: "painel.vendas.carne_failed", studentId: student.id },
          "geracao do carne falhou",
        )
        const msg = err instanceof Error ? err.message : "Falha ao gerar o carnê."
        return NextResponse.json(
          { error: `Falha ao gerar o carnê: ${msg}` },
          { status: 502 },
        )
      }
    }

    // Tipo efetivo no canal de venda direta/manual. Se a unidade nao tem
    // parcelado habilitado, o curso MONTHLY cai para ONE_TIME. Pacote é sempre
    // pagamento único (rawPaymentType já vem "ONE_TIME").
    const effectiveType = effectivePaymentType(rawPaymentType, tenant, "direct")
    const isMonthly = effectiveType === "MONTHLY"
    const monthlyMonths = isMonthly ? monthlyMonthsMain ?? 12 : null

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        tenantCourseId: enrollmentTenantCourseId,
        courseId: enrollmentCourseId,
        coursePackageId: enrollmentCoursePackageId,
        packagePrimary: isPackage,
        soldByUserId: userId,
        paymentType: effectiveType,
        status: "PENDING",
        gateway: "MP",
        originalAmount: basePrice,
        discountAmount,
        finalAmount,
        couponId,
        installmentsTotal: monthlyMonths,
      },
      select: { id: true },
    })

    // Padronizado: `enr_<id>` (mesmo formato de /api/loja/checkout). O webhook
    // identifica o tenant pela query string `?tenant=<slug>` na notification_url.
    const externalReference = `enr_${enrollment.id}`
    // Re-checagem para narrowing: o guard de mpAccessToken acima e condicional
    // (bolsa pula). Checkout transparente também exige a public key.
    if (!tenant.mpAccessToken || !tenant.mpPublicKey) {
      await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("painel.vendas.rollback"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas.rollback"))
      return NextResponse.json(
        { error: "Conecte o Mercado Pago (token + public key) em /painel/configuracoes" },
        { status: 503 },
      )
    }

    // Checkout Transparente: NÃO criamos preference no MP. O link enviado ao
    // aluno aponta para a NOSSA página de pagamento na vitrine do revendedor
    // (/loja/pagar/<id>), onde ele paga cartão/PIX/boleto sem sair do domínio
    // da loja — nunca é redirecionado para o site do Mercado Pago.
    try {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { externalReference },
      })

      // Path público da vitrine é SEM /loja (o proxy reescreve /pagar → /loja/pagar).
      // Usa o domínio próprio só quando aplicado (DNS apontado + verificado);
      // enquanto pendente, o link de pagamento vai pelo subdomínio oficial.
      const appliedDomain = activeCustomDomain(tenant)
      const storeBase = appliedDomain
        ? `https://${appliedDomain}`
        : vitrineUrl(tenant.slug)
      const paymentUrl = `${storeBase}/pagar/${enrollment.id}`

      return NextResponse.json({
        data: {
          enrollmentId: enrollment.id,
          mode: isMonthly ? "subscription" : "one_time",
          installmentsTotal: monthlyMonths,
          paymentUrl,
          finalAmount,
          discountAmount,
          basePrice,
          studentId: student.id,
        },
      })
    } catch (mpError) {
      await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("painel.vendas.rollback"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas.rollback"))
      throw mpError
    }
  },
)
