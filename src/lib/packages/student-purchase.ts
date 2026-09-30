import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardianRequirement, hasGuardian } from "@/lib/students/guardian"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { tryConsumeCoupon, releaseCoupon } from "@/lib/coupons/consume"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { assertCouponMatchesEnrollment } from "@/lib/checkout/assert-tenant-gateway"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { resolveSaleGateway } from "@/lib/checkout/sale-gateway"
import { getPackageForCheckout } from "@/lib/packages/vitrine"
import {
  isFreeAmount,
  releaseFreeEnrollment,
  resellerTenantContext,
} from "@/lib/checkout/free-enrollment"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"

/**
 * COMBO (pacote) comprado pelo aluno JÁ LOGADO, na loja da unidade dele.
 *
 * Existia só o checkout anônimo (`/api/loja/checkout/package`), que recusa CPF
 * com login ("faça login para concluir a compra") e manda o aluno para a área
 * dele — onde não havia combo nenhum. Quem já tinha cadastro não comprava combo
 * em lugar nenhum (chamado Capacita Pró Brasil, 30/09).
 *
 * Mesmas regras daquele checkout — preço do escopo (`getPackageForCheckout`),
 * matrícula PRIMÁRIA que carrega a cobrança (as satélites nascem no fulfill),
 * cupom da unidade, cupom de 100% liberado sem gateway, PENDING reaproveitada —
 * trocando só a origem do aluno: a SESSÃO, sem upsert nem dados de convidado.
 * Como a recompra de curso, NÃO recoleta dados: menor sem responsável na ficha
 * é recusado, senão a cobrança sairia no CPF da criança.
 */

export interface StudentPackageTenant {
  id: string
  slug: string
  name: string
  status: string
  mpAccessToken: string | null
  mpPublicKey: string | null
  plataformaVendedorId: string | null
  salesGateway: "MP" | "ASAAS"
  asaasConnected: boolean
  asaasWebhookToken: string | null
}

export async function startStudentPackagePurchase(input: {
  tenant: StudentPackageTenant
  studentId: string
  packageId: string
  couponCode?: string
}): Promise<NextResponse> {
  const { tenant, studentId } = input
  const tenantId = tenant.id
  let consumedCouponId: string | null = null
  let createdEnrollmentId: string | null = null

  try {
    if (tenant.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Esta loja não está aceitando vendas no momento", code: "TENANT_INACTIVE" },
        { status: 403 },
      )
    }

    const [student, pkg] = await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: { ...PAYER_SELECT, nascimento: true },
      }),
      getPackageForCheckout(tenantId, input.packageId),
    ])
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    if (!pkg) {
      return NextResponse.json(
        { error: "Combo não encontrado", code: "PACKAGE_NOT_FOUND" },
        { status: 404 },
      )
    }
    if (!student.email) {
      return NextResponse.json(
        { error: "Cadastre seu email no perfil antes de comprar" },
        { status: 400 },
      )
    }
    if (guardianRequirement(student.nascimento) === "REQUIRED" && !hasGuardian(student)) {
      return NextResponse.json(
        {
          error:
            "Cadastro incompleto: aluno menor de 18 anos precisa de responsável financeiro. Fale com a sua unidade para completar o cadastro.",
          code: "GUARDIAN_REQUIRED",
        },
        { status: 400 },
      )
    }
    const payer = resolvePayer(student)

    const basePrice = pkg.price
    const primaryCourse = pkg.courses[0]

    let discountAmount = 0
    let finalAmount = basePrice
    let couponToReserve: string | null = null
    if (input.couponCode) {
      const now = new Date()
      const coupon = await prisma.coupon.findFirst({
        where: {
          tenantId,
          code: input.couponCode.toUpperCase(),
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
      assertCouponMatchesEnrollment({
        couponTenantId: coupon.tenantId,
        enrollmentTenantId: tenantId,
        context: "aluno.comprar.package.coupon",
      })
      const calc = applyCouponDiscount({
        basePrice,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      })
      discountAmount = calc.discountAmount
      finalAmount = calc.finalAmount
      couponToReserve = coupon.id
    }

    // Gateway DEPOIS do desconto: cupom de 100% não vai a gateway nenhum.
    const gatewayGate = resolveSaleGateway({
      mode: tenantCheckoutMode({
        salesGateway: tenant.salesGateway,
        asaasConnected: tenant.asaasConnected,
        mpAccessToken: tenant.mpAccessToken,
        mpPublicKey: tenant.mpPublicKey,
      }),
      salesGateway: tenant.salesGateway,
      asaasWebhookToken: tenant.asaasWebhookToken,
      finalAmount,
    })
    if (!gatewayGate.ok) {
      return NextResponse.json(
        { error: gatewayGate.error, code: gatewayGate.code },
        { status: gatewayGate.status },
      )
    }
    const gateway = gatewayGate.gateway
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

    // Reserva atômica DEPOIS dos gates: recusar com a reserva feita queimaria um uso.
    let couponId: string | null = null
    if (couponToReserve) {
      if (!(await tryConsumeCoupon(couponToReserve))) {
        return NextResponse.json({ error: "Cupom esgotado", code: "COUPON_EXHAUSTED" }, { status: 400 })
      }
      couponId = couponToReserve
      consumedCouponId = couponToReserve
    }

    // Combo já comprado bloqueia; compra PENDENTE é reaproveitada (é assim que
    // o aluno aplica um cupom que esqueceu).
    const existing = await prisma.enrollment.findFirst({
      where: {
        studentId,
        coursePackageId: pkg.id,
        packagePrimary: true,
        tenantId,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: { id: true, status: true, couponId: true, finalAmount: true },
    })
    if (existing && existing.status !== "PENDING") {
      if (consumedCouponId) {
        await releaseCoupon(consumedCouponId).catch(swallow("aluno.comprar.package"))
        consumedCouponId = null
      }
      return NextResponse.json(
        { error: "Você já possui este combo", code: "DUPLICATE_PACKAGE" },
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
        await releaseCoupon(consumedCouponId).catch(swallow("aluno.comprar.package"))
      }
      // O cupom já está gravado na matrícula: devolvê-lo num erro abaixo
      // descontaria um uso que segue vinculado a uma venda viva.
      consumedCouponId = null
      if (isFreeAmount(reusedAmount)) {
        await releaseFreeEnrollment(resellerTenantContext(tenant), existing.id)
        return NextResponse.json({ data: { enrollmentId: existing.id, free: true } })
      }
      return NextResponse.json({ data: { enrollmentId: existing.id } })
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId,
        studentId,
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
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { externalReference: `enr_${enrollment.id}` },
    })

    if (isFreeAmount(finalAmount)) {
      await releaseFreeEnrollment(resellerTenantContext(tenant), enrollment.id)
      consumedCouponId = null
      return NextResponse.json({ data: { enrollmentId: enrollment.id, free: true } })
    }
    return NextResponse.json({ data: { enrollmentId: enrollment.id } })
  } catch (err) {
    contextLogger().error(
      { err, event: "aluno.comprar.package_failed", tenantId, studentId },
      "compra de combo pelo aluno logado falhou",
    )
    if (createdEnrollmentId) {
      await prisma.enrollment
        .delete({ where: { id: createdEnrollmentId } })
        .catch(swallow("aluno.comprar.package.rollback"))
    }
    if (consumedCouponId) {
      await releaseCoupon(consumedCouponId).catch(swallow("aluno.comprar.package"))
    }
    return NextResponse.json({ error: "Erro ao iniciar a compra" }, { status: 500 })
  }
}
