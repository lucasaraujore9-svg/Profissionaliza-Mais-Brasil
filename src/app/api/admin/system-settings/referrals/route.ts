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

// Uma fase do plano multi-fase (global). brackets exige >=1 (fase sem faixa
// nao paga nada). durationMonths null = fase final "em diante".
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
  // Plano MULTI-FASE global (opcional). [] => sem plano (usa faixa singular).
  commissionPlan: z.array(phaseSchema).max(12).optional().default([]),
  // Escopo da mudanca: ALL aplica a todos que herdam o global; NEW_ONLY congela
  // as revendas existentes (sem override) na regra ANTERIOR e so as novas herdam.
  scope: z.enum(["ALL", "NEW_ONLY"]).optional().default("ALL"),
})
  .refine(
    (d) => d.commissionBrackets.filter((b) => b.upTo === null).length <= 1,
    {
      message: "Apenas uma faixa pode ser 'sem teto' (upTo null)",
      path: ["commissionBrackets"],
    },
  )
  .refine(
    // Apenas a ULTIMA fase pode ser "em diante" (durationMonths null).
    (d) =>
      d.commissionPlan
        .slice(0, -1)
        .every((p) => p.durationMonths !== null),
    {
      message:
        "Só a última fase pode ser 'em diante' (sem duração). Defina a duração das demais.",
      path: ["commissionPlan"],
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

  // Plano multi-fase: normaliza as faixas de cada fase (ordem) e guarda como
  // { phases: [...] } (forma aceita por parsePlan). [] => sem plano (DbNull).
  const planValue: Prisma.InputJsonValue | typeof Prisma.DbNull =
    data.commissionPlan.length > 0
      ? ({
          phases: data.commissionPlan.map((p) => ({
            durationMonths: p.durationMonths,
            rateType: p.rateType,
            bracketBasis: p.bracketBasis,
            payoutBase: p.payoutBase,
            brackets: sortBrackets(p.brackets),
          })),
        } as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull

  const commissionFields = {
    commissionMode: data.commissionMode,
    commissionBracketBasis: data.commissionBracketBasis,
    commissionRateType: data.commissionRateType,
    commissionPayoutBase: data.commissionPayoutBase,
    commissionBrackets: brackets as unknown as Prisma.InputJsonValue,
    commissionPlan: planValue,
  }

  // Estado ANTERIOR da regra (lido ANTES de qualquer escrita) — base do
  // congelamento e do gate "a regra mudou?".
  const old = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: {
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
      commissionPlan: true,
    },
  })

  // O escopo (congelar/descongelar) só faz sentido quando a REGRA de comissão
  // de fato mudou. Sem este gate, salvar a tela por outro motivo (ex.: ligar/
  // desligar o programa, mudar o dia do payout) com o scope no default "ALL"
  // descongelaria silenciosamente todas as unidades FROZEN de um NEW_ONLY
  // anterior. Comparamos os valores normalizados que SERAO persistidos.
  const newPlanForCmp = planValue === Prisma.DbNull ? null : planValue
  const commissionChanged =
    old == null ||
    old.commissionMode !== data.commissionMode ||
    old.commissionBracketBasis !== data.commissionBracketBasis ||
    old.commissionRateType !== data.commissionRateType ||
    old.commissionPayoutBase !== data.commissionPayoutBase ||
    JSON.stringify(old.commissionBrackets ?? null) !==
      JSON.stringify(brackets.length > 0 ? brackets : null) ||
    JSON.stringify(old.commissionPlan ?? null) !== JSON.stringify(newPlanForCmp)

  // Congelamento (NEW_ONLY) e descongelamento (ALL) + upsert no MESMO commit,
  // para nao deixar tenants mutados contra um global que nao chegou a atualizar.
  const updated = await prisma.$transaction(async (tx) => {
    if (commissionChanged) {
      if (data.scope === "NEW_ONLY") {
        if (old) {
          // Congela quem ainda herda o global com a regra ANTERIOR (FROZEN).
          await tx.tenant.updateMany({
            where: { commissionOverrideSource: null },
            data: {
              commissionMode: old.commissionMode,
              commissionBracketBasis: old.commissionBracketBasis,
              commissionRateType: old.commissionRateType,
              commissionPayoutBase: old.commissionPayoutBase,
              commissionBrackets:
                old.commissionBrackets == null
                  ? Prisma.DbNull
                  : (old.commissionBrackets as Prisma.InputJsonValue),
              commissionPlan:
                old.commissionPlan == null
                  ? Prisma.DbNull
                  : (old.commissionPlan as Prisma.InputJsonValue),
              commissionOverrideSource: "FROZEN",
            },
          })
        }
      } else {
        // ALL: limpa apenas overrides FROZEN (MANUAL sempre preservado).
        await tx.tenant.updateMany({
          where: { commissionOverrideSource: "FROZEN" },
          data: {
            commissionMode: null,
            commissionBracketBasis: null,
            commissionRateType: null,
            commissionPayoutBase: null,
            commissionBrackets: Prisma.DbNull,
            commissionPlan: Prisma.DbNull,
            commissionOverrideSource: null,
          },
        })
      }
    }

    return tx.systemSettings.upsert({
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
        commissionPlan: true,
      },
    })
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
      commissionPlan: updated.commissionPlan,
    },
  })
  },
)
