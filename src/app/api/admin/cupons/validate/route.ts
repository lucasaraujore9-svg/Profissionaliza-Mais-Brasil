import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { MAX_SALE_COURSES, dedupeIds } from "@/lib/enrollment/multi-course"

const schema = z.object({
  code: z.string().trim().min(1).max(64),
  // Prévia do desconto sobre UM OU MAIS cursos: a venda direta multi-curso cobra
  // a soma dos preços numa cobrança só, então o cupom (sobretudo o FIXED) tem
  // que ser calculado sobre o mesmo total que será cobrado.
  courseIds: z.array(z.string().min(1)).min(1).max(MAX_SALE_COURSES),
})

export const POST = withRequestContext(
  { action: "admin.cupons.validate", route: "/api/admin/cupons/validate" },
  async (request: Request) => {
  const guard = await requireAdmin("cupons.view")
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

  const courseIds = dedupeIds(parsed.data.courseIds)
  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { precoVitrineMain: true, precoPromocional: true, precoOriginal: true, status: true },
  })
  if (courses.length !== courseIds.length || courses.some((c) => c.status !== "ATIVO")) {
    return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
  }

  // Mesmo total que a venda vai cobrar: a soma dos preços dos cursos escolhidos.
  const basePrice =
    Math.round(
      courses.reduce(
        (sum, c) =>
          sum + Number(c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal ?? 0),
        0,
      ) * 100,
    ) / 100
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

  // SEM checagem de cap: aplicar cupom existente é livre para qualquer
  // vendedor (o cap vale na CRIAÇÃO do cupom e no desconto manual da venda).
  // Espelha /api/admin/vendas — preview e cobrança nunca divergem.
  const raw =
    coupon.discountType === "PERCENTAGE"
      ? (basePrice * Number(coupon.discountValue)) / 100
      : Number(coupon.discountValue)
  const discountAmount = Math.min(raw, basePrice)
  const finalAmount = Number((basePrice - discountAmount).toFixed(2))

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
