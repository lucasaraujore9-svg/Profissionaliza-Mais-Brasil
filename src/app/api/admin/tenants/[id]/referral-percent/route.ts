import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { canManageCommissions } from "@/lib/auth/roles"
import { logAudit } from "@/lib/audit"
import { sortTiers } from "@/lib/referrals/tiers"
import { sortBrackets } from "@/lib/referrals/rules"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const tierSchema = z.object({
  // null = "deste mes em diante" (sem teto). >=1 caso contrario.
  untilMonth: z.number().int().min(1).max(600).nullable(),
  percent: z.number().min(0).max(100),
})

const bracketSchema = z.object({
  upTo: z.number().int().min(1).nullable(),
  value: z.number().min(0),
})

const phaseSchema = z
  .object({
    durationMonths: z.number().int().min(1).max(600).nullable(),
    rateType: z.enum(["FIXED", "PERCENT"]),
    bracketBasis: z.enum(["NEW_REFERRALS_MONTH", "ACTIVE_UNITS"]),
    payoutBase: z.enum(["ALL_ACTIVE", "REFERRED_THIS_MONTH"]),
    brackets: z.array(bracketSchema).min(1).max(20),
  })
  .refine((p) => p.brackets.filter((b) => b.upTo === null).length <= 1, {
    message: "Apenas uma faixa pode ser 'sem teto' (upTo null)",
    path: ["brackets"],
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
    // Override do motor por faixas para ESTA unidade (null em cada campo =>
    // herda o padrao global de SystemSettings).
    commissionMode: z
      .enum(["PER_PAYMENT_PERCENT", "MONTHLY_TIERED"])
      .nullable()
      .optional(),
    commissionBracketBasis: z
      .enum(["NEW_REFERRALS_MONTH", "ACTIVE_UNITS"])
      .nullable()
      .optional(),
    commissionRateType: z.enum(["FIXED", "PERCENT"]).nullable().optional(),
    commissionPayoutBase: z
      .enum(["ALL_ACTIVE", "REFERRED_THIS_MONTH"])
      .nullable()
      .optional(),
    commissionBrackets: z.array(bracketSchema).max(20).nullable().optional(),
    // Plano MULTI-FASE override desta unidade (quando ela e a INDICADORA).
    // null/[] => sem plano (cai nas faixas singulares -> global).
    commissionPlan: z.array(phaseSchema).max(12).nullable().optional(),
    // Ancora do relogio de fases desta unidade quando indicada. ISO date ou null.
    commissionPlanStartedAt: z.string().datetime().nullable().optional(),
    // Acao explicita: limpa TODO o override de comissao (volta a herdar o global).
    clearCommissionOverride: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.percent !== undefined ||
      data.minReferrals !== undefined ||
      data.tiers !== undefined ||
      data.commissionMode !== undefined ||
      data.commissionBracketBasis !== undefined ||
      data.commissionRateType !== undefined ||
      data.commissionPayoutBase !== undefined ||
      data.commissionBrackets !== undefined ||
      data.commissionPlan !== undefined ||
      data.commissionPlanStartedAt !== undefined ||
      data.clearCommissionOverride !== undefined,
    { message: "Informe ao menos um campo para atualizar" },
  )
  .refine(
    (data) =>
      !data.commissionBrackets ||
      data.commissionBrackets.filter((b) => b.upTo === null).length <= 1,
    {
      message: "Apenas uma faixa pode ser 'sem teto' (upTo null)",
      path: ["commissionBrackets"],
    },
  )
  .refine(
    // Só a última fase pode ser "em diante" (durationMonths null).
    (data) =>
      !data.commissionPlan ||
      data.commissionPlan.slice(0, -1).every((p) => p.durationMonths !== null),
    {
      message:
        "Só a última fase pode ser 'em diante' (sem duração). Defina a duração das demais.",
      path: ["commissionPlan"],
    },
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
    select: {
      id: true,
      referralPercent: true,
      referralMinReferrals: true,
      commissionMode: true,
      commissionOverrideSource: true,
    },
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
  // Override do motor por faixas. Duas vias:
  //  - clearCommissionOverride: zera TUDO (volta a herdar o global, source null).
  //  - caso contrario: aplica os campos informados e marca a origem como MANUAL
  //    (preserva contra o "aplicar a todas" da regra global, que so limpa FROZEN).
  if (parsed.data.clearCommissionOverride) {
    data.commissionMode = null
    data.commissionBracketBasis = null
    data.commissionRateType = null
    data.commissionPayoutBase = null
    data.commissionBrackets = Prisma.DbNull
    data.commissionPlan = Prisma.DbNull
    data.commissionPlanStartedAt = null
    data.commissionOverrideSource = null
  } else {
    if (parsed.data.commissionMode !== undefined) {
      data.commissionMode = parsed.data.commissionMode
    }
    if (parsed.data.commissionBracketBasis !== undefined) {
      data.commissionBracketBasis = parsed.data.commissionBracketBasis
    }
    if (parsed.data.commissionRateType !== undefined) {
      data.commissionRateType = parsed.data.commissionRateType
    }
    if (parsed.data.commissionPayoutBase !== undefined) {
      data.commissionPayoutBase = parsed.data.commissionPayoutBase
    }
    if (parsed.data.commissionBrackets !== undefined) {
      data.commissionBrackets =
        parsed.data.commissionBrackets && parsed.data.commissionBrackets.length > 0
          ? (sortBrackets(parsed.data.commissionBrackets) as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull
    }
    if (parsed.data.commissionPlan !== undefined) {
      data.commissionPlan =
        parsed.data.commissionPlan && parsed.data.commissionPlan.length > 0
          ? ({
              phases: parsed.data.commissionPlan.map((p) => ({
                durationMonths: p.durationMonths,
                rateType: p.rateType,
                bracketBasis: p.bracketBasis,
                payoutBase: p.payoutBase,
                brackets: sortBrackets(p.brackets),
              })),
            } as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull
    }
    if (parsed.data.commissionPlanStartedAt !== undefined) {
      data.commissionPlanStartedAt =
        parsed.data.commissionPlanStartedAt === null
          ? null
          : new Date(parsed.data.commissionPlanStartedAt)
    }
    // Qualquer toque nos campos do motor por faixas marca o override como MANUAL.
    const touchedCommission =
      parsed.data.commissionMode !== undefined ||
      parsed.data.commissionBracketBasis !== undefined ||
      parsed.data.commissionRateType !== undefined ||
      parsed.data.commissionPayoutBase !== undefined ||
      parsed.data.commissionBrackets !== undefined ||
      parsed.data.commissionPlan !== undefined ||
      parsed.data.commissionPlanStartedAt !== undefined
    if (touchedCommission) {
      data.commissionOverrideSource = "MANUAL"
    }
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data,
    select: {
      id: true,
      referralPercent: true,
      referralMinReferrals: true,
      referralTiers: true,
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
      commissionPlan: true,
      commissionPlanStartedAt: true,
      commissionOverrideSource: true,
    },
  })

  // SAAS-001: trilha de auditoria da mudança de % / motor de comissão da unidade.
  await logAudit({
    action: "tenant.referral_percent.update",
    resource: "Tenant",
    resourceId: id,
    actorUserId: session.userId,
    actorRole: session.role,
    tenantId: id,
    payloadBefore: {
      referralPercent:
        tenant.referralPercent != null ? Number(tenant.referralPercent) : null,
      referralMinReferrals: tenant.referralMinReferrals ?? null,
      commissionMode: tenant.commissionMode,
      commissionOverrideSource: tenant.commissionOverrideSource,
    },
    payloadAfter: {
      referralPercent:
        updated.referralPercent != null ? Number(updated.referralPercent) : null,
      referralMinReferrals: updated.referralMinReferrals ?? null,
      commissionMode: updated.commissionMode,
      commissionOverrideSource: updated.commissionOverrideSource,
      clearCommissionOverride: parsed.data.clearCommissionOverride ?? false,
    },
  })

  return NextResponse.json({
    data: {
      id: updated.id,
      referralPercent:
        updated.referralPercent != null ? Number(updated.referralPercent) : null,
      referralMinReferrals: updated.referralMinReferrals ?? null,
      referralTiers: updated.referralTiers ?? null,
      commissionMode: updated.commissionMode,
      commissionBracketBasis: updated.commissionBracketBasis,
      commissionRateType: updated.commissionRateType,
      commissionPayoutBase: updated.commissionPayoutBase,
      commissionBrackets: updated.commissionBrackets,
      commissionPlan: updated.commissionPlan,
      commissionPlanStartedAt: updated.commissionPlanStartedAt
        ? updated.commissionPlanStartedAt.toISOString()
        : null,
      commissionOverrideSource: updated.commissionOverrideSource,
    },
  })
  },
)

