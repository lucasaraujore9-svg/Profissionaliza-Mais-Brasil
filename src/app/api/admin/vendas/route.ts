import { guardianRequirement, hasGuardian } from "@/lib/students/guardian"
import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import type { PaymentType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbMpAccessToken } from "@/lib/pmb-config"
import { getSystemSettings } from "@/lib/system-settings"
import { contextLogger } from "@/lib/logger"
import { provisionStudentAccess } from "@/lib/students/access"
import { fulfillScholarshipEnrollment } from "@/lib/enrollment/fulfill"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import {
  AUTHORED_COURSE_SELECT,
  authoredSaleGate,
  type AuthoredCourseSource,
} from "@/lib/course-authoring/checkout-gate"
import { resolveSaleSplit } from "@/lib/course-authoring/split-server"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import {
  isFreeAmount,
  pmbTenantContext,
  releaseFreeEnrollment,
} from "@/lib/checkout/free-enrollment"
import { effectiveSalesCap } from "@/lib/coupons/sales-cap"
import { assertCouponMatchesEnrollment } from "@/lib/checkout/assert-tenant-gateway"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { appUrl as pmbAppUrl } from "@/lib/tenant/urls"
import { getPackageForCheckout } from "@/lib/packages/vitrine"
import { requireAdmin } from "@/lib/auth/admin-guard"
import {
  MAX_SALE_COURSES,
  dedupeIds,
} from "@/lib/enrollment/multi-course"
import { rollbackSaleEnrollment } from "@/lib/enrollment/multi-course-server"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { getPlanForCheckout } from "@/lib/subscriptions/plans"
import { createDirectSubscriptionSale } from "@/lib/subscriptions/direct-sale"

export const GET = withRequestContext(
  { action: "admin.vendas.list", route: "/api/admin/vendas" },
  async (request: Request) => {
  const guard = await requireAdmin("vendas.view")
  if (!guard.ok) return guard.response

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200)

  const where =
    guard.ctx.can("vendas.viewAll")
      ? { tenantId: null }
      : { tenantId: null, soldByUserId: guard.ctx.userId }

  // Venda de ASSINATURA não gera matrícula (elas nascem sob demanda, uma por
  // curso aberto), então ela não aparece no `findMany` de enrollments. Sem a
  // segunda consulta o vendedor emitiria a cobrança e a venda sumiria da tela
  // dele — e o mesmo recorte de carteira (`soldByUserId`) vale para as duas.
  const [enrollments, subscriptions] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        student: { select: { nome: true, email: true } },
        course: { select: { nome: true } },
        coupon: { select: { code: true } },
        soldByUser: { select: { name: true } },
      },
    }),
    prisma.studentSubscription.findMany({
      where: {
        tenantId: null,
        // `{ not: null }` isola as vendas DIRETAS das contratações que o próprio
        // aluno fez na vitrine — estas não são venda de ninguém.
        soldByUserId: guard.ctx.can("vendas.viewAll")
          ? { not: null }
          : guard.ctx.userId,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        student: { select: { nome: true, email: true } },
        plan: { select: { name: true } },
      },
    }),
  ])

  const soldByNames = new Map<string, string | null>()
  const sellerIds = [
    ...new Set(subscriptions.map((s) => s.soldByUserId).filter(Boolean)),
  ] as string[]
  if (sellerIds.length > 0) {
    const sellers = await prisma.user.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, name: true },
    })
    sellers.forEach((u) => soldByNames.set(u.id, u.name))
  }

  const rows = [
    ...enrollments.map((e) => ({
      id: e.id,
      kind: "COURSE" as const,
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
      gateway: e.gateway,
      interval: null as string | null,
      soldByName: e.soldByUser?.name ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    ...subscriptions.map((sub) => ({
      id: sub.id,
      kind: "SUBSCRIPTION" as const,
      studentName: sub.student.nome,
      studentEmail: sub.student.email,
      courseName: sub.plan.name,
      courseCount: 1,
      couponCode: null,
      // A assinatura não guarda "preço de tabela": `priceAtPurchase` já é o
      // valor congelado, com o desconto do vendedor dentro.
      originalAmount: Number(sub.priceAtPurchase),
      discountAmount: 0,
      finalAmount: Number(sub.priceAtPurchase),
      status: sub.status,
      gateway: sub.gateway,
      interval: sub.interval as string | null,
      soldByName: sub.soldByUserId
        ? (soldByNames.get(sub.soldByUserId) ?? null)
        : null,
      createdAt: sub.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)

  return NextResponse.json({ role: guard.ctx.role, data: rows })
  },
)

const createSchema = z
  .object({
    studentId: z.string().min(1),
    // Alvo da venda: UM OU MAIS cursos OU um pacote (CoursePackage PMB).
    // Exatamente um dos dois. Com vários cursos a venda soma os preços numa
    // única cobrança: o 1º da lista vira a matrícula primária e os demais
    // entram em `Enrollment.bundleCourseIds` (satélites criados no fulfill).
    courseIds: z
      .array(z.string().min(1))
      .min(1)
      .max(MAX_SALE_COURSES)
      .optional(),
    packageId: z.string().min(1).optional(),
    // Alvo ASSINATURA: um plano da vitrine PMB. Não gera matrícula — cria a
    // assinatura, e as matrículas nascem sob demanda, uma por curso aberto.
    planId: z.string().min(1).optional(),
    couponCode: z.string().trim().max(64).optional(),
    // Desconto manual (%) dado pelo vendedor na hora da venda, sem cupom.
    // Limitado ao cap individual do usuario (User.maxDiscount; padrao 50).
    manualDiscountPercent: z.number().positive().max(100).optional(),
    // Bolsa de estudo: cria o aluno na plataforma sem gerar cobranca no gateway.
    bolsista: z.boolean().optional(),
  })
  // XOR de três: curso(s), pacote OU plano de assinatura — exatamente um.
  .refine(
    (v) =>
      [!!v.courseIds?.length, !!v.packageId, !!v.planId].filter(Boolean)
        .length === 1,
    {
      message: "Informe courseIds, packageId ou planId",
      path: ["courseIds"],
    },
  )
  // Assinatura não aceita cupom nem bolsa — ver `lib/subscriptions/direct-sale.ts`.
  // Recusar aqui é melhor que ignorar o campo: o vendedor marcaria "bolsa" e a
  // cobrança sairia assim mesmo.
  .refine((v) => !v.planId || (!v.couponCode && !v.bolsista), {
    message:
      "Assinatura não aceita cupom nem bolsa de estudo — use desconto manual.",
    path: ["planId"],
  })
  .refine((v) => !(v.couponCode && v.manualDiscountPercent), {
    message: "Use cupom OU desconto manual, não os dois",
    path: ["manualDiscountPercent"],
  })

export const POST = withRequestContext(
  { action: "admin.vendas.create", route: "/api/admin/vendas" },
  async (request: Request) => {
  const guard = await requireAdmin("vendas.create")
  if (!guard.ok) return guard.response

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

  // Bolsa entrega o curso por R$ 0. Sem permissao propria era o caminho aberto
  // para furar o teto de desconto: quem tomava 403 num desconto de 11% marcava
  // "Bolsa de estudo" e concedia 100%.
  const isBolsista = parsed.data.bolsista === true
  if (isBolsista && !guard.ctx.can("vendas.bolsa")) {
    return NextResponse.json(
      { error: "Sem permissão para matricular como bolsista" },
      { status: 403 },
    )
  }

  const settings = await getSystemSettings()
  const gateway = settings.pmbDirectSaleGateway

  // Bolsa nao toca no gateway — pulamos a validacao de credenciais MP/Asaas.
  if (!isBolsista) {
    if (gateway === "MP") {
      const exists = await pmbMpAccessToken()
      if (!exists) {
        return NextResponse.json(
          { error: "Token Mercado Pago PMB não configurado" },
          { status: 503 },
        )
      }
    }
    if (gateway === "ASAAS" && (!process.env.ASAAS_API_URL || !process.env.ASAAS_API_KEY)) {
      return NextResponse.json(
        { error: "Asaas não configurado (ASAAS_API_URL/ASAAS_API_KEY)" },
        { status: 503 },
      )
    }
  }

  const pmbTenant = await getOrCreatePmbTenant()

  const student = await prisma.student.findFirst({
    where: { id: parsed.data.studentId, tenantId: pmbTenant.id },
    select: { ...PAYER_SELECT, nascimento: true },
  })

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }
  if (!student.email) {
    return NextResponse.json(
      { error: "Aluno sem email cadastrado" },
      { status: 400 },
    )
  }

  // Aluno EXISTENTE menor sem responsavel na ficha: sem este gate a venda passa
  // com o cadastro velho, `resolvePayer` cai em kind="STUDENT" e a cobranca sai
  // no CPF da crianca — exatamente o defeito que este recurso existe para
  // impedir. O gate gemeo esta em /api/painel/vendas.
  if (
    guardianRequirement(student.nascimento) === "REQUIRED" &&
    !hasGuardian(student)
  ) {
    return NextResponse.json(
      {
        error:
          "Aluno menor de 18 anos sem responsável financeiro. Complete o cadastro do aluno antes de vender — o certificado sai no nome do aluno, e a cobrança no CPF do responsável.",
        code: "GUARDIAN_REQUIRED",
        studentId: student.id,
      },
      { status: 400 },
    )
  }

  // Resolve o alvo da venda em variáveis unificadas (curso(s) ou pacote PMB). O
  // pacote cria a matrícula PRIMÁRIA (packagePrimary=true, courseId=curso
  // primário); os satélites nascem no fulfill. Pacote é sempre pagamento único.
  //
  // Venda com VÁRIOS cursos: mesma mecânica sem pacote no catálogo — o 1º curso
  // vira a primária (que carrega o valor SOMADO) e os demais vão em
  // `bundleCourseIds`, virando satélites no fulfill.
  const isSubscription = !!parsed.data.planId
  const isPackage = !!parsed.data.packageId
  /** Plano da venda de ASSINATURA, com o preço da vitrine PMB. */
  const plan = isSubscription
    ? await getPlanForCheckout(null, parsed.data.planId!)
    : null
  if (isSubscription && !plan) {
    return NextResponse.json(
      { error: "Plano de assinatura não disponível" },
      { status: 404 },
    )
  }
  let basePrice: number
  let enrollmentCourseId: string
  let enrollmentCoursePackageId: string | null
  let bundleCourseIds: string[] = []
  let rawPaymentType: PaymentType
  let monthlyMonthsMain: number | null
  /** Todos os cursos cobertos pela venda — usado no gate de duplicidade. */
  let saleCourseIds: string[]
  /** Colunas de autoria dos cursos da venda, para o gate de rateio. */
  let saleCourses: AuthoredCourseSource[] = []

  if (plan) {
    // Assinatura não tem matrícula própria. Estes campos existem só para o
    // restante do handler compilar; o ramo de assinatura sai antes de tocar em
    // `Enrollment`.
    basePrice = plan.price
    enrollmentCourseId = ""
    enrollmentCoursePackageId = null
    rawPaymentType = "ONE_TIME"
    monthlyMonthsMain = null
    saleCourseIds = []
  } else if (isPackage) {
    const pkg = await getPackageForCheckout(null, parsed.data.packageId!)
    if (!pkg) {
      return NextResponse.json({ error: "Pacote não disponível" }, { status: 404 })
    }
    basePrice = pkg.price
    enrollmentCourseId = pkg.courses[0].id
    enrollmentCoursePackageId = pkg.id
    rawPaymentType = "ONE_TIME"
    monthlyMonthsMain = null
    // Duplicidade de pacote é checada pela matrícula primária do pacote, não
    // curso a curso (regra histórica) — ver o gate mais abaixo.
    saleCourseIds = [enrollmentCourseId]
  } else {
    const requestedIds = dedupeIds(parsed.data.courseIds!)
    const found = await prisma.course.findMany({
      where: { id: { in: requestedIds } },
      select: {
        status: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        paymentTypeMain: true,
        monthlyMonthsMain: true,
        // A vitrine PMB também vende curso produzido por uma unidade: aqui a
        // PMB é a VENDEDORA e retém comissão + taxa; só a linha do produtor
        // viaja por split.
        ...AUTHORED_COURSE_SELECT,
      },
    })
    const byId = new Map(found.map((c) => [c.id, c]))
    // Ordem do vendedor preservada: o 1º curso escolhido é o que vira a
    // matrícula primária (a que carrega a cobrança).
    const courses = requestedIds
      .map((id) => byId.get(id))
      .filter((c): c is (typeof found)[number] => !!c)
    if (
      courses.length !== requestedIds.length ||
      courses.some((c) => c.status !== "ATIVO")
    ) {
      return NextResponse.json({ error: "Curso não disponível" }, { status: 404 })
    }

    saleCourses = courses

    const precoDe = (c: (typeof found)[number]) =>
      Number(c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal ?? 0)
    const semPreco = courses.find((c) => !(precoDe(c) > 0))
    if (semPreco) {
      return NextResponse.json(
        {
          error:
            courses.length > 1
              ? `Curso sem preço da vitrine PMB: ${semPreco.nome}`
              : "Curso sem preço da vitrine PMB",
        },
        { status: 400 },
      )
    }

    // Mensalidade é um contrato recorrente de UM curso: somá-la ao preço à vista
    // de outros numa cobrança única cobraria só o 1º mês pelo pacote todo. Curso
    // mensal só é vendido sozinho.
    const mensal = courses.find((c) => c.paymentTypeMain === "MONTHLY")
    if (courses.length > 1 && mensal) {
      return NextResponse.json(
        {
          error: `O curso "${mensal.nome}" é vendido como mensalidade e precisa ser vendido sozinho.`,
        },
        { status: 400 },
      )
    }

    const primary = courses[0]
    basePrice =
      Math.round(courses.reduce((sum, c) => sum + precoDe(c), 0) * 100) / 100
    enrollmentCourseId = primary.id
    enrollmentCoursePackageId = null
    bundleCourseIds = courses.slice(1).map((c) => c.id)
    rawPaymentType = primary.paymentTypeMain
    monthlyMonthsMain = primary.monthlyMonthsMain
    saleCourseIds = courses.map((c) => c.id)
  }

  // Na bolsa o fulfillScholarshipEnrollment cuida da senha do painel + email de
  // boas-vindas de forma sincrona, entao pulamos aqui pra nao reenviar.
  if (!isBolsista) {
    await provisionStudentAccess(student.id, {
      isPmbVitrine: true,
      slug: pmbTenant.slug,
    }).catch((err) => {
      contextLogger().error(
        { err, event: "admin.vendas.provision_access_failed", studentId: student.id },
        "provisionStudentAccess falhou",
      )
    })
  }

  // Duplicidade: pacote compara pela matrícula primária; curso(s), pelo Course —
  // TODOS os cursos da venda, senão o aluno pagaria de novo por um curso que já
  // tem só porque ele não era o primeiro da lista.
  const existingEnrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: student.id,
      ...(isPackage
        ? { coursePackageId: enrollmentCoursePackageId!, packagePrimary: true }
        : { courseId: { in: saleCourseIds } }),
      status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
    },
    select: { id: true, status: true, course: { select: { nome: true } } },
  })
  if (existingEnrollment) {
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

  // Gate de rateio ANTES da bolsa e do desconto/cupom. Antes da bolsa porque
  // conceder de graca o curso de outra unidade e justamente o caso em que o
  // produtor nao recebe nada; antes do cupom porque recusar depois de
  // `tryConsumeCoupon` vazaria um uso numa venda que nem aconteceu.
  const gate = await authoredSaleGate({
    courses: saleCourses,
    sellerTenantId: null,
    seller: null,
    listPrice: basePrice,
    freeGrant: isBolsista,
  })
  if (!gate.ok) return gate.response

  // O gate manda no gateway — `forcedGateway` e ordem, nao sugestao. Sem esta
  // variavel ele era gravado na matricula e o ramo de cobranca logo abaixo
  // continuava olhando `settings.pmbDirectSaleGateway`: a venda de curso
  // autoral saia pelo Mercado Pago, que nao tem rateio, e o produtor nunca
  // recebia. O pre-check de credenciais la em cima rodou para o gateway
  // CONFIGURADO, entao o Asaas forcado precisa do dele aqui.
  const effectiveGateway = gate.forcedGateway ?? gateway
  if (
    !isBolsista &&
    effectiveGateway === "ASAAS" &&
    (!process.env.ASAAS_API_URL || !process.env.ASAAS_API_KEY)
  ) {
    return NextResponse.json(
      { error: "Asaas não configurado (ASAAS_API_URL/ASAAS_API_KEY)" },
      { status: 503 },
    )
  }

  // ── Bolsa de estudo ─────────────────────────────────────────────────────
  // Sem cobranca: marca o aluno como bolsista, cria a matricula ja ACTIVE e
  // provisiona o acesso na plataforma de aulas de forma sincrona. Cupom e
  // ignorado (nao ha valor a descontar). Valor cheio vai como desconto pra
  // refletir nos relatorios o quanto foi concedido.
  if (isBolsista) {
    await prisma.student.update({
      where: { id: student.id },
      data: { bolsista: true },
    })

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId: null,
        studentId: student.id,
        tenantCourseId: null,
        courseId: enrollmentCourseId,
        coursePackageId: enrollmentCoursePackageId,
        packagePrimary: isPackage,
        bundleCourseIds,
        soldByUserId: guard.ctx.userId,
        paymentType: rawPaymentType,
        status: "PENDING",
        gateway: effectiveGateway,
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
          id: pmbTenant.id,
          slug: pmbTenant.slug,
          plataformaVendedorId: null,
          isPmbVitrine: true,
          name: "Profissionaliza Mais Brasil",
        },
        enrollment.id,
      )
    } catch (err) {
      await rollbackSaleEnrollment(enrollment.id).catch(
        swallow("admin.vendas.bolsa.rollback"),
      )
      contextLogger().error(
        { err, event: "admin.vendas.bolsa_failed", studentId: student.id, courseId: enrollmentCourseId },
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
      },
    })
  }

  let discountAmount = 0
  let finalAmount = basePrice
  let couponId: string | null = null

  // ── Desconto manual (sem cupom) ─────────────────────────────────────────
  // O vendedor digita o percentual na hora; o teto e o cap individual dele
  // (User.maxDiscount, padrao 50). So quem tem `vendas.descontoIlimitado`
  // passa sem teto — ver lib/coupons/sales-cap.ts.
  if (parsed.data.manualDiscountPercent) {
    const cap = await effectiveSalesCap(guard.ctx)
    if (parsed.data.manualDiscountPercent > cap + 0.01) {
      return NextResponse.json(
        { error: `Desconto excede seu cap (${cap}%)` },
        { status: 403 },
      )
    }
    const applied = applyCouponDiscount({
      basePrice,
      discountType: "PERCENTAGE",
      discountValue: parsed.data.manualDiscountPercent,
    })
    discountAmount = applied.discountAmount
    finalAmount = applied.finalAmount
  }

  // ── Venda de ASSINATURA ───────────────────────────────────────────────────
  // Sai aqui, antes de tudo que fala em matrícula: a assinatura não cria
  // nenhuma. As matrículas nascem sob demanda em `releaseSubscriptionCourse`,
  // uma por curso que o aluno abrir.
  //
  // Depois do gate do responsável financeiro e do teto de desconto de
  // propósito: as duas regras valem igual aqui — a cobrança recorrente de um
  // menor precisa sair no CPF do responsável tanto quanto a de um curso, e o
  // teto do vendedor não pode ser furado só porque o produto é outro.
  if (plan) {
    const sale = await createDirectSubscriptionSale({
      plan,
      student,
      // Vitrine principal PMB. `null` (e não o id do tenant placeholder) é o
      // que `assertPmbCharge` exige para liberar a conta-mãe.
      tenantId: null,
      soldByUserId: guard.ctx.userId,
      // O aluno paga na página da PMB (`(main)/pagar/assinatura/[id]`), sempre
      // pelo Asaas da conta-mãe — o mesmo gateway da assinatura contratada na
      // vitrine PMB (a recorrência do MP não emite PIX/boleto por ciclo).
      checkout: { gateway: "ASAAS", storeUrl: pmbAppUrl() },
      discountPercent: parsed.data.manualDiscountPercent,
    })
    if (!sale.ok) {
      return NextResponse.json(
        { error: sale.error, ...(sale.code ? { code: sale.code } : {}) },
        { status: sale.status },
      )
    }
    return NextResponse.json({
      data: {
        subscriptionId: sale.subscriptionId,
        gateway: "ASAAS",
        mode: "subscription_plan",
        planName: plan.name,
        interval: plan.interval,
        chargeLabel: sale.chargeLabel,
        recurring: sale.recurring,
        paymentUrl: sale.paymentUrl,
        finalAmount: sale.priceAtPurchase,
        discountAmount: sale.discountAmount,
        basePrice: sale.listPrice,
      },
    })
  }

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

    // Venda PMB: cupom e matrícula têm tenantId=null. Bloqueia cupom de revenda.
    assertCouponMatchesEnrollment({
      couponTenantId: coupon.tenantId,
      enrollmentTenantId: null,
      context: "admin.vendas.coupon",
    })

    // Cálculo unificado em Prisma.Decimal (mesmo helper das demais rotas) —
    // evita divergência de centavos entre o valor cobrado e os relatórios.
    //
    // SEM checagem de cap aqui: o cap do vendedor vale para GERAR desconto
    // (manual acima / criação de cupom em /api/admin/cupons) — aplicar um
    // cupom existente é livre, pois quem o criou já foi validado contra o
    // próprio cap (admin cria sem limite, de propósito).
    const applied = applyCouponDiscount({
      basePrice,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    })

    discountAmount = applied.discountAmount
    finalAmount = applied.finalAmount
    const reserved = await tryConsumeCoupon(coupon.id)
    if (!reserved) {
      return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 })
    }
    couponId = coupon.id
  }

  // Pacote é sempre pagamento único (rawPaymentType já vem "ONE_TIME").
  const isMonthly = rawPaymentType === "MONTHLY"
  const monthlyMonths = isMonthly ? monthlyMonthsMain ?? 12 : null

  // MP+MONTHLY agora suportado via preapproval (subscription)

  // Desconto sai do bolso de quem vende (aqui, a PMB), nunca do produtor.
  let splitSnapshot = gate.split
  if (splitSnapshot && discountAmount > 0) {
    const recomputed = await resolveSaleSplit({
      course: saleCourses[0],
      sellerTenantId: null,
      listPrice: basePrice,
      discount: discountAmount,
    })
    if (!recomputed.ok) {
      if (couponId) await releaseCoupon(couponId).catch(() => undefined)
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
      courseId: enrollmentCourseId,
      coursePackageId: enrollmentCoursePackageId,
      packagePrimary: isPackage,
      bundleCourseIds,
      soldByUserId: guard.ctx.userId,
      paymentType: rawPaymentType,
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

  // ── Desconto zerou o valor (cupom de 100% ou desconto manual integral) ────
  // Não há link de pagamento a gerar: libera o acesso na hora, pelo mesmo
  // caminho da bolsa. Sem isto o vendedor gerava um link que o gateway recusava.
  if (isFreeAmount(finalAmount)) {
    try {
      await releaseFreeEnrollment(pmbTenantContext(pmbTenant), enrollment.id)
    } catch (err) {
      await rollbackSaleEnrollment(enrollment.id).catch(
        swallow("admin.vendas.free.rollback"),
      )
      if (couponId) await releaseCoupon(couponId).catch(swallow("admin.vendas"))
      contextLogger().error(
        { err, event: "admin.vendas.free_failed", studentId: student.id },
        "liberacao de venda com desconto integral falhou",
      )
      return NextResponse.json(
        { error: "Falha ao matricular o aluno na plataforma de aulas. Tente novamente." },
        { status: 502 },
      )
    }
    return NextResponse.json({
      data: { enrollmentId: enrollment.id, scholarship: true, finalAmount: 0 },
    })
  }

  // ── Link de pagamento: a página da plataforma, nunca a do gateway ────────
  // Nada nasce no gateway aqui. O aluno escolhe o meio em `/pagar/<id>` no
  // domínio da PMB (Asaas: /api/checkout/enrollment/[id]; Mercado Pago:
  // /api/checkout/mp/process), igual ao `/pagar/<id>` da venda de unidade.
  // Antes a venda criava a fatura do Asaas (ou a preference/preapproval do MP)
  // e o vendedor mandava ao aluno a página do gateway.
  if (effectiveGateway === "MP" && !(await pmbMpAccessToken())) {
    await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("admin.vendas"))
    if (couponId) await releaseCoupon(couponId).catch(swallow("admin.vendas"))
    return NextResponse.json(
      { error: "Token Mercado Pago PMB não configurado" },
      { status: 503 },
    )
  }
  if (effectiveGateway === "ASAAS") {
    // Quem PAGA: com aluno menor, o responsavel financeiro. A página de
    // pagamento exige o CPF dele — recusar aqui evita mandar um link que não
    // consegue cobrar.
    const payer = resolvePayer(student)
    if (!payer.cpf || !student.cpf || !student.fone) {
      await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("admin.vendas"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("admin.vendas"))
      return NextResponse.json(
        {
          error: !payer.cpf && payer.kind === "GUARDIAN"
            ? "Responsável financeiro precisa ter CPF cadastrado para cobrança via Asaas"
            : "Aluno precisa ter CPF e telefone cadastrados para cobrança via Asaas",
        },
        { status: 400 },
      )
    }
  }

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { externalReference: `pmb_enr_${enrollment.id}` },
  })

  return NextResponse.json({
    data: {
      enrollmentId: enrollment.id,
      gateway: effectiveGateway,
      mode: isMonthly ? "subscription" : "one_time",
      installmentsTotal: monthlyMonths,
      paymentUrl: `${pmbAppUrl()}/pagar/${enrollment.id}`,
      finalAmount,
      discountAmount,
    },
  })
  },
)
