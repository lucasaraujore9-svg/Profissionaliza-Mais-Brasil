import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"

export async function GET() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const coupons = await prisma.coupon.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    data: coupons.map((c) => ({
      id: c.id,
      code: c.code,
      discountType: c.discountType,
      discountValue: Number(c.discountValue),
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      validFrom: c.validFrom.toISOString(),
      validUntil: c.validUntil.toISOString(),
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
    })),
  })
}

const createSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "Código precisa ter 3 caracteres")
      .max(32, "Código muito longo")
      .regex(/^[A-Z0-9_-]+$/i, "Use apenas letras, números, _ ou -"),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    discountValue: z.number().positive("Valor deve ser positivo"),
    maxUses: z.number().int().positive().nullable().optional(),
    validFrom: z.string().datetime().or(z.string().min(1)),
    validUntil: z.string().datetime().or(z.string().min(1)),
  })
  .refine(
    (data) =>
      data.discountType !== "PERCENTAGE" || data.discountValue <= 100,
    { message: "Percentual deve ser <= 100", path: ["discountValue"] },
  )
  .refine(
    (data) => new Date(data.validUntil) >= new Date(data.validFrom),
    { message: "Data final antes do início", path: ["validUntil"] },
  )

export async function POST(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const code = parsed.data.code.toUpperCase()

  const existing = await prisma.coupon.findUnique({
    where: { tenantId_code: { tenantId: ctx.tenantId, code } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      { error: "Já existe um cupom com esse código" },
      { status: 409 },
    )
  }

  const coupon = await prisma.coupon.create({
    data: {
      tenantId: ctx.tenantId,
      code,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      maxUses: parsed.data.maxUses ?? null,
      validFrom: new Date(parsed.data.validFrom),
      validUntil: new Date(parsed.data.validUntil),
      isActive: true,
    },
  })

  return NextResponse.json({
    data: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      maxUses: coupon.maxUses,
      usedCount: coupon.usedCount,
      validFrom: coupon.validFrom.toISOString(),
      validUntil: coupon.validUntil.toISOString(),
      isActive: coupon.isActive,
    },
  })
}
