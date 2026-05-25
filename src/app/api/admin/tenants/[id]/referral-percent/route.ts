import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  // Permite null para "voltar ao percentual padrao"
  percent: z.number().min(0).max(100).nullable(),
})

export const PUT = withRequestContextParams<{ id: string }>(
  { action: "admin.tenants.referral_percent.update", route: "/api/admin/tenants/[id]/referral-percent" },
  async (request: Request, context) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 })
  }

  const { id } = await context.params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados invalidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: "Tenant nao encontrado" }, { status: 404 })
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      referralPercent:
        parsed.data.percent === null
          ? null
          : new Prisma.Decimal(parsed.data.percent),
    },
    select: { id: true, referralPercent: true },
  })

  return NextResponse.json({
    data: {
      id: updated.id,
      referralPercent:
        updated.referralPercent != null ? Number(updated.referralPercent) : null,
    },
  })
  },
)

