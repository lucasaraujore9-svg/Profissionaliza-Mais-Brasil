import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

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

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.policy.update", route: "/api/admin/revendedores/[id]/policy" },
  async (request: Request, { params }) => {
  // billingMode e política de cancelamento afetam a cobrança e o auto-block de
  // inadimplência: é decisão de contrato, não de operação da carteira — daí
  // `unidades.governanca` (e não `unidades.manage`, que o gerente de unidades
  // tem para administrar as unidades atribuídas a ele).
  const guard = await requireAdmin("unidades.governanca")
  if (!guard.ok) return guard.response

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
  },
)
