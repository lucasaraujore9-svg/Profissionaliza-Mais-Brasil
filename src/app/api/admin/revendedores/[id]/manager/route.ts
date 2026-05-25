import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const schema = z.object({
  managerId: z.string().nullable(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.manager.update", route: "/api/admin/revendedores/[id]/manager" },
  async (req: Request, ctx) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  if (parsed.data.managerId) {
    const mgr = await prisma.user.findUnique({
      where: { id: parsed.data.managerId },
      select: { role: true, status: true },
    })
    if (!mgr || mgr.role !== "PMB_RESELLER_MGR" || mgr.status !== "ATIVO") {
      return NextResponse.json(
        { error: "Gerente inválido ou inativo" },
        { status: 400 },
      )
    }
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: { accountManagerId: parsed.data.managerId },
    select: {
      id: true,
      accountManagerId: true,
      accountManager: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ data: updated })
  },
)
