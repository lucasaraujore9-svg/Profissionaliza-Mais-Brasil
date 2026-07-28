import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { sortBrackets, serializePlanSettings } from "@/lib/referrals/rules"
import { resolveEffectiveCommission } from "@/lib/referrals/effective-rule"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

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
    payoutBase: z.enum(["ALL_ACTIVE", "REFERRED_THIS_MONTH", "PAID_THIS_MONTH"]),
    brackets: z.array(bracketSchema).min(1).max(20),
  })
  .refine((p) => p.brackets.filter((b) => b.upTo === null).length <= 1, {
    message: "Apenas uma faixa pode ser 'sem teto' (upTo null)",
    path: ["brackets"],
  })

/**
 * Plano nas DUAS formas (array cru historico ou objeto com ajustes de topo),
 * normalizado para `{ phases, clock?, promoPaidUntil? }`. Espelha o schema da
 * rota por unidade — as duas telas gravam o mesmo formato.
 */
const planSchema = z
  .union([
    z.array(phaseSchema).max(12),
    z.object({
      phases: z.array(phaseSchema).max(12),
      clock: z.enum(["months", "paidInvoices"]).optional(),
      promoPaidUntil: z.string().datetime().nullable().optional(),
    }),
  ])
  .transform((v) => (Array.isArray(v) ? { phases: v } : v))

const bodySchema = z.object({
  referralEnabled: z.boolean(),
  // Ultimo fallback do resolvedor (effective-rule.ts): so vale quando nao ha
  // regra global nem regra propria configurada. Nao e "o percentual do programa".
  defaultReferralPercent: z.number().min(0).max(100),
  // Portao de elegibilidade padrao: indicacoes ATIVAS que o indicador precisa
  // ter para receber. 0 = sem minimo. Override por unidade em
  // Tenant.referralMinReferrals.
  defaultReferralMinReferrals: z.number().int().min(0).max(1000),
  referralMinPayout: z.number().min(0).max(100000),
  // Máx. 20: o cron de liberação roda no dia 20 (prisma/sql/pg_cron_jobs.sql).
  // availableAt > dia 20 só seria liberado no cron do mês seguinte. Manter <= 20
  // garante liberação no mesmo ciclo (vale p/ motor legado e por faixas).
  referralPayoutDay: z.number().int().min(1).max(20),
  // Motor UNICO: todo indicador e apurado no fechamento mensal. PER_PAYMENT_PERCENT
  // foi aposentado (ver src/lib/referrals/commission.ts) e nao pode mais ser gravado.
  commissionMode: z.enum(["MONTHLY_TIERED"]),
  commissionBracketBasis: z.enum(["NEW_REFERRALS_MONTH", "ACTIVE_UNITS"]),
  commissionRateType: z.enum(["FIXED", "PERCENT"]),
  commissionPayoutBase: z.enum([
    "ALL_ACTIVE",
    "REFERRED_THIS_MONTH",
    "PAID_THIS_MONTH",
  ]),
  commissionBrackets: z.array(bracketSchema).max(20),
  // Plano MULTI-FASE global (opcional). [] ou null => sem plano (usa faixa
  // singular). O editor Simples manda null para limpar plano residual.
  commissionPlan: planSchema.nullish().transform((v) => v ?? { phases: [] }),
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
      d.commissionPlan.phases
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
  const guard = await requireAdmin("indicacoes.config")
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
    data.commissionPlan.phases.length > 0
      ? ({
          phases: data.commissionPlan.phases.map((p) => ({
            durationMonths: p.durationMonths,
            rateType: p.rateType,
            bracketBasis: p.bracketBasis,
            payoutBase: p.payoutBase,
            brackets: sortBrackets(p.brackets),
          })),
          ...(data.commissionPlan.clock
            ? { clock: data.commissionPlan.clock }
            : {}),
          ...(data.commissionPlan.promoPaidUntil
            ? { promoPaidUntil: data.commissionPlan.promoPaidUntil }
            : {}),
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
      defaultReferralPercent: true,
      defaultReferralMinReferrals: true,
    },
  })

  // O escopo (congelar/descongelar) só faz sentido quando a REGRA de comissão
  // de fato mudou. Sem este gate, salvar a tela por outro motivo (ex.: ligar/
  // desligar o programa, mudar o dia do payout) com o scope no default "ALL"
  // descongelaria silenciosamente todas as unidades FROZEN de um NEW_ONLY
  // anterior. Comparamos os valores normalizados que SERAO persistidos.
  //
  // O percentual padrão e o mínimo de indicações TAMBÉM entram aqui: os dois
  // decidem quanto o indicador recebe (o percentual é o último fallback do
  // resolvedor; o mínimo é o portão de elegibilidade). Sem eles no gate, salvar
  // com escopo "apenas novas" mexendo só no percentual mudava a regra de todo
  // mundo sem congelar ninguém.
  const newPlanForCmp = planValue === Prisma.DbNull ? null : planValue
  const commissionChanged =
    old == null ||
    old.commissionMode !== data.commissionMode ||
    old.commissionBracketBasis !== data.commissionBracketBasis ||
    old.commissionRateType !== data.commissionRateType ||
    old.commissionPayoutBase !== data.commissionPayoutBase ||
    JSON.stringify(old.commissionBrackets ?? null) !==
      JSON.stringify(brackets.length > 0 ? brackets : null) ||
    JSON.stringify(old.commissionPlan ?? null) !== JSON.stringify(newPlanForCmp) ||
    Number(old.defaultReferralPercent) !== data.defaultReferralPercent ||
    old.defaultReferralMinReferrals !== data.defaultReferralMinReferrals

  // Congelamento (NEW_ONLY) e descongelamento (ALL) + upsert no MESMO commit,
  // para nao deixar tenants mutados contra um global que nao chegou a atualizar.
  const updated = await prisma.$transaction(async (tx) => {
    if (commissionChanged) {
      if (data.scope === "NEW_ONLY") {
        if (old) {
          // Congela quem ainda herda o global com a regra ANTERIOR (FROZEN).
          //
          // Congelamos a regra EFETIVA (resolvida pela mesma fonte unica que o
          // fechamento mensal usa), nao as colunas cruas: quando o global nao
          // tinha faixas e a regra vinha do percentual padrao, copiar as colunas
          // cruas gravava um override vazio — o tenant caia de novo no global e
          // passava a seguir o percentual NOVO, ou seja, o congelamento nao
          // congelava nada.
          const oldRule = resolveEffectiveCommission(null, old)
          const head = oldRule.phases[0] // resolveEffectiveCommission nunca devolve vazio

          // O minimo tambem e parte da regra — congela so quem nao tem o proprio,
          // e ANTES do update abaixo (que muda o commissionOverrideSource).
          await tx.tenant.updateMany({
            where: {
              commissionOverrideSource: null,
              referralMinReferrals: null,
            },
            data: { referralMinReferrals: oldRule.minReferrals },
          })

          await tx.tenant.updateMany({
            where: { commissionOverrideSource: null },
            data: {
              // Motor unico: a coluna sobrou como historico, so o modo vivo entra.
              commissionMode: "MONTHLY_TIERED",
              commissionBracketBasis: head.bracketBasis,
              commissionRateType: head.rateType,
              commissionPayoutBase: head.payoutBase,
              commissionBrackets: head.brackets as unknown as Prisma.InputJsonValue,
              // O congelamento tem de preservar os ajustes de topo do plano
              // anterior. Gravar so as fases fazia o indicador congelado voltar
              // ao relogio por MES e perder a janela promocional — mudando o
              // valor pago sem ninguem ter pedido.
              commissionPlan:
                oldRule.phases.length > 1
                  ? ({
                      ...serializePlanSettings(oldRule.settings),
                      phases: oldRule.phases,
                    } as unknown as Prisma.InputJsonValue)
                  : Prisma.DbNull,
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
            // Volta a herdar tambem o minimo padrao congelado acima.
            referralMinReferrals: null,
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
        defaultReferralMinReferrals: data.defaultReferralMinReferrals,
        referralMinPayout: new Prisma.Decimal(data.referralMinPayout),
        referralPayoutDay: data.referralPayoutDay,
        ...commissionFields,
      },
      create: {
        id: "default",
        referralEnabled: data.referralEnabled,
        defaultReferralPercent: new Prisma.Decimal(data.defaultReferralPercent),
        defaultReferralMinReferrals: data.defaultReferralMinReferrals,
        referralMinPayout: new Prisma.Decimal(data.referralMinPayout),
        referralPayoutDay: data.referralPayoutDay,
        ...commissionFields,
      },
      select: {
        referralEnabled: true,
        defaultReferralPercent: true,
        defaultReferralMinReferrals: true,
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
      defaultReferralMinReferrals: updated.defaultReferralMinReferrals,
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
