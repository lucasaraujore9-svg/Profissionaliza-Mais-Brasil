import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { sortBrackets } from "@/lib/referrals/rules"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bracketSchema = z.object({
  upTo: z.number().int().min(1).nullable(),
  value: z.number().min(0),
})

const bodySchema = z.object({
  referralEnabled: z.boolean(),
  defaultReferralPercent: z.number().min(0).max(100),
  referralMinPayout: z.number().min(0).max(100000),
  // Máx. 20: o cron de liberação roda no dia 20 (prisma/sql/pg_cron_jobs.sql).
  // availableAt > dia 20 só seria liberado no cron do mês seguinte. Manter <= 20
  // garante liberação no mesmo ciclo (vale p/ motor legado e por faixas).
  referralPayoutDay: z.number().int().min(1).max(20),
  // Motor de comissao por faixas (regra global).
  commissionMode: z.enum(["PER_PAYMENT_PERCENT", "MONTHLY_TIERED"]),
  commissionBracketBasis: z.enum(["NEW_REFERRALS_MONTH", "ACTIVE_UNITS"]),
  commissionRateType: z.enum(["FIXED", "PERCENT"]),
  commissionPayoutBase: z.enum(["ALL_ACTIVE", "REFERRED_THIS_MONTH"]),
  commissionBrackets: z.array(bracketSchema).max(20),
}).refine(
  (d) => d.commissionBrackets.filter((b) => b.upTo === null).length <= 1,
  {
    message: "Apenas uma faixa pode ser 'sem teto' (upTo null)",
    path: ["commissionBrackets"],
  },
)

export const PUT = withRequestContext(
  { action: "admin.system_settings.referrals.update", route: "/api/admin/system-settings/referrals" },
  async (request: Request) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

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
  const data = parsed.data

  // Ordena as faixas por upTo (faixa final null por ultimo) antes de persistir.
  // Usa o mesmo helper que o motor (rules.ts) e a rota por unidade, evitando
  // que a ordem persistida divirja da ordem esperada por resolveBracket.
  const brackets = sortBrackets(data.commissionBrackets)

  const commissionFields = {
    commissionMode: data.commissionMode,
    commissionBracketBasis: data.commissionBracketBasis,
    commissionRateType: data.commissionRateType,
    commissionPayoutBase: data.commissionPayoutBase,
    commissionBrackets: brackets as unknown as Prisma.InputJsonValue,
  }

  const updated = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {
      referralEnabled: data.referralEnabled,
      defaultReferralPercent: new Prisma.Decimal(data.defaultReferralPercent),
      referralMinPayout: new Prisma.Decimal(data.referralMinPayout),
      referralPayoutDay: data.referralPayoutDay,
      ...commissionFields,
    },
    create: {
      id: "default",
      referralEnabled: data.referralEnabled,
      defaultReferralPercent: new Prisma.Decimal(data.defaultReferralPercent),
      referralMinPayout: new Prisma.Decimal(data.referralMinPayout),
      referralPayoutDay: data.referralPayoutDay,
      ...commissionFields,
    },
    select: {
      referralEnabled: true,
      defaultReferralPercent: true,
      referralMinPayout: true,
      referralPayoutDay: true,
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
    },
  })

  return NextResponse.json({
    data: {
      referralEnabled: updated.referralEnabled,
      defaultReferralPercent: Number(updated.defaultReferralPercent),
      referralMinPayout: Number(updated.referralMinPayout),
      referralPayoutDay: updated.referralPayoutDay,
      commissionMode: updated.commissionMode,
      commissionBracketBasis: updated.commissionBracketBasis,
      commissionRateType: updated.commissionRateType,
      commissionPayoutBase: updated.commissionPayoutBase,
      commissionBrackets: updated.commissionBrackets,
    },
  })
  },
)
