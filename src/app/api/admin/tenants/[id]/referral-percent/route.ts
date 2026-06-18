import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { canManageCommissions } from "@/lib/auth/roles"
import { sortTiers } from "@/lib/referrals/tiers"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const tierSchema = z.object({
  // null = "deste mes em diante" (sem teto). >=1 caso contrario.
  untilMonth: z.number().int().min(1).max(600).nullable(),
  percent: z.number().min(0).max(100),
})

const bodySchema = z
  .object({
    // Permite null para "voltar ao percentual padrao".
    percent: z.number().min(0).max(100).nullable().optional(),
    // Minimo de indicacoes ATIVAS para a unidade receber comissao de
    // recorrencia. null = volta ao padrao global. 0 = sem minimo.
    minReferrals: z.number().int().min(0).max(1000).nullable().optional(),
    // Escala de comissao desta unidade (quando indicada). [] ou null limpam a
    // escala (volta ao percentual fixo). Max 12 faixas.
    tiers: z.array(tierSchema).max(12).nullable().optional(),
  })
  .refine(
    (data) =>
      data.percent !== undefined ||
      data.minReferrals !== undefined ||
      data.tiers !== undefined,
    { message: "Informe percent, minReferrals e/ou tiers" },
  )

export const PUT = withRequestContextParams<{ id: string }>(
  { action: "admin.tenants.referral_percent.update", route: "/api/admin/tenants/[id]/referral-percent" },
  async (request: Request, context) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
  }
  if (!canManageCommissions(session.role)) {
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

  const data: Prisma.TenantUpdateInput = {}
  if (parsed.data.percent !== undefined) {
    data.referralPercent =
      parsed.data.percent === null
        ? null
        : new Prisma.Decimal(parsed.data.percent)
  }
  if (parsed.data.minReferrals !== undefined) {
    data.referralMinReferrals = parsed.data.minReferrals
  }
  if (parsed.data.tiers !== undefined) {
    // null ou [] => limpa a escala. Caso contrario, persiste normalizado/ordenado.
    data.referralTiers =
      parsed.data.tiers && parsed.data.tiers.length > 0
        ? (sortTiers(parsed.data.tiers) as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data,
    select: {
      id: true,
      referralPercent: true,
      referralMinReferrals: true,
      referralTiers: true,
    },
  })

  return NextResponse.json({
    data: {
      id: updated.id,
      referralPercent:
        updated.referralPercent != null ? Number(updated.referralPercent) : null,
      referralMinReferrals: updated.referralMinReferrals ?? null,
      referralTiers: updated.referralTiers ?? null,
    },
  })
  },
)

