import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { effectiveSalesCap } from "@/lib/coupons/sales-cap"

const schema = z.object({
  code: z.string().trim().min(1).max(64),
  courseId: z.string().min(1),
})

export const POST = withRequestContext(
  { action: "admin.cupons.validate", route: "/api/admin/cupons/validate" },
  async (request: Request) => {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const course = await prisma.course.findUnique({
    where: { id: parsed.data.courseId },
    select: { precoVitrineMain: true, precoPromocional: true, precoOriginal: true, status: true },
  })
  if (!course || course.status !== "ATIVO") {
    return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
  }

  const basePrice = Number(course.precoVitrineMain ?? course.precoPromocional ?? course.precoOriginal ?? 0)
  if (basePrice <= 0) {
    return NextResponse.json({ error: "Curso sem preço configurado" }, { status: 400 })
  }

  const now = new Date()
  const coupon = await prisma.coupon.findFirst({
    where: {
      tenantId: null,
      code: parsed.data.code.toUpperCase(),
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
  })

  if (!coupon) {
    return NextResponse.json({ error: "Cupom inválido ou expirado" }, { status: 400 })
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 })
  }

  const raw =
    coupon.discountType === "PERCENTAGE"
      ? (basePrice * Number(coupon.discountValue)) / 100
      : Number(coupon.discountValue)
  const discountAmount = Math.min(raw, basePrice)
  const finalAmount = Number((basePrice - discountAmount).toFixed(2))

  // Mesma regra da rota de venda: cap sobre o desconto EFETIVO (cobre
  // PERCENTAGE e FIXED) — preview e cobrança nunca divergem.
  const cap = await effectiveSalesCap(guard.session)
  const effectivePct = (discountAmount / basePrice) * 100
  if (effectivePct > cap + 0.01) {
    return NextResponse.json(
      { error: `Cupom excede seu limite de desconto (${cap}%)` },
      { status: 403 },
    )
  }

  return NextResponse.json({
    data: {
      valid: true,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      discountAmount,
      basePrice,
      finalAmount,
    },
  })
  },
)
