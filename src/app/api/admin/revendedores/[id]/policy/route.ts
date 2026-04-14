import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { invalidateTenant } from "@/lib/redis/tenant-cache"

const schema = z.object({
  billingMode: z.enum(["AUTO", "MANUAL"]).optional(),
  cancellationPolicy: z
    .object({
      gracePeriodDays: z.number().int().min(0).max(365).optional(),
      keepStudentsActive: z.boolean().optional(),
      notifyStudents: z.boolean().optional(),
    })
    .nullable()
    .optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true, customDomain: true },
  })

  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  const data: Prisma.TenantUpdateInput = {}

  if (parsed.data.billingMode !== undefined) data.billingMode = parsed.data.billingMode
  if (parsed.data.cancellationPolicy !== undefined) {
    data.cancellationPolicy =
      parsed.data.cancellationPolicy === null
        ? Prisma.JsonNull
        : parsed.data.cancellationPolicy
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data,
    select: { billingMode: true, cancellationPolicy: true },
  })

  await invalidateTenant(tenant)

  return NextResponse.json({
    data: {
      billingMode: updated.billingMode,
      cancellationPolicy: updated.cancellationPolicy,
    },
  })
}
