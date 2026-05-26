import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  code: z.string().trim().min(1).max(64).transform((v) => v.toUpperCase()),
  courseId: z.string().cuid(),
})

export const POST = withRequestContext(
  { action: "loja.cupom.validate", route: "/api/loja/cupom/validar" },
  async (request: Request) => {
  const rl = await rateLimit(request, RATE_LIMITS.publicCupom)
  if (!rl.ok) return rateLimitResponse(rl)

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
    // Busca o cupom sem filtrar isActive/validade para que possamos diferenciar
    // mensagens de erro (cupom desativado vs expirado vs nunca existiu).
    // Antes: filtrava tudo e devolvia "inválido ou expirado" — UX ruim porque
    // o usuário não sabia se era digitação ou link velho.
    const coupon = await prisma.coupon.findFirst({
      where: { tenantId, code },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        maxUses: true,
        usedCount: true,
        isActive: true,
        validFrom: true,
        validUntil: true,
      },
    })

    if (!coupon) {
      return NextResponse.json(
        { error: "Cupom não encontrado. Confira a digitação.", code: "COUPON_NOT_FOUND" },
        { status: 400 },
      )
    }

    if (!coupon.isActive) {
      return NextResponse.json(
        { error: "Este cupom foi desativado pela loja.", code: "COUPON_INACTIVE" },
        { status: 400 },
      )
    }

    if (coupon.validFrom > now) {
      return NextResponse.json(
        {
          error: `Cupom ainda não está válido (começa em ${coupon.validFrom.toLocaleDateString("pt-BR")}).`,
          code: "COUPON_NOT_YET_VALID",
        },
        { status: 400 },
      )
    }

    if (coupon.validUntil < now) {
      return NextResponse.json(
        {
          error: `Este cupom expirou em ${coupon.validUntil.toLocaleDateString("pt-BR")}.`,
          code: "COUPON_EXPIRED",
        },
        { status: 400 },
      )
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json(
        { error: "Cupom esgotado — todas as utilizações já foram usadas.", code: "COUPON_EXHAUSTED" },
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
    contextLogger().error(
      { err: error, event: "loja.cupom.validar_failed" },
      "validação de cupom falhou",
    )
    return NextResponse.json(
      { error: "Erro interno", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
  },
)
