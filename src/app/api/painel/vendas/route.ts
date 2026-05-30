import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { auth } from "@/lib/auth"
import {
  createPreference,
  createPreapproval,
  decryptTenantMpToken,
} from "@/lib/mercadopago/client"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { upsertStudent, StudentEmailConflictError } from "@/lib/students/upsert"
import { fulfillScholarshipEnrollment } from "@/lib/enrollment/fulfill"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"

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

  // Curso a vender (TenantCourse do próprio tenant)
  tenantCourseId: z.string().min(1),
  couponCode: z.string().trim().max(64).optional(),
  // Bolsa de estudo: matricula sem cobranca no Mercado Pago.
  bolsista: z.boolean().optional(),
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
        name: true,
        status: true,
        mpAccessToken: true,
        plataformaVendedorId: true,
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
    // Bolsa nao usa gateway — so exigimos Mercado Pago em vendas com cobranca.
    if (!isBolsista && !tenant.mpAccessToken) {
      return NextResponse.json(
        { error: "Conecte o Mercado Pago em /painel/configuracoes" },
        { status: 503 },
      )
    }

    const tenantCourse = await prisma.tenantCourse.findFirst({
      where: { id: data.tenantCourseId, tenantId: tenant.id, isVisible: true },
      include: {
        course: {
          select: { id: true, nome: true, slug: true, monthlyMonthsMain: true },
        },
      },
    })
    if (!tenantCourse) {
      return NextResponse.json(
        { error: "Curso não encontrado na sua vitrine" },
        { status: 404 },
      )
    }

    const basePrice = Number(tenantCourse.price)
    if (basePrice <= 0) {
      return NextResponse.json(
        { error: "Curso sem preço configurado" },
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
    if (!isBolsista && data.couponCode) {
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
        polo: tenant.slug,
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

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: tenantCourse.courseId,
        tenantId: tenant.id,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: { id: true, status: true },
    })
    if (existingEnrollment) {
      if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas"))
      return NextResponse.json(
        {
          error:
            existingEnrollment.status === "PENDING"
              ? "Este aluno já tem uma cobrança pendente para este curso"
              : "Este aluno já possui este curso ativo",
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
          tenantCourseId: tenantCourse.id,
          courseId: tenantCourse.courseId,
          soldByUserId: userId,
          paymentType: tenantCourse.paymentType,
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

    const isMonthly = tenantCourse.paymentType === "MONTHLY"
    const monthlyMonths = isMonthly
      ? tenantCourse.course.monthlyMonthsMain ?? 12
      : null

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        tenantCourseId: tenantCourse.id,
        courseId: tenantCourse.courseId,
        soldByUserId: userId,
        paymentType: tenantCourse.paymentType,
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
    // Re-checagem para narrowing: o guard de mpAccessToken acima e condicional
    // (bolsa pula), mas a bolsa ja retornou antes daqui — entao o token existe.
    if (!tenant.mpAccessToken) {
      await prisma.enrollment.delete({ where: { id: enrollment.id } }).catch(swallow("painel.vendas.rollback"))
      if (couponId) await releaseCoupon(couponId).catch(swallow("painel.vendas.rollback"))
      return NextResponse.json(
        { error: "Conecte o Mercado Pago em /painel/configuracoes" },
        { status: 503 },
      )
    }
    const accessToken = decryptTenantMpToken(tenant.mpAccessToken)

    // Wrapper try/catch obrigatório: ver explicação na rota /api/aluno/comprar.
    // Sem isso, falha de MP (5xx, timeout) deixa enrollment PENDING órfã +
    // cupom com usedCount inflado pra sempre.
    try {
      if (isMonthly && monthlyMonths) {
        const startDate = new Date(Date.now() + 60_000).toISOString()
        const endDate = new Date(
          Date.now() +
            monthlyMonths * 31 * 24 * 60 * 60 * 1000 +
            3 * 24 * 60 * 60 * 1000,
        ).toISOString()

        const preapproval = await createPreapproval(accessToken, {
          reason: `Mensalidade — ${tenantCourse.course.nome}`,
          external_reference: externalReference,
          payer_email: student.email ?? data.email,
          back_url: `${appUrl || `https://${process.env.NEXT_PUBLIC_APP_DOMAIN ?? "profissionalizamaisbrasil.com.br"}`}/painel/vendas?ok=${enrollment.id}`,
          notification_url: appUrl
            ? `${appUrl}/api/webhooks/mercadopago?tenant=${tenant.slug}`
            : undefined,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: finalAmount,
            currency_id: "BRL",
            start_date: startDate,
            end_date: endDate,
          },
          status: "pending",
        })

        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { mpSubscriptionId: preapproval.id, externalReference },
        })

        return NextResponse.json({
          data: {
            enrollmentId: enrollment.id,
            mode: "subscription",
            installmentsTotal: monthlyMonths,
            initPoint: preapproval.init_point,
            finalAmount,
            discountAmount,
            basePrice,
            studentId: student.id,
          },
        })
      }

      const preference = await createPreference(accessToken, {
        items: [
          {
            id: tenantCourse.course.id,
            title: tenantCourse.course.nome,
            quantity: 1,
            unit_price: finalAmount,
            currency_id: "BRL",
          },
        ],
        payer: {
          name: student.nome,
          email: student.email ?? data.email,
          identification: student.cpf
            ? { type: "CPF", number: student.cpf }
            : undefined,
        },
        back_urls: appUrl
          ? {
              success: `${appUrl}/painel/vendas?ok=${enrollment.id}`,
              failure: `${appUrl}/painel/vendas?err=${enrollment.id}`,
              pending: `${appUrl}/painel/vendas?pend=${enrollment.id}`,
            }
          : undefined,
        auto_return: "approved",
        external_reference: externalReference,
        notification_url: appUrl ? `${appUrl}/api/webhooks/mercadopago?tenant=${tenant.slug}` : undefined,
      })

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { mpPreferenceId: preference.id, externalReference },
      })

      return NextResponse.json({
        data: {
          enrollmentId: enrollment.id,
          mode: "one_time",
          initPoint: preference.init_point,
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
