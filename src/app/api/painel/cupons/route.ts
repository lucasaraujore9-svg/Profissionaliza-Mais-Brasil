import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

export const GET = withRequestContext(
  { action: "painel.cupons.list", route: "/api/painel/cupons" },
  async () => {
    const guard = await requirePainel("cupons.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

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
  },
)

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

export const POST = withRequestContext(
  { action: "painel.cupons.create", route: "/api/painel/cupons" },
  async (request: Request) => {
    const guard = await requirePainel("cupons.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

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

    // Cap de desconto para consultor (TenantMember com maxDiscount)
    const membership = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
      select: { role: true, maxDiscount: true, status: true },
    })
    if (
      membership &&
      membership.role === "consultant" &&
      membership.status === "ATIVO" &&
      membership.maxDiscount !== null
    ) {
      if (parsed.data.discountType === "FIXED") {
        return NextResponse.json(
          {
            error: `Consultor com cap de ${membership.maxDiscount}% só pode criar cupom percentual`,
          },
          { status: 403 },
        )
      }
      if (parsed.data.discountValue > membership.maxDiscount) {
        return NextResponse.json(
          { error: `Seu cap de desconto é ${membership.maxDiscount}%` },
          { status: 403 },
        )
      }
    }

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
        createdByUserId: ctx.userId,
        createdByRole: "RESELLER",
      },
    })

    // SAAS-001: trilha de auditoria da criação de cupom do revendedor.
    await logAudit({
      action: "coupon.create",
      resource: "Coupon",
      resourceId: coupon.id,
      actorUserId: ctx.userId,
      actorRole: "RESELLER",
      tenantId: ctx.tenantId,
      payloadAfter: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        maxUses: coupon.maxUses,
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
  },
)
