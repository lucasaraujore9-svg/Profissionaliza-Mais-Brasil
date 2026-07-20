import { Prisma } from "@prisma/client"
import type { ReferralPayout, ReferralPayoutMethod } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { CLAWBACK_MARKER_PREFIX } from "@/lib/referrals/clawback"

const SETTINGS_ID = "default"

async function readSettings() {
  const row = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      referralEnabled: true,
      referralMinPayout: true,
      referralPayoutDay: true,
    },
  })
  return {
    enabled: row?.referralEnabled ?? true,
    minPayout: Number(row?.referralMinPayout ?? 50),
    payoutDay: row?.referralPayoutDay ?? 20,
  }
}

export interface RequestPayoutInput {
  referrerTenantId: string
  method: ReferralPayoutMethod
  pixKey?: string | null
  pixKeyType?: string | null
}

export class ReferralPayoutError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "DISABLED"
      | "NO_BALANCE"
      | "BELOW_MIN"
      | "INVALID_PIX"
      | "ALREADY_PENDING"
      | "PROOF_REQUIRED"
      | "CLAWBACK_PENDING"
      | "CLAWBACK_FROZEN",
  ) {
    super(message)
    this.name = "ReferralPayoutError"
  }
}

/**
 * Solicita um saque para o referrer. Agrupa todas as comissoes AVAILABLE
 * e cria uma ReferralPayout com status REQUESTED.
 *
 * Validacoes:
 *   - feature ativa
 *   - saldo AVAILABLE >= referralMinPayout
 *   - para ASAAS_PIX: pixKey + pixKeyType obrigatorios
 *   - nao permite multiplos saques REQUESTED/PROCESSING simultaneos
 */
export async function requestPayout(
  input: RequestPayoutInput,
): Promise<ReferralPayout> {
  const settings = await readSettings()
  if (!settings.enabled) {
    throw new ReferralPayoutError(
      "Sistema de indicacoes desativado",
      "DISABLED",
    )
  }

  if (input.method === "ASAAS_PIX") {
    if (!input.pixKey || !input.pixKeyType) {
      throw new ReferralPayoutError(
        "Chave PIX e tipo sao obrigatorios para saque via PIX",
        "INVALID_PIX",
      )
    }
  }

  // Bloqueia se ja existe payout em aberto
  const pending = await prisma.referralPayout.findFirst({
    where: {
      referrerTenantId: input.referrerTenantId,
      status: { in: ["REQUESTED", "PROCESSING"] },
    },
    select: { id: true },
  })
  if (pending) {
    throw new ReferralPayoutError(
      "Voce ja possui um saque em andamento. Aguarde a aprovacao para solicitar outro.",
      "ALREADY_PENDING",
    )
  }

  // Gate de clawback (espelha o bloqueio do cron em processMonthlyPayouts): se ha
  // comissao marcada [CLAWBACK_PENDING] em qualquer motor, nao deixa sacar ate o
  // financeiro resolver — senao o saque manual burlaria o bloqueio e pagaria um
  // valor que deveria ser revertido. O marcador cobre tanto o refund TOTAL de
  // comissao PAID quanto o FREEZE de refund PARCIAL (SAAS-005), que pode marcar
  // uma comissao PENDING/AVAILABLE ainda nao paga — por isso NAO restringimos
  // mais por `status: "PAID"`: qualquer linha com o marcador bloqueia.
  const [legacyClawback, monthlyClawback] = await Promise.all([
    prisma.referralCommission.findFirst({
      where: {
        referrerTenantId: input.referrerTenantId,
        cancelReason: { startsWith: "[CLAWBACK_PENDING]" },
      },
      select: { id: true },
    }),
    prisma.referralMonthlyCommission.findFirst({
      where: {
        referrerTenantId: input.referrerTenantId,
        cancelReason: { startsWith: "[CLAWBACK_PENDING]" },
      },
      select: { id: true },
    }),
  ])
  if (legacyClawback || monthlyClawback) {
    throw new ReferralPayoutError(
      "Ha uma comissao em revisao por estorno. Os saques ficam bloqueados ate o financeiro resolver.",
      "CLAWBACK_PENDING",
    )
  }

  // Calcula saldo AVAILABLE dos dois motores (por pagamento + por faixas).
  const [available, availableMonthly] = await Promise.all([
    prisma.referralCommission.findMany({
      where: {
        referrerTenantId: input.referrerTenantId,
        status: "AVAILABLE",
        payoutId: null,
      },
      select: { id: true, amount: true },
    }),
    prisma.referralMonthlyCommission.findMany({
      where: {
        referrerTenantId: input.referrerTenantId,
        status: "AVAILABLE",
        payoutId: null,
      },
      select: { id: true, amount: true },
    }),
  ])
  if (available.length === 0 && availableMonthly.length === 0) {
    throw new ReferralPayoutError("Sem comissoes disponiveis", "NO_BALANCE")
  }
  const totalAmount = [...available, ...availableMonthly].reduce(
    (acc, c) => acc.add(c.amount),
    new Prisma.Decimal(0),
  )

  if (totalAmount.lt(settings.minPayout)) {
    throw new ReferralPayoutError(
      `Saldo abaixo do minimo (R$ ${settings.minPayout.toFixed(2).replace(".", ",")})`,
      "BELOW_MIN",
    )
  }

  // Cria o payout e vincula as comissoes numa transacao com CAS. Se qualquer
  // comissao ja tiver sido vinculada (outra solicitacao/cron concorrente), o
  // vinculo fica menor que o esperado e abortamos — senao o amount (=totalAmount)
  // ficaria inflado em relacao ao que foi efetivamente vinculado (over-pay).
  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.referralPayout.create({
      data: {
        referrerTenantId: input.referrerTenantId,
        amount: totalAmount,
        method: input.method,
        status: "REQUESTED",
        pixKey: input.method === "ASAAS_PIX" ? input.pixKey ?? null : null,
        pixKeyType:
          input.method === "ASAAS_PIX" ? input.pixKeyType ?? null : null,
        requestedAt: new Date(),
      },
    })
    const [linked, linkedMonthly] = await Promise.all([
      tx.referralCommission.updateMany({
        where: {
          id: { in: available.map((c) => c.id) },
          payoutId: null,
          status: "AVAILABLE",
        },
        data: { payoutId: created.id },
      }),
      tx.referralMonthlyCommission.updateMany({
        where: {
          id: { in: availableMonthly.map((c) => c.id) },
          payoutId: null,
          status: "AVAILABLE",
        },
        data: { payoutId: created.id },
      }),
    ])
    if (
      linked.count !== available.length ||
      linkedMonthly.count !== availableMonthly.length
    ) {
      throw new ReferralPayoutError(
        "O saldo mudou durante a solicitacao. Tente novamente.",
        "ALREADY_PENDING",
      )
    }
    return created
  })

  // Notifica o financeiro — e quem confere, paga e anexa o comprovante.
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.referrerTenantId },
    select: { name: true },
  })
  await createNotification({
    audience: "ROLE",
    roleTarget: "PMB_FINANCEIRO",
    level: "INFO",
    title: `Novo saque de indicacao solicitado: ${tenant?.name ?? input.referrerTenantId}`,
    body: `R$ ${totalAmount.toFixed(2)} via ${input.method}. Aprove em /admin/indicacoes/saques.`,
    category: "referral",
    href: "/admin/indicacoes/saques",
  })

  return payout
}

/**
 * Marca um payout como PAID. Atualiza comissoes vinculadas para PAID.
 * Se ASAAS_PIX, recebe opcionalmente o asaasTransferId.
 *
 * Atomicidade: o update do payout usa `updateMany` com `status: { not: "PAID" }`
 * — duas chamadas concorrentes (admin double-click, retry de PIX) só veem o
 * primeiro `count: 1`. O segundo dá `count: 0` e o payout existente é
 * retornado sem disparar notificação/transferência duplicada. Toda a operação
 * fica numa transação para garantir que payout.PAID + commissions.PAID
 * acontecem juntos.
 */
export async function markPayoutPaid(
  payoutId: string,
  asaasTransferId?: string | null,
): Promise<ReferralPayout> {
  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.referralPayout.findUnique({
      where: { id: payoutId },
      select: {
        id: true,
        status: true,
        amount: true,
        asaasTransferId: true,
        processedAt: true,
        referrerTenantId: true,
        proofUrl: true,
      },
    })
    if (!existing) throw new Error(`Payout ${payoutId} nao encontrado`)

    // Comprovante obrigatorio: nao se marca um saque como pago sem o comprovante
    // anexado (a revenda precisa conseguir consultar). Backstop server-side —
    // vale para QUALQUER caller (financeiro mark-paid e approve dos saques). So
    // bloqueia quando ainda nao esta pago; se ja estava PAID, o CAS abaixo cai em
    // count=0 e a operacao e um no-op idempotente.
    if (existing.status !== "PAID" && !existing.proofUrl) {
      throw new ReferralPayoutError(
        "Comprovante obrigatorio: anexe o comprovante de pagamento antes de marcar o saque como pago.",
        "PROOF_REQUIRED",
      )
    }

    // GATE DE CLAWBACK NO CHOKEPOINT (SAAS-005 follow-up): freezeCommissionForPartialRefund
    // (commission.ts) congela uma comissao marcando o cancelReason com
    // CLAWBACK_MARKER_PREFIX, mas PRESERVA o status (AVAILABLE) e NAO a desvincula
    // do payout. Sem este guard, markPayoutPaid liquidaria a comissao congelada
    // junto com o resto do payout (cujo amount foi calculado ANTES do freeze) —
    // pagando um valor que inclui uma comissao sob revisao de estorno.
    //
    // Bloqueamos o PAYOUT INTEIRO (nao pulamos so a linha congelada): pular a
    // comissao no updateMany deixaria o payout PAID por um amount que ainda
    // incluia a congelada → double-pay no futuro. Como tanto o approve quanto o
    // mark-paid passam por aqui, este unico ponto cobre ambas as rotas.
    //
    // So checamos quando o payout ainda nao esta PAID — assim re-chamadas
    // idempotentes de um payout ja pago nao quebram. O escape para destravar e a
    // rota /admin/indicacoes/comissoes (resolve do clawback), que desmarca/recalcula.
    if (existing.status !== "PAID") {
      const [frozenLegacy, frozenMonthly] = await Promise.all([
        tx.referralCommission.count({
          where: {
            payoutId,
            cancelReason: { startsWith: CLAWBACK_MARKER_PREFIX },
          },
        }),
        tx.referralMonthlyCommission.count({
          where: {
            payoutId,
            cancelReason: { startsWith: CLAWBACK_MARKER_PREFIX },
          },
        }),
      ])
      if (frozenLegacy > 0 || frozenMonthly > 0) {
        throw new ReferralPayoutError(
          "Saque bloqueado: contém comissão sob revisão de clawback (refund parcial). Resolva em /admin/indicacoes/comissoes antes de pagar.",
          "CLAWBACK_FROZEN",
        )
      }
    }

    const casUpdate = await tx.referralPayout.updateMany({
      where: { id: payoutId, status: { not: "PAID" } },
      data: {
        status: "PAID",
        asaasTransferId: asaasTransferId ?? existing.asaasTransferId ?? null,
        processedAt: existing.processedAt ?? now,
        paidAt: now,
      },
    })

    if (casUpdate.count === 0) {
      // Já estava PAID (ou concorrente acabou de marcar) — no-op idempotente.
      const reread = await tx.referralPayout.findUniqueOrThrow({ where: { id: payoutId } })
      return { freshlyPaid: false, payout: reread, referrerTenantId: existing.referrerTenantId, amount: existing.amount }
    }

    await tx.referralCommission.updateMany({
      where: { payoutId },
      data: { status: "PAID", paidAt: now },
    })
    // Comissoes mensais por faixas liquidadas pelo mesmo payout.
    await tx.referralMonthlyCommission.updateMany({
      where: { payoutId },
      data: { status: "PAID", paidAt: now },
    })

    const reread = await tx.referralPayout.findUniqueOrThrow({ where: { id: payoutId } })
    return { freshlyPaid: true, payout: reread, referrerTenantId: existing.referrerTenantId, amount: existing.amount }
  })

  if (result.freshlyPaid) {
    await createNotification({
      audience: "TENANT",
      tenantId: result.referrerTenantId,
      level: "SUCCESS",
      title: "Saque de indicacao pago",
      body: `R$ ${Number(result.amount).toFixed(2).replace(".", ",")} liberado.`,
      category: "referral",
      href: "/painel/indicacoes",
    })
  }

  return result.payout
}

/**
 * Marca um payout como FAILED com motivo. Desvincula comissoes (voltam para AVAILABLE).
 */
export async function failPayout(
  payoutId: string,
  reason: string,
): Promise<ReferralPayout> {
  const payout = await prisma.referralPayout.findUnique({
    where: { id: payoutId },
  })
  if (!payout) throw new Error(`Payout ${payoutId} nao encontrado`)

  // Marca FAILED e desvincula os dois motores numa unica transacao — senao uma
  // falha parcial deixaria comissoes presas em payoutId=<falhado>, nunca mais
  // recolhidas (cron e requestPayout exigem payoutId: null).
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.referralPayout.update({
      where: { id: payoutId },
      data: {
        status: "FAILED",
        failureReason: reason,
        processedAt: new Date(),
      },
    })
    await tx.referralCommission.updateMany({
      where: { payoutId },
      data: { payoutId: null },
    })
    await tx.referralMonthlyCommission.updateMany({
      where: { payoutId },
      data: { payoutId: null },
    })
    return u
  })

  await createNotification({
    audience: "TENANT",
    tenantId: payout.referrerTenantId,
    level: "ERROR",
    title: "Saque de indicacao recusado",
    body: reason,
    category: "referral",
    href: "/painel/indicacoes",
  })

  return updated
}

/**
 * Executado pelo cron mensal (dia X).
 *
 * MONTA a lista de pagamentos (revendedor nao solicita saque), mas NAO paga
 * nada sozinho — o pagamento e MANUAL:
 *   1. Promove ReferralCommission PENDING → AVAILABLE quando availableAt <= now().
 *   2. Para cada referrer com saldo AVAILABLE (mesmo abaixo do minimo), cria um
 *      ReferralPayout em status REQUESTED, vinculando as comissoes — e a lista
 *      de "a pagar" do financeiro. O financeiro paga por fora, marca como PAID e
 *      anexa o comprovante (obrigatorio) via /admin/indicacoes/saques ou
 *      /admin/financeiro. Marcar como pago NUNCA acontece automaticamente.
 *   3. Notifica equipe financeira (precisa pagar) e revendedor (em processamento).
 *
 * Idempotente: comissoes ja vinculadas a um payout (payoutId != null) sao puladas.
 */
export async function processMonthlyPayouts(): Promise<{
  released: number
  payoutsCreated: number
  notifiedTenants: number
}> {
  const settings = await readSettings()
  if (!settings.enabled) {
    return { released: 0, payoutsCreated: 0, notifiedTenants: 0 }
  }

  const now = new Date()

  // 0. (removido) O backfill retroativo do motor legado saiu na unificacao: o
  // fechamento mensal ja e idempotente e reapura a janela de catch-up
  // (recentClosedPeriods), inclusive as competencias retidas pelo minimo de
  // indicacoes ativas. Ver computeMonthlyCommissions em ./monthly.ts.

  // 1. Promove PENDING → AVAILABLE para todas que ja venceram
  const eligible = await prisma.referralCommission.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
    },
    select: { id: true, referrerTenantId: true, amount: true },
  })

  if (eligible.length > 0) {
    await prisma.referralCommission.updateMany({
      where: { id: { in: eligible.map((c) => c.id) } },
      data: { status: "AVAILABLE" },
    })
  }

  // 1b. Promove tambem as comissoes mensais por faixas (motor MONTHLY_TIERED).
  const eligibleMonthly = await prisma.referralMonthlyCommission.findMany({
    where: { status: "PENDING", availableAt: { lte: now } },
    select: { id: true },
  })
  if (eligibleMonthly.length > 0) {
    await prisma.referralMonthlyCommission.updateMany({
      where: { id: { in: eligibleMonthly.map((c) => c.id) } },
      data: { status: "AVAILABLE" },
    })
  }

  // 2. Cria payouts automaticos para todos os referrers com saldo AVAILABLE
  // (independente do minimo — pagamento e mensal sem solicitacao).
  // Inclui comissoes que ja estavam AVAILABLE de meses anteriores e ainda nao
  // tinham payout (raro, mas pode ocorrer se houve falha no cron passado).
  // Agrega os DOIS motores (por pagamento + por faixas) no mesmo payout.
  const [availableUnattached, monthlyUnattached] = await Promise.all([
    prisma.referralCommission.findMany({
      where: { status: "AVAILABLE", payoutId: null },
      select: { id: true, referrerTenantId: true, amount: true },
    }),
    prisma.referralMonthlyCommission.findMany({
      where: { status: "AVAILABLE", payoutId: null },
      select: { id: true, referrerTenantId: true, amount: true },
    }),
  ])

  // Agrupa por referrer (ids separados por motor para vincular cada tabela)
  const byReferrer = new Map<
    string,
    { total: Prisma.Decimal; ids: string[]; monthlyIds: string[] }
  >()
  for (const c of availableUnattached) {
    const cur = byReferrer.get(c.referrerTenantId) ?? {
      total: new Prisma.Decimal(0),
      ids: [],
      monthlyIds: [],
    }
    cur.total = cur.total.add(c.amount)
    cur.ids.push(c.id)
    byReferrer.set(c.referrerTenantId, cur)
  }
  for (const c of monthlyUnattached) {
    const cur = byReferrer.get(c.referrerTenantId) ?? {
      total: new Prisma.Decimal(0),
      ids: [],
      monthlyIds: [],
    }
    cur.total = cur.total.add(c.amount)
    cur.monthlyIds.push(c.id)
    byReferrer.set(c.referrerTenantId, cur)
  }

  let payoutsCreated = 0
  let notifiedTenants = 0

  for (const [tenantId, { total, ids, monthlyIds }] of byReferrer.entries()) {
    // BLOQUEIO POR CLAWBACK: se houver alguma comissão marcada como
    // CLAWBACK_PENDING para este referrer, NÃO criamos payout automático
    // até admin resolver. O cancelReason começa com [CLAWBACK_PENDING] —
    // ver cancelCommissionForTenantPayment (refund total de PAID) e
    // freezeCommissionForPartialRefund (refund parcial, SAAS-005) em
    // commission.ts. Cobre qualquer status: o marcador só é setado
    // deliberadamente em clawback/freeze.
    const clawbackPending = await prisma.referralCommission.findFirst({
      where: {
        referrerTenantId: tenantId,
        cancelReason: { startsWith: "[CLAWBACK_PENDING]" },
      },
      select: { id: true, amount: true },
    })
    // Mesmo bloqueio para o motor por faixas (refund de mensalidade marca a
    // comissão mensal AVAILABLE/PAID com [CLAWBACK_PENDING]).
    const clawbackMonthly = clawbackPending
      ? null
      : await prisma.referralMonthlyCommission.findFirst({
          where: {
            referrerTenantId: tenantId,
            cancelReason: { startsWith: "[CLAWBACK_PENDING]" },
          },
          select: { id: true },
        })
    if (clawbackPending || clawbackMonthly) {
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: `Payout automático pulado por clawback pendente`,
        body: `Indicador ${tenantId}: R$ ${total.toFixed(2).replace(".", ",")} aguardando — resolva o clawback primeiro em /admin/indicacoes/comissoes.`,
        category: "referral",
        href: "/admin/indicacoes/comissoes",
      }).catch(swallow("referral.payout.clawback_skip_notify"))
      continue
    }

    // Atomicidade: cada referrer é processado dentro de uma transação. A
    // criação do payout + vinculação das comissões usa CAS — o updateMany
    // exige `payoutId: null` na cláusula where, então duas invocações
    // concorrentes do cron (Vercel pode reentregar em retry) competem; só
    // uma consegue criar+vincular, a outra vê 0 linhas atualizadas e aborta
    // (rollback descarta o payout duplicado).
    const txResult = await prisma.$transaction(async (tx) => {
      const existingPending = await tx.referralPayout.findFirst({
        where: {
          referrerTenantId: tenantId,
          status: { in: ["REQUESTED", "PROCESSING"] },
        },
        select: { id: true },
      })
      if (existingPending) return null

      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, pixKey: true, pixKeyType: true },
      })
      const hasPix = Boolean(tenant?.pixKey && tenant?.pixKeyType)

      const payout = await tx.referralPayout.create({
        data: {
          referrerTenantId: tenantId,
          amount: total,
          method: hasPix ? "ASAAS_PIX" : "MANUAL",
          status: "REQUESTED",
          pixKey: tenant?.pixKey ?? null,
          pixKeyType: tenant?.pixKeyType ?? null,
          requestedAt: now,
          notes:
            "Lista gerada pelo cron mensal. Pagamento MANUAL: pague, marque como pago e anexe o comprovante.",
        },
      })

      // CAS: só vincula comissões que ainda estão sem payout. Se outro processo
      // pegou as mesmas comissões enquanto montávamos o payout, estes updateMany
      // devolvem count=0 e jogamos fora o payout (throw aborta a transação).
      // Vincula os dois motores (por pagamento + por faixas) ao mesmo payout.
      const [linked, linkedMonthly] = await Promise.all([
        tx.referralCommission.updateMany({
          where: { id: { in: ids }, payoutId: null, status: "AVAILABLE" },
          data: { payoutId: payout.id },
        }),
        tx.referralMonthlyCommission.updateMany({
          where: { id: { in: monthlyIds }, payoutId: null, status: "AVAILABLE" },
          data: { payoutId: payout.id },
        }),
      ])
      // Exige vinculo TOTAL: o payout foi criado com amount=total (soma de
      // todos os ids). Se uma execucao concorrente ja pegou parte das
      // comissoes, vincularia menos que o esperado e o amount ficaria inflado
      // (over-pay). Abortamos e o referrer entra na proxima execucao limpa.
      if (
        linked.count !== ids.length ||
        linkedMonthly.count !== monthlyIds.length
      ) {
        throw new Error("payout_race_detected")
      }
      return { tenant, payout, hasPix }
    }).catch((err) => {
      // Race com execucao concorrente (vinculo parcial/total tomado por outra
      // run). Pula este referrer — ele entra limpo na proxima execucao — sem
      // abortar o cron inteiro.
      if (err instanceof Error && err.message === "payout_race_detected") {
        return null
      }
      throw err
    })

    if (!txResult) continue

    const { tenant, hasPix } = txResult
    payoutsCreated += 1

    // Notifica revendedor — pagamento é MANUAL (feito pelo financeiro após
    // conferência). Não prometemos pagamento automático.
    await createNotification({
      audience: "TENANT",
      tenantId,
      level: "INFO",
      title: "Comissao de indicacao em processamento",
      body: `R$ ${total.toFixed(2).replace(".", ",")} liberado. O pagamento e feito manualmente pela equipe financeira apos conferencia; o comprovante ficara disponivel aqui.`,
      category: "referral",
      href: "/painel/indicacoes",
    })

    // Notifica a equipe financeira — eles pagam manualmente.
    await createNotification({
      audience: "ROLE",
      roleTarget: "PMB_FINANCEIRO",
      level: "WARNING",
      title: `Comissao a pagar: ${tenant?.name ?? tenantId}`,
      body: `R$ ${total.toFixed(2).replace(".", ",")} ${hasPix ? "via PIX" : "(sem PIX cadastrado, pagar manual)"}. Pague, marque como pago e anexe o comprovante em /admin/indicacoes/saques.`,
      category: "referral",
      href: "/admin/indicacoes/saques",
    })
    notifiedTenants += 1
  }

  return {
    released: eligible.length + eligibleMonthly.length,
    payoutsCreated,
    notifiedTenants,
  }
}
