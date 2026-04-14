import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const bodySchema = z.object({
  code: z.string().trim().min(1).max(64).transform((v) => v.toUpperCase()),
  courseId: z.string().cuid(),
})

export async function POST(request: Request) {
  const tenantId = request.headers.get("x-tenant-id")

  if (!tenantId) {
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

  const { code, courseId } = parsed.data

  try {
    const tenantCourse = await prisma.tenantCourse.findFirst({
      where: { id: courseId, tenantId, isVisible: true },
      select: { id: true, price: true },
    })

    if (!tenantCourse) {
      return NextResponse.json(
        { error: "Curso não encontrado nesta loja", code: "COURSE_NOT_FOUND" },
        { status: 404 },
      )
    }

    const now = new Date()
    const coupon = await prisma.coupon.findFirst({
      where: {
        tenantId,
        code,
        isActive: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        maxUses: true,
        usedCount: true,
      },
    })

    if (!coupon) {
      return NextResponse.json(
        {
          error: "Cupom inválido ou expirado",
          code: "COUPON_INVALID",
        },
        { status: 400 },
      )
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json(
        { error: "Cupom esgotado", code: "COUPON_EXHAUSTED" },
        { status: 400 },
      )
    }

    const basePrice = Number(tenantCourse.price)
    const discountValue = Number(coupon.discountValue)
    let discountAmount = 0

    if (coupon.discountType === "PERCENTAGE") {
      discountAmount = (basePrice * discountValue) / 100
    } else {
      discountAmount = discountValue
    }

    discountAmount = Math.min(discountAmount, basePrice)
    const finalPrice = Math.max(0, basePrice - discountAmount)

    return NextResponse.json({
      data: {
        valid: true,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue,
        discountAmount: Number(discountAmount.toFixed(2)),
        basePrice,
        finalPrice: Number(finalPrice.toFixed(2)),
      },
    })
  } catch (error) {
    console.error("[validar-cupom] error:", error)
    return NextResponse.json(
      { error: "Erro interno", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
}
