import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"

const PMB_SALES_CAP = 50

export async function GET() {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  const where =
    guard.session.role === "SUPER_ADMIN"
      ? { tenantId: null }
      : { tenantId: null, createdByUserId: guard.session.userId }

  const coupons = await prisma.coupon.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      createdByUser: { select: { name: true } },
    },
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
      createdByRole: c.createdByRole,
      createdByName: c.createdByUser?.name ?? null,
    })),
  })
}

const createSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Z0-9_-]+$/i, "Use apenas letras, números, _ ou -"),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    discountValue: z.number().positive(),
    maxUses: z.number().int().positive().nullable().optional(),
    validFrom: z.string().min(1),
    validUntil: z.string().min(1),
  })
  .refine(
    (d) => d.discountType !== "PERCENTAGE" || d.discountValue <= 100,
    { message: "Percentual deve ser <= 100", path: ["discountValue"] },
  )
  .refine(
    (d) => new Date(d.validUntil) >= new Date(d.validFrom),
    { message: "Data final antes do início", path: ["validUntil"] },
  )

export async function POST(request: Request) {
  const guard = await requirePmbSales()
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

  if (guard.session.role === "PMB_SALES") {
    if (parsed.data.discountType === "FIXED") {
      return NextResponse.json(
        {
          error: `PMB_SALES só pode criar cupons percentuais (cap ${PMB_SALES_CAP}%)`,
        },
        { status: 403 },
      )
    }
    if (parsed.data.discountValue > PMB_SALES_CAP) {
      return NextResponse.json(
        { error: `Seu cap de desconto é ${PMB_SALES_CAP}%` },
        { status: 403 },
      )
    }
  }

  const code = parsed.data.code.toUpperCase()

  const existing = await prisma.coupon.findFirst({
    where: { tenantId: null, code },
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
      tenantId: null,
      code,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      maxUses: parsed.data.maxUses ?? null,
      validFrom: new Date(parsed.data.validFrom),
      validUntil: new Date(parsed.data.validUntil),
      isActive: true,
      createdByUserId: guard.session.userId,
      createdByRole: guard.session.role,
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
