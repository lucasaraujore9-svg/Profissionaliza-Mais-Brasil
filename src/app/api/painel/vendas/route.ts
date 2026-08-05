import { NextResponse } from "next/server"
import { z } from "zod"
import type { PaymentType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { auth } from "@/lib/auth"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { assertCouponMatchesEnrollment } from "@/lib/checkout/assert-tenant-gateway"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
import { fulfillScholarshipEnrollment } from "@/lib/enrollment/fulfill"
import {
  isFreeAmount,
  releaseFreeEnrollment,
  resellerTenantContext,
} from "@/lib/checkout/free-enrollment"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"
import { effectivePaymentType, monthlyActive } from "@/lib/tenant/monthly-policy"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { activeCustomDomain, vitrineUrl } from "@/lib/tenant/urls"
import { tenantPolo } from "@/lib/tenant/slug"
import { createBoletoInstallmentPlan } from "@/lib/installments/plan"
import {
  MIN_BOLETO_INSTALLMENTS,
  MAX_BOLETO_INSTALLMENTS,
} from "@/lib/installments/schedule"
import { getPackageForCheckout } from "@/lib/packages/vitrine"
import { MAX_SALE_COURSES, dedupeIds } from "@/lib/enrollment/multi-course"
import { rollbackSaleEnrollment } from "@/lib/enrollment/multi-course-server"

const createSchema = z
  .object({
    // Aluno da venda: OU um aluno JÁ EXISTENTE da unidade (studentId, sempre
    // escopado ao tenant no handler — a busca da tela só devolve alunos da
    // própria revenda), OU os dados de um NOVO aluno (criado/reaproveitado por
    // CPF no submit). Exatamente um dos dois — validado no .refine abaixo.
    // Espelha a venda direta do PMB (buscar existente | novo aluno), porém com
    // o acesso restrito aos alunos da revenda.
    studentId: z.string().min(1).optional(),
    nome: z.string().trim().min(3).max(160).optional(),
    email: z.string().email().toLowerCase().trim().optional(),
    cpf: z
      .string()
      .trim()
      .refine(isValidCpf, "CPF inválido")
      .transform(stripCpf)
      .optional(),
    fone: z
      .string()
      .trim()
      .refine(isValidPhone, "Telefone inválido")
      .transform(normalizePhone)
      .optional(),

    // Alvo da venda: UM OU MAIS cursos da própria vitrine (TenantCourse) OU um
    // pacote (CoursePackage). Exatamente um dos dois — validado no .refine
    // abaixo. Com vários cursos a venda soma os preços numa única cobrança: o
    // 1º da lista vira a matrícula primária e os demais entram em
    // `Enrollment.bundleCourseIds` (satélites criados no fulfill).
    tenantCourseIds: z
      .array(z.string().min(1))
      .min(1)
      .max(MAX_SALE_COURSES)
      .optional(),
    packageId: z.string().min(1).optional(),
    couponCode: z.string().trim().max(64).optional(),
    // Desconto manual (%) dado pelo vendedor na hora, sem cupom. Teto = cap do
    // vendedor (dono 100%, consultor = maxDiscount). Mutuamente exclusivo com
    // couponCode (validado no .refine abaixo).
    manualDiscountPercent: z.number().positive().max(100).optional(),
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
  // XOR: a venda é de curso(s) OU de um pacote, nunca ambos/nenhum.
  .refine((v) => !!v.tenantCourseIds?.length !== !!v.packageId, {
    message: "Informe tenantCourseIds ou packageId",
    path: ["tenantCourseIds"],
  })
  // Aluno: um aluno existente (studentId) OU os dados completos de um novo
  // aluno, nunca ambos/nenhum.
  .refine((v) => !!v.studentId !== !!(v.nome && v.email && v.cpf && v.fone), {
    message: "Informe um aluno existente ou os dados de um novo aluno",
    path: ["studentId"],
  })
  // Desconto: cupom OU desconto manual, nunca os dois.
  .refine((v) => !(v.couponCode && v.manualDiscountPercent), {
    message: "Use cupom OU desconto manual, não os dois",
    path: ["manualDiscountPercent"],
  })

export const GET = withRequestContext(
  { action: "painel.vendas.list", route: "/api/painel/vendas" },
  async () => {
    const guard = await requirePainel("vendas.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    // Pega vendas diretas (com soldByUserId definido) do tenant. Escopo do
    // papel: sem `vendas.viewAll`, só as vendas que a própria pessoa originou —
    // `ctx.scope.vendas` fixa soldByUserId nela e vence o `{ not: null }`.
    const enrollments = await prisma.enrollment.findMany({
      where: {
        tenantId: ctx.tenantId,
        soldByUserId: { not: null },
        ...ctx.scope.vendas,
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
        // Venda com mais de um curso: o `courseName` é o curso principal (o que
        // carrega a cobrança); a contagem revela os que vieram junto.
        courseCount: 1 + e.bundleCourseIds.length,
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
    const guard = await requirePainel("vendas.create")
    if (!guard.ok) return guard.response
    const { ctx } = guard

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
        asaasWebhookToken: true,
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

    // Gateway ATIVO da unidade, pela MESMA fonte de verdade da vitrine
    // (src/lib/tenant/checkout-mode.ts). A venda direta era a única superfície
    // de venda que não consultava esse helper: o link de pagamento exigia
    // Mercado Pago incondicionalmente (503 "Conecte o Mercado Pago") mesmo para
    // quem escolheu o Asaas, e gravava `gateway: "MP"` fixo na matrícula — numa
    // unidade que migrou para o Asaas sem revogar o token antigo do MP, isso
    // cobrava na conta que ela considera desativada. NONE = gateway escolhido
    // não está pronto; nunca há fallback para o outro (REGRA DE OURO).
    const mode = tenantCheckoutMode(tenant)

    const isInstallment = !isBolsista && !!data.boletoInstallment
    // Carnê usa a MESMA capability de "Pagamento parcelado (mensalidade)".
    if (isInstallment && !monthlyActive(tenant)) {
      return NextResponse.json(
        { error: "Pagamento parcelado não está habilitado para sua unidade." },
        { status: 403 },
      )
    }
    // Toda venda COM cobrança (link transparente ou carnê) sai pelo gateway
    // ativo da unidade. A bolsa não cobra e por isso pula o gate.
    if (!isBolsista) {
      if (mode === "NONE") {
        return NextResponse.json(
          {
            error:
              tenant.salesGateway === "ASAAS"
                ? "Conecte o Asaas em /painel/configuracoes para vender."
                : "Conecte o Mercado Pago em /painel/configuracoes",
          },
          { status: 503 },
        )
      }
      // Asaas: sem o token do webhook a cobrança até é criada, mas a confirmação
      // do pagamento é recusada em /api/webhooks/asaas (401) e o aluno nunca é
      // matriculado. Mesma trava autoritativa do /api/loja/checkout.
      if (mode === "ASAAS" && !tenant.asaasWebhookToken) {
        return NextResponse.json(
          {
            error:
              "Conexão com o Asaas incompleta — reconecte a conta em /painel/configuracoes.",
          },
          { status: 503 },
        )
      }
    }

    // Resolve o alvo da venda em variáveis unificadas (curso(s) ou pacote). O
    // pacote cria a matrícula PRIMÁRIA (packagePrimary=true, tenantCourseId=null,
    // courseId=curso primário); os satélites nascem no fulfill/settle. Pacote é
    // sempre pagamento único.
    //
    // Venda com VÁRIOS cursos: mesma mecânica sem pacote no catálogo — o 1º
    // curso vira a primária (que carrega o valor SOMADO) e os demais vão em
    // `bundleCourseIds`, virando satélites no fulfill.
    const isPackage = !!data.packageId
    let basePrice: number
    let enrollmentCourseId: string
    let enrollmentTenantCourseId: string | null
    let enrollmentCoursePackageId: string | null
    let bundleCourseIds: string[] = []
    let rawPaymentType: PaymentType
    let monthlyMonthsMain: number | null
    /** Todos os cursos cobertos pela venda — usado no gate de duplicidade. */
    let saleCourseIds: string[]

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
      // Duplicidade de pacote é checada pela matrícula primária do pacote, não
      // curso a curso (regra histórica) — ver o gate mais abaixo.
      saleCourseIds = [enrollmentCourseId]
    } else {
      const requestedIds = dedupeIds(data.tenantCourseIds!)
      const found = await prisma.tenantCourse.findMany({
        where: { id: { in: requestedIds }, tenantId: tenant.id, isVisible: true },
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
      const byId = new Map(found.map((tc) => [tc.id, tc]))
      // Ordem do vendedor preservada: o 1º curso escolhido é o que vira a
      // matrícula primária (a que carrega a cobrança).
      const tenantCourses = requestedIds
        .map((id) => byId.get(id))
        .filter((tc): tc is (typeof found)[number] => !!tc)
      if (tenantCourses.length !== requestedIds.length) {
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
      const inativo = tenantCourses.find((tc) => tc.course.status !== "ATIVO")
      if (inativo) {
        return NextResponse.json(
          { error: "Curso indisponível" },
          { status: 404 },
        )
      }

      const semPreco = tenantCourses.find((tc) => !(Number(tc.price) > 0))
      if (semPreco) {
        return NextResponse.json(
          {
            error:
              tenantCourses.length > 1
                ? `Curso sem preço configurado: ${semPreco.course.nome}`
                : "Curso sem preço configurado",
          },
          { status: 400 },
        )
      }

      // Mensalidade é um contrato recorrente de UM curso: somá-la ao preço à
      // vista de outros numa cobrança única cobraria só o 1º mês pelo pacote
      // todo. Curso mensal só é vendido sozinho.
      const mensal = tenantCourses.find(
        (tc) => effectivePaymentType(tc.paymentType, tenant, "direct") === "MONTHLY",
      )
      if (tenantCourses.length > 1 && mensal) {
        return NextResponse.json(
          {
            error: `O curso "${mensal.course.nome}" é vendido como mensalidade e precisa ser vendido sozinho.`,
          },
          { status: 400 },
        )
      }

      const primary = tenantCourses[0]
      basePrice =
        Math.round(
          tenantCourses.reduce((sum, tc) => sum + Number(tc.price), 0) * 100,
        ) / 100
      enrollmentCourseId = primary.courseId
      enrollmentTenantCourseId = primary.id
      enrollmentCoursePackageId = null
      bundleCourseIds = tenantCourses.slice(1).map((tc) => tc.courseId)
      rawPaymentType = primary.paymentType
      monthlyMonthsMain = primary.course.monthlyMonthsMain
      saleCourseIds = tenantCourses.map((tc) => tc.courseId)
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

    // ── Desconto manual (sem cupom) ───────────────────────────────────────
    // O vendedor digita o percentual na hora; o teto é o cap dele (dono 100%,
    // consultor = maxDiscount, já resolvido em `cap`). Mutuamente exclusivo com
    // cupom (schema) e não se aplica a bolsa nem a carnê (valor manual).
    if (!isBolsista && !isInstallment && data.manualDiscountPercent) {
      if (data.manualDiscountPercent > cap + 0.01) {
        return NextResponse.json(
          { error: `Desconto excede seu cap (${cap}%)` },
          { status: 403 },
        )
      }
      const applied = applyCouponDiscount({
        basePrice,
        discountType: "PERCENTAGE",
        discountValue: data.manualDiscountPercent,
      })
      discountAmount = applied.discountAmount
      finalAmountFromCoupon = applied.finalAmount
    }

    const finalAmount = finalAmountFromCoupon ?? basePrice

    // Resolve o aluno: OU um aluno JÁ EXISTENTE da unidade (studentId, sempre
    // escopado ao tenant — a limitação de acesso aos alunos da revenda), OU um
    // NOVO aluno criado/reaproveitado por CPF. Espelha a venda direta do PMB
    // (buscar existente | novo aluno).
    let student: {
      id: string
      nome: string
      email: string | null
      cpf: string | null
      fone: string | null
    }
    if (data.studentId) {
      // Isolamento P0: só encontra o aluno se ele pertence a ESTA unidade. Um
      // studentId de outro tenant devolve 404 (nunca vaza aluno cross-tenant).
      const found = await prisma.student.findFirst({
        where: { id: data.studentId, tenantId: tenant.id },
        select: { id: true, nome: true, email: true, cpf: true, fone: true },
      })
      if (!found) {
        if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas"))
        return NextResponse.json(
          { error: "Aluno não encontrado" },
          { status: 404 },
        )
      }
      if (!found.email) {
        if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas"))
        return NextResponse.json(
          { error: "Aluno sem email cadastrado" },
          { status: 400 },
        )
      }
      student = found
    } else {
      // Novo aluno: upsertStudent protege contra corrupção de CPF entre alunos
      // distintos com o mesmo email e trata race de checkouts paralelos. Status
      // inicial "INTERESSADO" porque o aluno ainda não pagou — o fulfill promove
      // para ATIVO quando o webhook confirma (mantém o provisionamento da revenda).
      try {
        student = await upsertStudent({
          tenantId: tenant.id,
          nome: data.nome!,
          email: data.email!,
          cpf: data.cpf!,
          fone: data.fone!,
          polo: tenantPolo(tenant),
          vendedorId: tenant.plataformaVendedorId,
          plataformaAlunoIdFallback: `pending_${Date.now()}`,
          initialStatus: "INTERESSADO",
        })
      } catch (err) {
        if (err instanceof StudentEmailConflictError) {
          if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas"))
          return NextResponse.json(
            { error: err.message, code: err.code },
            { status: 409 },
          )
        }
        throw err
      }
    }

    // O Asaas exige o CPF do pagador para criar o cliente da cobrança (tanto no
    // carnê quanto no link). Aluno NOVO sempre traz CPF (schema); o aluno
    // EXISTENTE pode não ter — valida aqui em vez de estourar lá dentro do
    // gateway, que só falharia depois de criar a matrícula (502 + rollback).
    if (!isBolsista && tenant.salesGateway === "ASAAS" && !student.cpf) {
      if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas"))
      return NextResponse.json(
        {
          error:
            "Aluno sem CPF cadastrado — o Asaas exige o CPF para gerar a cobrança.",
        },
        { status: 400 },
      )
    }

    // Duplicidade: pacote compara pela matrícula primária do pacote; curso(s),
    // pelo Course — TODOS os cursos da venda, senão o aluno pagaria de novo por
    // um curso que já tem só porque ele não era o primeiro da lista. Espelha o
    // gate do checkout de pacote (checkout/package/route.ts).
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        ...(isPackage
          ? { coursePackageId: enrollmentCoursePackageId!, packagePrimary: true }
          : { courseId: { in: saleCourseIds } }),
        tenantId: tenant.id,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: { id: true, status: true, course: { select: { nome: true } } },
    })
    if (existingEnrollment) {
      if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas"))
      const alvo = isPackage
        ? "pacote"
        : saleCourseIds.length > 1
          ? `curso "${existingEnrollment.course.nome}"`
          : "curso"
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
          bundleCourseIds,
          soldByUserId: userId,
          paymentType: rawPaymentType,
          status: "PENDING",
          // Bolsa não cobra, mas a coluna alimenta o BI: registra o gateway
          // ATIVO da unidade em vez de mentir "MP" numa unidade Asaas.
          gateway: tenant.salesGateway,
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
        await rollbackSaleEnrollment(enrollment.id).catch(
          swallow("painel.vendas.bolsa_rollback"),
        )
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
          bundleCourseIds,
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
        bundleCourseIds,
        soldByUserId: userId,
        paymentType: effectiveType,
        status: "PENDING",
        // Herda o gateway ATIVO da unidade — /api/loja/checkout/process roteia a
        // cobrança por este campo, então gravar "MP" fixo mandava o dinheiro da
        // unidade Asaas para a conta MP antiga (ou travava a venda em 503).
        gateway: tenant.salesGateway,
        originalAmount: basePrice,
        discountAmount,
        finalAmount,
        couponId,
        installmentsTotal: monthlyMonths,
      },
      select: { id: true },
    })

    // ── Desconto zerou o valor (cupom de 100% ou desconto manual integral) ──
    // Não há link de pagamento a gerar: libera o acesso na hora, pelo mesmo
    // caminho da bolsa. Atenção: a unidade ainda precisa ter um gateway pronto
    // para chegar aqui — o guard roda antes do cálculo do desconto. Sem
    // gateway, a saída para venda sem cobrança continua sendo a flag "bolsista".
    if (isFreeAmount(finalAmount)) {
      try {
        await releaseFreeEnrollment(resellerTenantContext(tenant), enrollment.id)
      } catch (err) {
        await rollbackSaleEnrollment(enrollment.id).catch(
          swallow("painel.vendas.free_rollback"),
        )
        if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas.free_rollback"))
        contextLogger().error(
          { err, event: "painel.vendas.free_failed", studentId: student.id },
          "liberacao de venda com desconto integral falhou",
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

    // Padronizado: `enr_<id>` (mesmo formato de /api/loja/checkout). O webhook
    // identifica o tenant pela query string `?tenant=<slug>` na notification_url.
    const externalReference = `enr_${enrollment.id}`
    // Defesa em profundidade: o guard de gateway acima é condicional (a bolsa
    // pula). No MP o checkout transparente exige token + public key; no Asaas
    // não existe public key — a cobrança é criada server-side no /process com a
    // api key da unidade. Por isso a checagem é POR GATEWAY, não fixa no MP.
    if (mode === "MP" && (!tenant.mpAccessToken || !tenant.mpPublicKey)) {
      await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("painel.vendas.rollback"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas.rollback"))
      return NextResponse.json(
        { error: "Conecte o Mercado Pago (token + public key) em /painel/configuracoes" },
        { status: 503 },
      )
    }

    // Checkout Transparente: NÃO criamos cobrança em gateway nenhum aqui. O link
    // enviado ao aluno aponta para a NOSSA página de pagamento na vitrine do
    // revendedor (/loja/pagar/<id>), onde ele paga cartão/PIX/boleto sem sair do
    // domínio da loja — a cobrança nasce no /process, no gateway da matrícula.
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
