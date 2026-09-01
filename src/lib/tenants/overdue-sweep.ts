/**
 * Varredura da inadimplência das unidades: suspende, avisa e CANCELA.
 *
 * Uma passada só, com a régua de `overdue-policy.ts` decidindo o que cada
 * unidade merece. Estava tudo dentro da rota do cron; virou módulo quando o
 * cancelamento automático entrou — a rota não tinha teste nenhum, e a ação nova
 * é a única do sistema que encerra a assinatura no Asaas SEM ninguém clicar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CANCELAR É IRREVERSÍVEL: TRÊS PROVAS ANTES DE DESTRUIR
 *
 * O sinal local ("existe TenantPayment OVERDUE") é bom o bastante para suspender
 * — suspensão se desfaz sozinha no `reactivate-paid`. Para cancelar, não é:
 * `status` é MUTÁVEL e reescrito a cada evento do webhook, e um webhook perdido
 * deixa a linha OVERDUE para sempre. Cancelar por causa de uma linha velha
 * mataria uma unidade adimplente. Por isso, antes de cancelar:
 *
 *   1. a cobrança não pode ter `paidAt`/`markedPaidAt` (campos que sobrevivem à
 *      reescrita de status);
 *   2. não pode existir cobrança de ciclo POSTERIOR já paga — se a unidade pagou
 *      o mês seguinte, a linha antiga é resíduo de reconciliação, não dívida;
 *   3. o Asaas tem que CONFIRMAR, na hora, que a cobrança segue em aberto — e
 *      "em aberto" é `deleted: false` MAIS um status de aberto. O DELETE do
 *      Asaas é soft: a cobrança removida responde 200 e guarda o último status,
 *      então olhar só o status faz esta prova ratificar dívida inexistente.
 *
 * Qualquer dúvida — Asaas fora do ar, id que não resolve, cobrança removida,
 * status inesperado — pula o cancelamento e deixa para a próxima execução.
 * Fail-closed: adiar o cancelamento custa 6 horas; cancelar errado custa um
 * cliente.
 */
import { prisma } from "@/lib/prisma"
import { blockTenantStudents } from "@/lib/auto-block"
import { sendEmail } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"
import { logAudit } from "@/lib/audit"
import { invalidateTenantCache } from "@/lib/tenant/cache-invalidation"
import { contextLogger } from "@/lib/logger"
import { getPayment, AsaasApiError } from "@/lib/asaas/client"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import {
  cancelTenant,
  shouldBlockStudentsOnCancel,
  CANCELABLE_TENANT_SELECT,
} from "@/lib/resellers/cancel"
import {
  cancelDateFor,
  cancelWarningOffset,
  cancellationNoticeLine,
  formatBrDate,
  money,
  overdueAction,
  overdueDays,
  readCancellationPolicy,
  OVERDUE_TENANT_STATUSES,
  resolveOverdueRuler,
  shouldWarnCancellation,
  type OverdueRuler,
} from "./overdue-policy"

// Throttle entre emails para não estourar o rate limit do provedor.
const EMAIL_THROTTLE_MS = 120
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Teto de cancelamentos por execução. Progresso garantido: a unidade cancelada
 * sai do filtro (`status` deixa de estar em OVERDUE_TENANT_STATUSES), então o
 * resto entra na execução seguinte, 6h depois. Existe pelo backlog: quando a
 * regra subiu havia 13 unidades já passadas do prazo, e cada cancelamento faz de
 * 2 a 4 chamadas ao Asaas.
 */
const CANCEL_BATCH = 25

/** Status do Asaas que significam "esta cobrança ainda está em aberto". */
const OPEN_ASAAS_STATUSES = new Set(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"])
/** Status do Asaas que provam que o dinheiro entrou. */
const PAID_ASAAS_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"])

export interface OverdueSweepOptions {
  now?: Date
  /** Só calcula e relata — não escreve, não fala com o Asaas, não avisa. */
  dryRun?: boolean
}

export interface SweptTenant {
  slug: string
  name: string
  ageDays: number
  /** Vencimento da cobrança mais antiga em aberto (YYYY-MM-DD). */
  overdueSince: string
  amount: number
}

export interface OverdueSweepResult {
  inspected: number
  suspended: number
  cancelled: number
  warned: number
  studentsBlocked: number
  /** Quem seria cancelado (dry-run) ou foi (execução real). */
  cancelledTenants: SweptTenant[]
  /** Passou do prazo mas NÃO foi cancelado — com o motivo. */
  skippedCancellations: (SweptTenant & { reason: string })[]
  dryRun: boolean
  errors: string[]
}

type CancelCheck = { ok: true } | { ok: false; reason: string }

/**
 * A cobrança é mesmo uma dívida em aberto AGORA?
 *
 * Ver o cabeçalho do módulo. Chamada só no caminho do cancelamento — a suspensão
 * não paga esta ida ao Asaas porque se desfaz sozinha.
 */
async function confirmDelinquency(
  tenantId: string,
  charge: { id: string; asaasPaymentId: string; dueDate: Date; installmentId: string | null },
  options: { dryRun: boolean },
): Promise<CancelCheck> {
  // Mensalidade PARCELADA no cartão: `asaasPaymentId` guarda o id do
  // PARCELAMENTO (`ins_...`), que não resolve em GET /payments/{id}. O valor
  // cheio já foi autorizado no cartão — não há dívida a cobrar aqui.
  if (charge.installmentId || charge.asaasPaymentId.startsWith("ins_")) {
    return { ok: false, reason: "mensalidade_parcelada_no_cartao" }
  }

  // Ciclo posterior já pago => a linha antiga é resíduo de webhook perdido.
  const laterPaid = await prisma.tenantPayment.findFirst({
    where: {
      tenantId,
      id: { not: charge.id },
      dueDate: { gte: charge.dueDate },
      OR: [{ paidAt: { not: null } }, { markedPaidAt: { not: null } }],
    },
    select: { id: true },
  })
  if (laterPaid) return { ok: false, reason: "cobranca_posterior_paga" }

  if (options.dryRun) return { ok: true }

  let payment
  try {
    payment = await getPayment(charge.asaasPaymentId)
  } catch (error) {
    // 404 = o id não resolve na conta. NÃO é o caso comum de cobrança removida
    // (essa responde 200 com `deleted: true`, tratado logo abaixo): aqui é id
    // de outra conta ou expurgado de vez. De todo modo não é dívida.
    if (error instanceof AsaasApiError && error.statusCode === 404) {
      return { ok: false, reason: "cobranca_inexistente_no_asaas" }
    }
    return { ok: false, reason: "asaas_indisponivel" }
  }

  // A cobrança foi REMOVIDA no Asaas (renegociação, assinatura recriada, ajuste
  // manual do operador). O DELETE de lá é SOFT: ela responde 200 e MANTÉM o
  // último status — PENDING/OVERDUE. Sem esta guarda, `OPEN_ASAAS_STATUSES`
  // abaixo lê "em aberto" e a terceira prova — a que existe exatamente para
  // impedir o cancelamento por uma linha velha — ratifica uma dívida que não
  // existe. Cancelar uma unidade por uma cobrança que o próprio operador apagou
  // é o pior desfecho possível daqui, e é irreversível.
  if (payment.deleted) {
    // Reconcilia na hora, como o ramo `pago_no_asaas` logo abaixo: sem isto a
    // linha segue OVERDUE e a varredura volta a este mesmo ponto amanhã. NÃO
    // reativa nada — cobrança apagada não é pagamento, e a unidade continua
    // suspensa até pagar de fato.
    await prisma.tenantPayment
      .update({ where: { id: charge.id }, data: { status: "DELETED" } })
      .catch(() => undefined)
    return { ok: false, reason: "cobranca_removida_no_asaas" }
  }

  if (PAID_ASAAS_STATUSES.has(payment.status)) {
    // Reconcilia na hora: sem isto a unidade seguiria suspensa até o próximo
    // `reconcile-tenant-payments`, e voltaria a este mesmo ponto em 6h.
    await prisma.tenantPayment
      .update({
        where: { id: charge.id },
        data: {
          status: payment.status,
          paidAt: new Date(payment.paymentDate ?? payment.clientPaymentDate ?? Date.now()),
        },
      })
      .catch(() => undefined)
    return { ok: false, reason: "pago_no_asaas" }
  }

  if (!OPEN_ASAAS_STATUSES.has(payment.status)) {
    // Estorno, chargeback, dunning: estado que ninguém previu aqui. Não cancela.
    return { ok: false, reason: `asaas_status_${payment.status}` }
  }

  return { ok: true }
}

export async function runOverdueSweep(
  options: OverdueSweepOptions = {},
): Promise<OverdueSweepResult> {
  const now = options.now ?? new Date()
  const dryRun = options.dryRun ?? false
  const log = contextLogger()

  const result: OverdueSweepResult = {
    inspected: 0,
    suspended: 0,
    cancelled: 0,
    warned: 0,
    studentsBlocked: 0,
    cancelledTenants: [],
    skippedCancellations: [],
    dryRun,
    errors: [],
  }

  const candidates = await prisma.tenant.findMany({
    where: {
      status: { in: [...OVERDUE_TENANT_STATUSES] },
      slug: { not: PMB_TENANT_SLUG },
      tenantPayments: {
        some: {
          status: "OVERDUE",
          // Campos que SOBREVIVEM à reescrita de status pelo webhook: sem eles,
          // uma cobrança quitada na mão seguiria contando como dívida.
          paidAt: null,
          markedPaidAt: null,
        },
      },
    },
    select: {
      ...CANCELABLE_TENANT_SELECT,
      name: true,
      billingMode: true,
      cancellationPolicy: true,
      tenantPayments: {
        where: { status: "OVERDUE", paidAt: null, markedPaidAt: null },
        orderBy: { dueDate: "asc" },
        take: 1,
        select: {
          id: true,
          amount: true,
          dueDate: true,
          asaasPaymentId: true,
          installmentId: true,
        },
      },
      owner: { select: { email: true, name: true } },
    },
    orderBy: { id: "asc" },
  })

  result.inspected = candidates.length
  log.info(
    { event: "sweep_tenants.start", candidates: candidates.length, dryRun },
    "iniciando varredura de unidades inadimplentes",
  )

  for (const tenant of candidates) {
    const charge = tenant.tenantPayments[0]
    if (!charge) continue

    const ruler = resolveOverdueRuler(tenant.cancellationPolicy)
    const ageDays = overdueDays(charge.dueDate, now)
    const swept: SweptTenant = {
      slug: tenant.slug,
      name: tenant.name,
      ageDays,
      overdueSince: charge.dueDate.toISOString().slice(0, 10),
      amount: Number(charge.amount),
    }

    try {
      let action = overdueAction({ ageDays, status: tenant.status, ruler })

      if (action === "cancel") {
        // Adiar o cancelamento REBAIXA a ação para suspender; não pula a
        // unidade. `overdueAction` testa "cancel" ANTES de "suspend", então um
        // `continue` aqui deixava uma unidade ACTIVE (webhook de OVERDUE
        // perdido) e 9 dias vencida seguir VENDENDO indefinidamente: nunca
        // cancelada, porque a prova falha sempre (`installmentId` de mensalidade
        // parcelada, Asaas fora do ar), e nunca suspensa, porque o ramo de
        // suspensão estava abaixo do `continue`.
        const skip =
          result.cancelled >= CANCEL_BATCH
            ? { reason: "teto_da_execucao" as const }
            : await (async () => {
                const check = await confirmDelinquency(tenant.id, charge, { dryRun })
                return check.ok ? null : { reason: check.reason }
              })()

        if (skip) {
          result.skippedCancellations.push({ ...swept, reason: skip.reason })
          log.warn(
            {
              event: "sweep_tenants.cancel_skipped",
              tenantId: tenant.id,
              slug: tenant.slug,
              ageDays,
              reason: skip.reason,
            },
            "cancelamento automático adiado",
          )
          // A unidade já passou de `cancelAfterDays`, que nunca é menor que
          // `suspendAfterDays` — se ainda está no ar, tem que sair.
          action = tenant.status === "SUSPENDED" ? "none" : "suspend"
        } else if (dryRun) {
          result.cancelled += 1
          result.cancelledTenants.push(swept)
          continue
        } else {
          await cancelTenantForDelinquency(tenant, charge, ageDays, ruler, result)
          continue
        }
      }

      if (action === "suspend") {
        if (dryRun) {
          result.suspended += 1
        } else {
          await suspendTenant(tenant, charge, ageDays, ruler, result)
        }
      }

      if (shouldWarnCancellation(ageDays, ruler)) {
        if (dryRun) {
          result.warned += 1
        } else if (await warnBeforeCancel(tenant, charge, ageDays, ruler)) {
          result.warned += 1
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`tenant ${tenant.slug}: ${message}`)
      log.error(
        { err: error, event: "sweep_tenants.tenant_failed", tenantId: tenant.id },
        "sweep-tenants: falha no processamento da unidade",
      )
    }
  }

  log.info(
    {
      event: "sweep_tenants.done",
      inspected: result.inspected,
      suspended: result.suspended,
      cancelled: result.cancelled,
      warned: result.warned,
      studentsBlocked: result.studentsBlocked,
      skippedCancellations: result.skippedCancellations.length,
      errorCount: result.errors.length,
      dryRun,
    },
    "varredura de unidades inadimplentes concluída",
  )

  return result
}

type Candidate = {
  id: string
  slug: string
  name: string
  status: string
  customDomain: string | null
  asaasSubscriptionId: string | null
  asaasPromoSubscriptionId: string | null
  billingMode: string
  cancellationPolicy: unknown
  owner: { email: string | null; name: string | null } | null
}

type OverdueCharge = { id: string; amount: unknown; dueDate: Date }

/** D+3 (ou a carência da unidade): fora do ar, alunos bloqueados se AUTO. */
async function suspendTenant(
  tenant: Candidate,
  charge: OverdueCharge,
  ageDays: number,
  ruler: OverdueRuler,
  result: OverdueSweepResult,
): Promise<void> {
  const log = contextLogger()
  const policy = readCancellationPolicy(tenant.cancellationPolicy)
  // ATENÇÃO: o padrão da SUSPENSÃO é o oposto do padrão do CANCELAMENTO.
  // Aqui, política ausente => bloqueia (é o comportamento que já rodava em
  // produção; a suspensão se desfaz sozinha quando a unidade paga). No
  // cancelamento, política ausente => MANTÉM o aluno. Não unificar.
  const blockStudents = tenant.billingMode === "AUTO" && !policy?.keepStudentsActive

  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } })
  // PERF-001: invalida o cache p/ a vitrine refletir o bloqueio na hora.
  await invalidateTenantCache(tenant.id)
  result.suspended += 1
  log.warn(
    {
      event: "sweep_tenants.suspended",
      tenantId: tenant.id,
      slug: tenant.slug,
      ageDays,
      billingMode: tenant.billingMode,
    },
    "unidade suspensa por inadimplência",
  )

  if (blockStudents) {
    const block = await blockTenantStudents(tenant.id)
    result.studentsBlocked += block.affectedStudents
    if (block.errors.length > 0) {
      result.errors.push(`tenant ${tenant.slug}: ${block.errors.length} erro(s) bloqueando alunos`)
    }
  }

  const aviso = ruler.autoCancel ? ` ${cancellationNoticeLine(charge.dueDate, ruler)}` : ""
  const situacao = blockStudents
    ? "Sua mensalidade venceu. Para evitar perda de receita, seus alunos foram bloqueados temporariamente até a regularização."
    : "Sua mensalidade venceu. Regularize agora para manter a vitrine ativa e evitar o bloqueio dos seus alunos."

  if (tenant.owner?.email) {
    await sendEmail({
      to: tenant.owner.email,
      subject: "Sua mensalidade está vencida",
      template: {
        type: "payment",
        props: {
          customerName: tenant.owner.name ?? tenant.name,
          amount: money(Number(charge.amount)),
          paymentDate: formatBrDate(charge.dueDate),
          description: situacao + aviso,
          variant: "overdue",
        },
      },
    }).catch((err) => {
      log.error(
        { err, event: "sweep_tenants.email_failed", tenantId: tenant.id },
        "sweep-tenants: envio de email falhou",
      )
    })
    await sleep(EMAIL_THROTTLE_MS)
  }

  await createNotification({
    audience: "TENANT",
    tenantId: tenant.id,
    level: "ERROR",
    title: "Conta suspensa por inadimplência",
    body:
      (blockStudents
        ? "Mensalidade vencida. Seus alunos foram bloqueados."
        : "Mensalidade vencida. Regularize para evitar bloqueios.") + aviso,
    category: "tenant-billing",
    href: "/painel/cobrancas",
    // O email transacional acima já cobre este evento; a ponte notificação→email
    // mandaria um segundo email dizendo a mesma coisa.
    suppressEmail: true,
  })
  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "WARNING",
    title: `Sweep: unidade ${tenant.name} suspensa`,
    body: `Mensalidade vencida há ${ageDays} dia(s).`,
    category: "tenant-billing",
    href: `/admin/revendedores/${tenant.id}`,
  })
}

/** D+5 (2 dias antes do corte): último aviso, idempotente por cobrança. */
async function warnBeforeCancel(
  tenant: Candidate,
  charge: OverdueCharge & { id: string },
  ageDays: number,
  ruler: OverdueRuler,
): Promise<boolean> {
  // Reivindica a janela ANTES de avisar — mesma mecânica dos lembretes D-5/D-2.
  const claim = await prisma.tenantPaymentReminder.createMany({
    data: [{ tenantPaymentId: charge.id, offsetDays: cancelWarningOffset(ruler) }],
    skipDuplicates: true,
  })
  if (claim.count === 0) return false

  const valor = money(Number(charge.amount))
  await createNotification({
    audience: "TENANT",
    tenantId: tenant.id,
    level: "ERROR",
    title: `Último aviso: sua unidade será cancelada em ${formatBrDate(cancelDateFor(charge.dueDate, ruler))}`,
    body: `A mensalidade de ${valor}, vencida em ${formatBrDate(charge.dueDate)}, está ${ageDays} dias em atraso. ${cancellationNoticeLine(charge.dueDate, ruler)} O cancelamento encerra a assinatura, tira a vitrine do ar e não é revertido pelo pagamento posterior.`,
    category: "tenant-billing",
    href: "/painel/cobrancas",
  })
  return true
}

/** D+7: cancela de verdade — Asaas, banco, alunos, cache e trilha. */
async function cancelTenantForDelinquency(
  tenant: Candidate,
  charge: OverdueCharge,
  ageDays: number,
  ruler: OverdueRuler,
  result: OverdueSweepResult,
): Promise<void> {
  const log = contextLogger()
  const swept: SweptTenant = {
    slug: tenant.slug,
    name: tenant.name,
    ageDays,
    overdueSince: charge.dueDate.toISOString().slice(0, 10),
    amount: Number(charge.amount),
  }

  const outcome = await cancelTenant(tenant, {
    // A política da unidade manda, igual ao cancelamento manual e ao em lote: o
    // aluno pagou o curso dele; quem não pagou a mensalidade foi a unidade.
    blockStudents: shouldBlockStudentsOnCancel(tenant.cancellationPolicy),
    deleteOpenCharges: true,
  })

  if (!outcome.ok) {
    // Falha no Asaas aborta ANTES do banco (ver lib/resellers/cancel): a unidade
    // continua suspensa e a próxima execução tenta de novo.
    result.skippedCancellations.push({ ...swept, reason: `falha_asaas: ${outcome.error}` })
    result.errors.push(`tenant ${tenant.slug}: ${outcome.error}`)
    return
  }

  result.cancelled += 1
  result.studentsBlocked += outcome.studentsBlocked
  result.cancelledTenants.push(swept)

  log.warn(
    {
      event: "sweep_tenants.cancelled",
      tenantId: tenant.id,
      slug: tenant.slug,
      ageDays,
      cancelAfterDays: ruler.cancelAfterDays,
      deletedCharges: outcome.deletedCharges,
      studentsBlocked: outcome.studentsBlocked,
    },
    "unidade cancelada automaticamente por inadimplência",
  )

  await logAudit({
    action: "tenant.cancel",
    resource: "Tenant",
    resourceId: tenant.id,
    actorUserId: null,
    actorRole: "SYSTEM",
    tenantId: tenant.id,
    payloadBefore: {
      slug: outcome.before.slug,
      status: outcome.before.status,
      hadAsaasSubscription: outcome.before.hadSubscription,
      hadAsaasPromoSubscription: outcome.before.hadPromoSubscription,
    },
    payloadAfter: {
      status: "CANCELLED",
      cancelledSubscriptions: outcome.cancelledSubscriptions,
      deletedCharges: outcome.deletedCharges,
      studentsBlocked: outcome.studentsBlocked,
      warnings: outcome.warnings,
      // Distingue esta linha do cancelamento manual e do lote na trilha.
      origem: "auto_inadimplencia",
      ageDays,
      cancelAfterDays: ruler.cancelAfterDays,
      overdueSince: swept.overdueSince,
    },
  })

  if (outcome.warnings.length > 0) {
    result.errors.push(...outcome.warnings.map((w) => `tenant ${tenant.slug}: ${w}`))
  }

  if (tenant.owner?.email) {
    await sendEmail({
      to: tenant.owner.email,
      subject: "Sua unidade foi cancelada por inadimplência",
      template: {
        type: "payment",
        props: {
          customerName: tenant.owner.name ?? tenant.name,
          amount: money(Number(charge.amount)),
          paymentDate: formatBrDate(charge.dueDate),
          description: `Sua unidade foi CANCELADA após ${ageDays} dias de atraso na mensalidade vencida em ${formatBrDate(charge.dueDate)}. A assinatura foi encerrada e as cobranças em aberto, canceladas. Para voltar a operar, fale com o nosso time comercial.`,
          variant: "overdue",
        },
      },
    }).catch(() => undefined)
    await sleep(EMAIL_THROTTLE_MS)
  }

  await createNotification({
    audience: "TENANT",
    tenantId: tenant.id,
    level: "ERROR",
    title: "Unidade cancelada por inadimplência",
    body: `A mensalidade vencida em ${formatBrDate(charge.dueDate)} completou ${ageDays} dias de atraso. A assinatura foi encerrada e a vitrine saiu do ar.`,
    category: "tenant-billing",
    href: "/painel/cobrancas",
    suppressEmail: true,
  })

  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "ERROR",
    title: `Unidade ${tenant.name} cancelada por inadimplência`,
    body: `${ageDays} dias de atraso na mensalidade de ${money(Number(charge.amount))} vencida em ${formatBrDate(charge.dueDate)}. Assinatura encerrada, ${outcome.deletedCharges} cobrança(s) em aberto removida(s), ${outcome.studentsBlocked} aluno(s) bloqueado(s).`,
    category: "tenant-billing",
    href: `/admin/revendedores/${tenant.id}`,
  })
}
