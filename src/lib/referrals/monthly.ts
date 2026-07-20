/**
 * Motor de comissao de indicacao — calculo do fechamento mensal.
 *
 * Desde a unificacao este e o UNICO motor: todo indicador e apurado aqui,
 * qualquer que seja o `commissionMode` gravado (o modo legado por pagamento foi
 * aposentado em ./commission.ts). Nenhum indicador pode "cair fora" dos dois
 * motores — era assim que uma regra mal configurada rendia R$ 0 em silencio.
 *
 * Para cada indicador, apura UMA comissao do mes
 * (ReferralMonthlyCommission, idempotente em (referrer, period)):
 *   1. Conta o que determina a faixa: novas revendas indicadas no mes OU nº de
 *      unidades ativas (rule.bracketBasis).
 *   2. Escolhe a faixa -> rate (R$ por unidade se FIXED, % se PERCENT).
 *   3. Define a base de pagamento (rule.payoutBase): TODAS as ativas, so as
 *      indicadas no mes, ou so as que PAGARAM no mes — sempre excluindo
 *      cortesia (planValue = 0).
 *   4. Valor: FIXED = rate × nº de unidades da base; PERCENT = Σ (mensalidade
 *      recebida no mes × rate / 100) por unidade da base.
 *
 * A liquidacao (transferencia manual + comprovante para dar baixa) e a mesma do
 * motor legado: ReferralMonthlyCommission entra no ReferralPayout em ./payout.ts.
 */
import { Prisma, type CommissionRateType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { computeAvailableAt } from "@/lib/referrals/commission"
import { swallow } from "@/lib/errors"
import {
  resolveBracket,
  resolvePhase,
  monthsInProgram,
  type CommissionPlanSettings,
  type CommissionPhase,
} from "@/lib/referrals/rules"
import {
  resolveEffectiveCommissionForEngine,
  type GlobalCommissionInput,
} from "@/lib/referrals/effective-rule"

const SETTINGS_ID = "default"
const DEFAULT_PAYOUT_DAY = 20
// Status de TenantPayment considerados "mensalidade recebida" (alinha com
// /api/admin/financeiro). Usado no modo PERCENT.
const RECEIVED_STATUSES = ["RECEIVED", "CONFIRMED"]

interface MonthlyLine {
  tenantId: string
  name: string
  /** Mensalidade recebida no mes (PERCENT) ou planValue (FIXED). */
  mensalidade: number
  /** Contribuicao desta unidade para a comissao do mes. */
  amount: number
  /** Tipo de valor da fase ATIVA desta unidade no mes (FIXED/PERCENT). */
  rateType?: CommissionRateType
  /** Valor da faixa aplicada: R$ por unidade (FIXED) ou % (PERCENT). */
  rate?: number
  /** Indice (0-based) da fase ativa desta unidade no plano. */
  phaseIndex?: number
}

function monthRange(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) // 1-12
  if (month < 1 || month > 12) return null
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)) // exclusivo
  return { start, end }
}

/** Indice absoluto de mes (ano*12+mes) para comparar competencias por mes. */
function monthAnchor(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

/**
 * Os `count` meses fechados mais recentes em "AAAA-MM", do mais antigo ao mais
 * novo (o ultimo e o mes anterior a `ref`).
 *
 * Usado pelo cron para apurar COM CATCH-UP: ao contrario do motor legado (que se
 * auto-cura via backfillReferrerCommissions varrendo todas as mensalidades sem
 * comissao), o motor por faixas so cria a linha do mes quando o fechamento roda.
 * Se um mes for pulado (ex.: o cron pg_cron ficou fora do ar), recalcular uma
 * janela de meses garante que a competencia perdida ainda seja fechada no
 * proximo run. Idempotente — meses ja AVAILABLE/PAID/vinculados sao pulados.
 */
export function recentClosedPeriods(ref: Date, count: number): string[] {
  const out: string[] = []
  const base = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))
  for (let i = count; i >= 1; i--) {
    const d = new Date(base)
    d.setUTCMonth(d.getUTCMonth() - i)
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    )
  }
  return out
}

/**
 * Apura as comissoes mensais por faixas para todos os indicadores em modo
 * MONTHLY_TIERED, para o mes `period` ("AAAA-MM"). Idempotente: nao recalcula
 * comissoes ja vinculadas a um payout ou pagas.
 */
export async function computeMonthlyCommissions(period: string): Promise<{
  processed: number
  created: number
  updated: number
  skipped: number
}> {
  const range = monthRange(period)
  if (!range) throw new Error(`period invalido: ${period} (esperado AAAA-MM)`)

  const settings = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      referralEnabled: true,
      referralPayoutDay: true,
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
  if (!settings?.referralEnabled) {
    return { processed: 0, created: 0, updated: 0, skipped: 0 }
  }

  const global: GlobalCommissionInput = {
    commissionMode: settings.commissionMode,
    commissionBracketBasis: settings.commissionBracketBasis,
    commissionRateType: settings.commissionRateType,
    commissionPayoutBase: settings.commissionPayoutBase,
    commissionBrackets: settings.commissionBrackets,
    commissionPlan: settings.commissionPlan,
    defaultReferralPercent: settings.defaultReferralPercent,
    defaultReferralMinReferrals: settings.defaultReferralMinReferrals,
  }
  const payoutDay = settings.referralPayoutDay ?? DEFAULT_PAYOUT_DAY
  const availableAt = computeAvailableAt(range.start, payoutDay)

  const referrers = await prisma.tenant.findMany({
    where: { referrals: { some: {} } },
    select: {
      id: true,
      name: true,
      createdAt: true,
      commissionMode: true,
      commissionBracketBasis: true,
      commissionRateType: true,
      commissionPayoutBase: true,
      commissionBrackets: true,
      commissionPlan: true,
      commissionPlanStartedAt: true,
      referralMinReferrals: true,
    },
  })

  let processed = 0
  let created = 0
  let updated = 0
  let skipped = 0

  for (const referrer of referrers) {
    // Motor unico: nao ha mais desvio por `commissionMode`. Todo indicador e
    // apurado aqui, e a regra efetiva nunca vem vazia (ha fallback percentual).
    // A fase ativa NAO e escolhida aqui: cada unidade indicada tem o seu proprio
    // relogio (idade da unidade), entao a selecao de fase acontece por unidade
    // dentro de computeForReferrer.
    const rule = resolveEffectiveCommissionForEngine(referrer, global)
    processed++
    const outcome = await computeForReferrer(
      referrer.id,
      referrer.name,
      rule.phases,
      rule.settings,
      rule.minReferrals,
      period,
      range,
      availableAt,
    )
    if (outcome === "created") created++
    else if (outcome === "updated") updated++
    else skipped++
  }

  return { processed, created, updated, skipped }
}

async function computeForReferrer(
  referrerTenantId: string,
  referrerName: string,
  phases: CommissionPhase[],
  settings: CommissionPlanSettings,
  minReferrals: number,
  period: string,
  range: { start: Date; end: Date },
  availableAt: Date,
): Promise<"created" | "updated" | "skipped"> {
  // Idempotencia: nao mexe no que ja foi liberado/liquidado/pago. So recalcula
  // linhas ainda PENDING e nao vinculadas — uma vez AVAILABLE, o valor que a
  // revenda ja viu nao pode encolher nem ser apagado por um reprocessamento.
  const existing = await prisma.referralMonthlyCommission.findUnique({
    where: { referrerTenantId_period: { referrerTenantId, period } },
    select: { id: true, status: true, payoutId: true },
  })
  if (
    existing &&
    (existing.status === "PAID" ||
      existing.status === "AVAILABLE" ||
      existing.payoutId)
  ) {
    return "skipped"
  }

  // Contagens no nivel do INDICADOR — usadas para escolher a faixa DENTRO da fase
  // de cada unidade (a faixa por volume continua sendo agregada do indicador,
  // mesmo que cada unidade esteja numa fase diferente do tempo).
  const [newThisMonthCount, activeTotalCount] = await Promise.all([
    prisma.tenant.count({
      where: {
        referrerTenantId,
        status: "ACTIVE",
        createdAt: { gte: range.start, lt: range.end },
      },
    }),
    prisma.tenant.count({ where: { referrerTenantId, status: "ACTIVE" } }),
  ])

  // PORTAO DE ELEGIBILIDADE (herdado do motor legado): o indicador so passa a
  // receber depois de atingir o minimo de indicacoes ATIVAS. Enquanto nao
  // atinge, a competencia fica retida (nenhuma linha criada). Quando atinge, o
  // catch-up do cron (recentClosedPeriods) reapura os meses retidos da janela.
  if (minReferrals > 0 && activeTotalCount < minReferrals) {
    return removeIfExists(existing?.id)
  }

  // Universo de unidades candidatas: ativas com plano pago (cortesia planValue=0
  // nunca gera pagamento). A inclusao final depende do payoutBase da FASE ATIVA
  // de cada unidade (avaliado no loop). createdAt/activatedAt/commissionPlanStartedAt
  // definem o relogio PROPRIO de cada unidade.
  const units = await prisma.tenant.findMany({
    where: { referrerTenantId, status: "ACTIVE", planValue: { gt: 0 } },
    select: {
      id: true,
      name: true,
      planValue: true,
      createdAt: true,
      activatedAt: true,
      commissionPlanStartedAt: true,
    },
  })
  if (units.length === 0) return removeIfExists(existing?.id)

  // Mensalidades recebidas no mes, FATURA A FATURA (nao somadas por unidade).
  //
  // A granularidade por fatura e obrigatoria por dois motivos:
  //   1. `clock: "paidInvoices"` precisa saber QUAL fatura e (1a, 2a, ...);
  //   2. `promoPaidUntil` e uma regra sobre a DATA de cada pagamento — uma janela
  //      que termina no meio do mes (ex.: 15/12) parte a competencia ao meio, e
  //      duas unidades da mesma apuracao saem com percentuais diferentes.
  // Somar por unidade, como era antes, apagava as duas informacoes.
  //
  // Mesmo anti-duplicidade do motor legado: ignora pagamentos ja cobertos por
  // uma ReferralCommission legada nao-cancelada.
  //
  // A busca traz TODAS as faturas recebidas do mes, inclusive as ja cobertas
  // pelo ledger legado. O filtro anti-duplicidade vira uma marca (`elegivel`)
  // em vez de um `where`, porque as duas perguntas sao diferentes:
  //   - "que numero de fatura e esta?" -> conta TODAS (a fatura ja comissionada
  //     pelo legado continua sendo a 1a da unidade);
  //   - "esta fatura gera valor agora?" -> so as elegiveis.
  // Filtrar na query misturava as duas: a 2a fatura do mes virava indice 0 da
  // lista e era tratada como a primeira, pagando o percentual de entrada duas
  // vezes no mes de transicao entre motores.
  const ids = units.map((u) => u.id)
  const paidInMonth = new Map<
    string,
    { amount: Prisma.Decimal; paidAt: Date; elegivel: boolean }[]
  >()
  {
    const rows = await prisma.tenantPayment.findMany({
      where: {
        tenantId: { in: ids },
        status: { in: RECEIVED_STATUSES },
        paidAt: { gte: range.start, lt: range.end },
      },
      select: {
        tenantId: true,
        amount: true,
        paidAt: true,
        referralCommission: { select: { status: true } },
      },
      orderBy: { paidAt: "asc" },
    })
    for (const r of rows) {
      if (!r.paidAt) continue
      const list = paidInMonth.get(r.tenantId) ?? []
      list.push({
        amount: new Prisma.Decimal(r.amount),
        paidAt: r.paidAt,
        elegivel:
          !r.referralCommission || r.referralCommission.status === "CANCELLED",
      })
      paidInMonth.set(r.tenantId, list)
    }
  }

  // Quantas faturas a unidade JA tinha pago antes desta competencia. E o que
  // define se a fatura deste mes e a 1a da vida dela (relogio `paidInvoices`).
  // Aqui NAO aplicamos o filtro anti-duplicidade: a pergunta e "que numero de
  // fatura e esta", e uma fatura antiga paga pelo motor legado conta igual.
  const priorPaidCount = new Map<string, number>()
  if (settings.clock === "paidInvoices") {
    const grouped = await prisma.tenantPayment.groupBy({
      by: ["tenantId"],
      where: {
        tenantId: { in: ids },
        status: { in: RECEIVED_STATUSES },
        paidAt: { lt: range.start },
      },
      _count: { _all: true },
    })
    for (const g of grouped) priorPaidCount.set(g.tenantId, g._count._all)
  }

  /**
   * Fase valida para uma cobranca. `elapsed` e meses ou nº de faturas ja pagas,
   * conforme o relogio. A janela promocional derruba para a fase FINAL qualquer
   * fatura paga depois do limite — mesmo sendo a 1a da unidade.
   */
  const phaseFor = (
    elapsed: number,
    paidAt: Date | null,
  ): { index: number; phase: CommissionPhase } | null => {
    const active = resolvePhase(phases, elapsed)
    if (!active) return null
    const limit = settings.promoPaidUntil
    if (!limit || !paidAt || phases.length < 2) return active
    const lastIndex = phases.length - 1
    if (active.index !== lastIndex && paidAt > limit) {
      return { index: lastIndex, phase: phases[lastIndex] }
    }
    return active
  }

  let amount = new Prisma.Decimal(0)
  let baseSum = new Prisma.Decimal(0)
  const lines: MonthlyLine[] = []

  for (const u of units) {
    const referredThisMonth =
      u.createdAt >= range.start && u.createdAt < range.end
    // Relogio PROPRIO da unidade: idade em meses desde a ativacao DELA
    // (commissionPlanStartedAt > activatedAt > createdAt). A fase do plano e
    // escolhida por essa idade — unidades em meses diferentes podem estar em
    // fases diferentes no mesmo fechamento.
    const anchor = u.commissionPlanStartedAt ?? u.activatedAt ?? u.createdAt
    // Catch-up de um mes passado (recentClosedPeriods): a unidade ativa HOJE
    // pode ter entrado no programa DEPOIS do mes apurado. Nesse caso ela nao
    // existia na competencia — nao entra (evita inflar mes retroativo). O clamp
    // em monthsInProgram so cobre a fase; aqui excluimos a unidade de vez.
    if (monthAnchor(anchor) > monthAnchor(range.start)) continue

    const payments = paidInMonth.get(u.id) ?? []
    // So as faturas que ainda nao foram pagas pelo ledger legado geram valor.
    const elegiveis = payments.filter((p) => p.elegivel)
    const priorPaid = priorPaidCount.get(u.id) ?? 0
    const byInvoice = settings.clock === "paidInvoices"

    // Fase "da unidade": governa os portoes e o valor FIXED. Com relogio por
    // fatura, e a fase da PRIMEIRA fatura do mes (com relogio por mes, a idade).
    const unitElapsed = byInvoice ? priorPaid : monthsInProgram(anchor, range.start)
    const active = phaseFor(unitElapsed, payments[0]?.paidAt ?? null)
    if (!active) continue
    const phase = active.phase

    // payoutBase da fase: REFERRED_THIS_MONTH so inclui a unidade no mes em que
    // ela entrou; PAID_THIS_MONTH so inclui quem pagou mensalidade no mes
    // (unidade ativa e inadimplente nao gera comissao); ALL_ACTIVE inclui sempre.
    if (phase.payoutBase === "REFERRED_THIS_MONTH" && !referredThisMonth) continue
    // Fatura ja coberta pelo ledger legado nao conta como "pagou no mes" aqui —
    // senao o valor fixo sairia por cima de uma comissao que ja existe.
    if (phase.payoutBase === "PAID_THIS_MONTH" && elegiveis.length === 0) continue

    // Faixa escolhida pela contagem do indicador, conforme a base da fase.
    const count =
      phase.bracketBasis === "NEW_REFERRALS_MONTH"
        ? newThisMonthCount
        : activeTotalCount
    const bracket = resolveBracket(phase.brackets, count)
    if (!bracket) continue
    const rate = new Prisma.Decimal(bracket.value)

    if (phase.rateType === "FIXED") {
      // R$ por unidade da base — UMA vez por unidade, mesmo que ela tenha pago
      // duas faturas no mes. Com payoutBase ALL_ACTIVE independe de pagamento;
      // com PAID_THIS_MONTH so chega aqui quem pagou (portao acima).
      amount = amount.add(rate)
      lines.push({
        tenantId: u.id,
        name: u.name,
        mensalidade: Number(u.planValue),
        amount: bracket.value,
        rateType: "FIXED",
        rate: bracket.value,
        phaseIndex: active.index,
      })
    } else {
      // PERCENT: % sobre cada mensalidade recebida no mes. Uma fatura por vez —
      // com relogio por fatura, a 1a e a 2a fatura do mesmo mes podem cair em
      // fases diferentes (e a janela promocional olha a data de CADA uma).
      if (elegiveis.length === 0) continue // nenhuma fatura nova para comissionar

      // Agrupa as faturas do mes pela TAXA efetiva de cada uma, soma a base do
      // grupo e so entao aplica o percentual, arredondando UMA vez por taxa.
      //
      // Arredondar fatura a fatura mudaria o valor de quem ja usa o motor: 3
      // faturas de R$ 33,33 a 10% dao R$ 9,99 arredondando cada uma e R$ 10,00
      // somando antes — que e o que o motor sempre pagou. Com taxa unica (o
      // caso de todo plano por mes) este caminho e aritmeticamente identico ao
      // antigo; a granularidade so muda quando as faturas caem em fases
      // diferentes, e ai o agrupamento por taxa e o comportamento correto.
      const porTaxa = new Map<number, { base: Prisma.Decimal; phaseIndex: number }>()
      // Fases FIXED alcancadas por alguma fatura entram como parcela fixa, UMA
      // vez por fase — R$ por unidade nao vira R$ por fatura.
      const fixasAplicadas = new Map<number, Prisma.Decimal>()

      // O ordinal percorre TODAS as faturas do mes (o `i`), nao so as
      // elegiveis: a 2a fatura do mes continua sendo a 2a mesmo que a 1a ja
      // tenha sido comissionada pelo motor legado.
      for (let i = 0; i < payments.length; i++) {
        const pay = payments[i]
        if (!pay.elegivel) continue
        // Com relogio por mes a fase e a mesma para todas as faturas; com
        // relogio por fatura, cada uma tem o seu ordinal.
        const forThis = byInvoice ? phaseFor(priorPaid + i, pay.paidAt) : active
        if (!forThis) continue
        const brk = resolveBracket(
          forThis.phase.brackets,
          forThis.phase.bracketBasis === "NEW_REFERRALS_MONTH"
            ? newThisMonthCount
            : activeTotalCount,
        )
        if (!brk) continue
        // Num plano que mistura FIXED e PERCENT, uma fatura pode cair numa fase
        // FIXED enquanto a unidade entrou por uma fase PERCENT. Sem esta
        // distincao o valor em R$ da faixa seria lido como percentual (R$75
        // viraria 75% da mensalidade).
        if (forThis.phase.rateType === "FIXED") {
          if (!fixasAplicadas.has(forThis.index)) {
            fixasAplicadas.set(forThis.index, new Prisma.Decimal(brk.value))
          }
          continue
        }
        const grupo = porTaxa.get(brk.value)
        if (grupo) grupo.base = grupo.base.add(pay.amount)
        else porTaxa.set(brk.value, { base: pay.amount, phaseIndex: forThis.index })
      }
      if (porTaxa.size === 0 && fixasAplicadas.size === 0) continue

      let unitMensalidade = new Prisma.Decimal(0)
      let unitAmount = new Prisma.Decimal(0)
      // A linha do snapshot resume a unidade; quando as faturas do mes caem em
      // fases distintas, guardamos a da PRIMEIRA taxa encontrada (o valor somado
      // segue fiel, e o sentinela de plano misto ja existe no topo).
      const primeiroPercent = [...porTaxa][0]
      const primeiraFixa = [...fixasAplicadas][0]
      const unitRate = primeiroPercent ? primeiroPercent[0] : Number(primeiraFixa[1])
      const unitPhaseIndex = primeiroPercent
        ? primeiroPercent[1].phaseIndex
        : primeiraFixa[0]

      for (const [taxa, grupo] of porTaxa) {
        unitMensalidade = unitMensalidade.add(grupo.base)
        unitAmount = unitAmount.add(
          grupo.base.mul(new Prisma.Decimal(taxa)).div(100).toDecimalPlaces(2),
        )
      }
      for (const valorFixo of fixasAplicadas.values()) {
        unitAmount = unitAmount.add(valorFixo)
      }

      if (unitAmount.lte(0)) continue
      baseSum = baseSum.add(unitMensalidade)
      amount = amount.add(unitAmount)
      lines.push({
        tenantId: u.id,
        name: u.name,
        mensalidade: Number(unitMensalidade),
        amount: Number(unitAmount),
        rateType: "PERCENT",
        rate: unitRate,
        phaseIndex: unitPhaseIndex,
      })
    }
  }

  amount = amount.toDecimalPlaces(2)
  if (amount.lte(0)) {
    return removeIfExists(existing?.id)
  }

  // Campos de topo REPRESENTATIVOS para as telas de resumo (painel/financeiro).
  // Quando UMA so fase contribuiu no mes (caso comum + 100% dos planos de fase
  // unica), gravamos os campos fieis daquela fase, com bracketCount/rate/basis/
  // payoutBase corretos. Quando fases diferentes contribuiram (plano misto), nao
  // ha um valor unico: rate=0 sinaliza "misto" para as telas, que entao usam a
  // quebra fiel por unidade em linesSnapshot. unitCount/baseSum/amount sempre reais.
  const contributingPhaseIdx = new Set(lines.map((l) => l.phaseIndex))
  const single =
    contributingPhaseIdx.size === 1
      ? phases[[...contributingPhaseIdx][0] as number]
      : null
  const rep = single ?? phases[0]
  const repCount =
    rep.bracketBasis === "NEW_REFERRALS_MONTH" ? newThisMonthCount : activeTotalCount
  const unitCount = lines.length
  const data = {
    mode: "MONTHLY_TIERED" as const,
    bracketBasis: rep.bracketBasis,
    rateType: single ? single.rateType : (lines[0]?.rateType ?? rep.rateType),
    payoutBase: rep.payoutBase,
    bracketIndex: 0,
    bracketCount: repCount,
    // Fase unica => rate real (uniforme); misto => 0 (sinaliza às telas).
    rate: single ? new Prisma.Decimal(lines[0]?.rate ?? 0) : new Prisma.Decimal(0),
    unitCount,
    baseSum,
    amount,
    linesSnapshot: lines as unknown as Prisma.InputJsonValue,
    availableAt,
  }

  if (existing) {
    await prisma.referralMonthlyCommission.update({
      where: { id: existing.id },
      data,
    })
    return "updated"
  }

  await prisma.referralMonthlyCommission.create({
    data: { referrerTenantId, period, status: "PENDING", ...data },
  })

  await createNotification({
    audience: "TENANT",
    tenantId: referrerTenantId,
    level: "SUCCESS",
    title: "Nova comissao de indicacao",
    body: `Comissao de ${period} apurada: R$ ${amount
      .toFixed(2)
      .replace(".", ",")} (${unitCount} unidade${unitCount === 1 ? "" : "s"}). Liberacao em ${availableAt.toLocaleDateString("pt-BR")}.`,
    category: "referral",
    href: "/painel/indicacoes",
  }).catch(swallow("referral.monthly.commission_notify"))

  return "created"
}

/**
 * Remove uma comissao mensal nao-liquidada que recalculou para 0 (faixa
 * inexistente ou base vazia). Mantem o ledger limpo entre reprocessamentos.
 */
async function removeIfExists(
  id: string | undefined,
): Promise<"updated" | "skipped"> {
  if (!id) return "skipped"
  await prisma.referralMonthlyCommission.delete({ where: { id } })
  return "updated"
}

/**
 * Trata o estorno (refund) de uma mensalidade no motor por faixas, espelhando o
 * clawback do motor legado (cancelCommissionForTenantPayment):
 *  - PENDING: nao mexe — o proximo fechamento recalcula e exclui a mensalidade
 *    estornada (status deixa de ser RECEIVED/CONFIRMED), entao se auto-corrige.
 *  - AVAILABLE/PAID: marca [CLAWBACK_PENDING] em cancelReason + cancelledAt e
 *    notifica o SUPER_ADMIN. O gate em processMonthlyPayouts entao BLOQUEIA
 *    novos payouts automaticos do indicador ate o admin resolver.
 *
 * Chamado pelo webhook Asaas no refund TOTAL (ver src/lib/asaas/process.ts).
 * Idempotente: nao re-marca uma linha ja marcada.
 */
export async function flagMonthlyCommissionForRefund(
  tenantPaymentId: string,
  reason: string,
): Promise<void> {
  const tp = await prisma.tenantPayment.findUnique({
    where: { id: tenantPaymentId },
    select: { tenantId: true, paidAt: true },
  })
  if (!tp?.paidAt) return

  const referred = await prisma.tenant.findUnique({
    where: { id: tp.tenantId },
    select: { name: true, referrerTenantId: true },
  })
  if (!referred?.referrerTenantId) return

  const period = `${tp.paidAt.getUTCFullYear()}-${String(
    tp.paidAt.getUTCMonth() + 1,
  ).padStart(2, "0")}`

  const monthly = await prisma.referralMonthlyCommission.findUnique({
    where: {
      referrerTenantId_period: {
        referrerTenantId: referred.referrerTenantId,
        period,
      },
    },
    select: {
      id: true,
      status: true,
      amount: true,
      rateType: true,
      cancelReason: true,
      linesSnapshot: true,
      referrer: { select: { name: true } },
    },
  })
  if (!monthly) return
  // So a fração PERCENT depende da mensalidade estornada (FIXED = rate x nº de
  // unidades ativas, independe de pagamento). Num plano multi-fase a mesma
  // competencia pode misturar fases FIXED e PERCENT, entao a decisao olha a
  // LINHA da unidade especifica em linesSnapshot — nao o rateType representativo
  // do topo. Se a unidade contribuiu como FIXED (ou nao tem linha), estornar a
  // mensalidade dela nao reduz a comissao: nao ha clawback.
  const refundedLine = Array.isArray(monthly.linesSnapshot)
    ? (monthly.linesSnapshot as Array<{ tenantId?: string; rateType?: string }>).find(
        (l) => l?.tenantId === tp.tenantId,
      )
    : undefined
  const lineRateType = refundedLine?.rateType ?? monthly.rateType
  if (lineRateType === "FIXED") return
  if (monthly.status === "PENDING") return // recompute do proximo fechamento resolve
  if (monthly.cancelReason?.startsWith("[CLAWBACK_PENDING]")) return // ja marcada

  const valorFmt = Number(monthly.amount).toFixed(2).replace(".", ",")
  await prisma.referralMonthlyCommission.update({
    where: { id: monthly.id },
    data: {
      cancelReason: `[CLAWBACK_PENDING] competencia ${period} (R$ ${valorFmt}) — ${reason}`,
      cancelledAt: new Date(),
    },
  })

  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "ERROR",
    title: `⚠️ Clawback de comissão mensal: ${monthly.referrer?.name ?? referred.referrerTenantId}`,
    body: `A mensalidade de ${referred.name} (competência ${period}) foi estornada, mas a comissão por faixas já estava ${monthly.status === "PAID" ? "paga" : "liberada"} (R$ ${valorFmt}). Os próximos payouts automáticos do indicador ficam BLOQUEADOS até resolver em /admin/indicacoes/comissoes.`,
    category: "referral",
    href: "/admin/indicacoes/comissoes",
  }).catch(swallow("referral.monthly.clawback_notify"))
}
