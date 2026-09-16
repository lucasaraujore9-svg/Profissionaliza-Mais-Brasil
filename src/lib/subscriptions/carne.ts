import type { SubscriptionInterval } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { PAYER_SELECT, resolvePayer, type PayerSource } from "@/lib/checkout/payer"
import { assertPmbCharge } from "@/lib/checkout/assert-tenant-gateway"
import {
  AsaasApiError,
  createPayment as createAsaasPayment,
  decryptTenantAsaasKey,
  deletePayment as deleteAsaasPayment,
  findOrCreateAsaasCustomer,
  listPayments as listAsaasPayments,
  motherAsaasKey,
} from "@/lib/asaas/client"
import type { AsaasPayment } from "@/lib/asaas/types"
import {
  asaasBoletoInstrument,
  type BoletoInstrument,
} from "@/lib/asaas/payment-instrument"
import {
  cancelPayment as cancelMpPayment,
  createPayment as createMpPayment,
  decryptTenantMpToken,
  MPApiError,
} from "@/lib/mercadopago/client"
import { resolveEnrollmentGatewayKeys } from "@/lib/enrollment/gateway-credentials"
import { advisoryLockKeyFrom, withAdvisoryLock } from "@/lib/enrollment/fulfill"
import { isWithinRevealWindow } from "@/lib/installments/schedule"
import { runInChunks } from "@/lib/concurrency"
import {
  hasCompleteBoletoAddress,
  mpBoletoPaymentParams,
  type BoletoAddress,
} from "@/lib/installments/mp-boleto"
import { asaasWebhookUrl, mpWebhookUrl } from "@/lib/tenant/urls"
import { isRecurringInterval } from "./interval"
import {
  CARNE_OPEN_STATUSES,
  CARNE_STATUS,
  MP_CARNE_REF_PREFIX,
  SUBSCRIPTION_CARNE_MIN_AMOUNT,
  SUBSCRIPTION_CARNE_SELF_SERVICE_DUE_DAYS,
  carneDueDate,
  carneDueInDays,
} from "./carne-schedule"

/**
 * Assinatura NO BOLETO (carne): criar, emitir e cancelar os boletos.
 *
 * A plataforma emite UM boleto por ciclo, na conta da loja, nos dois gateways
 * (regras e motivos em `carne-schedule.ts`). Os boletos sao as linhas NUMERADAS
 * de `SubscriptionPayment`; a assinatura nao tem recorrencia no gateway.
 *
 *  - **Asaas:** todos os boletos do carne saem na venda (`POST /payments`, um
 *    por ciclo, com a referencia `pmb_sub_<id>` — a mesma que o webhook ja usa
 *    para achar a assinatura). Os de renovacao, pelo cron.
 *  - **Mercado Pago:** o boleto expira no vencimento, entao so o 1o sai na
 *    venda; o cron emite cada um dos outros 7 dias antes do vencimento, e
 *    reemite o que venceu sem pagamento.
 *
 * Liquidacao, atraso e corte seguem o caminho da assinatura
 * (`settleSubscriptionCycle`, varredura de carencia) — o carne so muda QUEM
 * emite a cobranca e como o fim do periodo e calculado.
 */

/** Recusa acionavel (cadastro incompleto, pedido invalido) — vira 400. */
export class CarneInputError extends Error {}

const STUDENT_SELECT = {
  ...PAYER_SELECT,
  cep: true,
  rua: true,
  numero: true,
  bairro: true,
  cidade: true,
  estado: true,
} as const

interface CarneContext {
  sub: {
    id: string
    tenantId: string | null
    status: string
    interval: SubscriptionInterval
    priceAtPurchase: unknown
    gateway: "MP" | "ASAAS"
    asaasCustomerId: string | null
    planName: string
    student: PayerSource & BoletoAddress
  }
  tenant: {
    id: string
    slug: string
    asaasApiKey: string | null
    mpAccessToken: string | null
  } | null
}

async function loadContext(subscriptionId: string): Promise<CarneContext | null> {
  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      interval: true,
      priceAtPurchase: true,
      gateway: true,
      asaasCustomerId: true,
      plan: { select: { name: true } },
      student: { select: STUDENT_SELECT },
      tenant: {
        select: { id: true, slug: true, asaasApiKey: true, mpAccessToken: true },
      },
    },
  })
  if (!sub) return null
  return {
    sub: {
      id: sub.id,
      tenantId: sub.tenantId,
      status: sub.status,
      interval: sub.interval,
      priceAtPurchase: sub.priceAtPurchase,
      gateway: sub.gateway,
      asaasCustomerId: sub.asaasCustomerId,
      planName: sub.plan.name,
      student: sub.student,
    },
    tenant: sub.tenant,
  }
}

/**
 * O pagador consegue receber boleto neste gateway? Conferido ANTES de criar
 * qualquer linha, para a venda recusar com uma mensagem que o vendedor
 * consegue resolver — e nao com um 502 depois de metade do carne emitido.
 */
function assertPayerReady(ctx: CarneContext): { nome: string; email: string; cpf: string } {
  const payer = resolvePayer(ctx.sub.student)
  const quem = payer.kind === "GUARDIAN" ? "Responsável financeiro" : "Aluno"
  if (!payer.cpf) {
    throw new CarneInputError(`${quem} sem CPF cadastrado — o boleto exige o CPF de quem paga.`)
  }
  if (!payer.email) {
    throw new CarneInputError(`${quem} sem e-mail cadastrado — o boleto exige o e-mail de quem paga.`)
  }
  if (ctx.sub.gateway === "MP" && !hasCompleteBoletoAddress(ctx.sub.student)) {
    throw new CarneInputError(
      "Informe o endereço completo do aluno (CEP, rua, número, bairro, cidade e UF) — o Mercado Pago exige no boleto.",
    )
  }
  return { nome: payer.nome, email: payer.email, cpf: payer.cpf }
}

// ── Criação ─────────────────────────────────────────────────────────────────

export interface CreateCarneInput {
  subscriptionId: string
  /** Boletos gerados agora (os seguintes saem sozinhos, na renovação). */
  count: number
  /** Vencimento do 1º boleto, ao meio-dia UTC. */
  firstDueDate: Date
}

export interface CreateCarneResult {
  /** PDF + linha digitável do 1º boleto, para mostrar/enviar na hora. */
  firstBoleto: BoletoInstrument | null
  count: number
  amount: number
}

/**
 * Transforma a assinatura (PENDING, sem nada no gateway) numa assinatura no
 * boleto: grava a marca, cria as linhas do carne e emite.
 *
 * Lança se o 1º boleto não sair — o chamador desfaz com
 * `discardSubscriptionCarne` (venda nova) ou `resetSubscriptionCarne` (link
 * já enviado). Falha num boleto seguinte NÃO derruba a venda: a linha fica
 * agendada e o cron tenta de novo.
 */
export async function createSubscriptionCarne(
  input: CreateCarneInput,
): Promise<CreateCarneResult> {
  const ctx = await loadContext(input.subscriptionId)
  if (!ctx) throw new Error(`assinatura ${input.subscriptionId} não encontrada`)
  const { sub } = ctx

  if (!isRecurringInterval(sub.interval) && input.count !== 1) {
    throw new CarneInputError("Acesso vitalício é pago num boleto só.")
  }
  const amount = Number(sub.priceAtPurchase)
  if (!(amount >= SUBSCRIPTION_CARNE_MIN_AMOUNT)) {
    throw new CarneInputError(
      `Cada boleto precisa ser de pelo menos R$ ${SUBSCRIPTION_CARNE_MIN_AMOUNT},00.`,
    )
  }
  assertPayerReady(ctx)

  const existing = await prisma.subscriptionPayment.count({
    where: { subscriptionId: sub.id },
  })
  if (existing > 0) {
    // Carnê só nasce em assinatura sem cobrança nenhuma: somar boletos a uma
    // recorrência que o gateway já cobra cobraria o aluno duas vezes.
    throw new Error(`assinatura ${sub.id} já tem cobranças — carnê recusado`)
  }

  await prisma.studentSubscription.update({
    where: { id: sub.id },
    data: {
      boletoCarne: true,
      billingType: "BOLETO",
      // A referência que o webhook do Asaas usa para achar esta assinatura.
      externalReference: `pmb_sub_${sub.id}`,
    },
  })

  // Escritas SEQUENCIAIS (sem $transaction em lote — o pooler do Supabase
  // derruba o batch em prod).
  const rows: Array<{ id: string; number: number; dueDate: Date }> = []
  for (let n = 1; n <= input.count; n++) {
    const created = await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: sub.id,
        tenantId: sub.tenantId,
        number: n,
        amount,
        gateway: sub.gateway,
        status: CARNE_STATUS.SCHEDULED,
        billingType: "BOLETO",
        dueDate: carneDueDate(input.firstDueDate, sub.interval, n),
      },
      select: { id: true, dueDate: true },
    })
    rows.push({ id: created.id, number: n, dueDate: created.dueDate })
  }

  const first = await emitCarneRow(rows[0].id)
  if (first.status !== "emitted" && first.status !== "already") {
    throw new Error(`1º boleto da assinatura ${sub.id} não foi emitido (${first.status})`)
  }

  // Asaas: o carnê inteiro sai agora. MP: só o que já está na janela — um
  // boleto do MP emitido meses antes expiraria no vencimento de qualquer forma,
  // e o cron o emite na hora certa. Em lotes pequenos: 24 boletos em fila
  // deixariam a venda esperando dezenas de segundos (o lock é por linha, então
  // o paralelo não duplica nada).
  const now = new Date()
  const rest = rows
    .slice(1)
    .filter((row) => sub.gateway === "ASAAS" || isWithinRevealWindow(row, now))
  const settled = await runInChunks(rest, 4, (row) => emitCarneRow(row.id))
  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      contextLogger().warn(
        {
          err: r.reason,
          event: "subscription.carne.emit_deferred",
          subscriptionId: sub.id,
          number: rest[i].number,
        },
        "boleto do carnê não saiu na venda — o cron tenta de novo",
      )
    }
  })

  contextLogger().info(
    {
      event: "subscription.carne.created",
      subscriptionId: sub.id,
      tenantId: sub.tenantId,
      gateway: sub.gateway,
      count: input.count,
    },
    "assinatura no boleto criada",
  )

  return { firstBoleto: first.boleto ?? null, count: input.count, amount }
}

// ── Emissão ─────────────────────────────────────────────────────────────────

export type EmitCarneResult =
  | { status: "emitted" | "already"; boleto: BoletoInstrument | null }
  | { status: "skipped" | "busy" }

const ROW_SELECT = {
  id: true,
  subscriptionId: true,
  number: true,
  amount: true,
  dueDate: true,
  status: true,
  paidAt: true,
  gateway: true,
  asaasPaymentId: true,
  mpPaymentId: true,
  bankSlipUrl: true,
  digitableLine: true,
  emitAttempts: true,
} as const

type CarneRow = {
  id: string
  subscriptionId: string
  number: number | null
  amount: unknown
  dueDate: Date
  status: string
  paidAt: Date | null
  gateway: "MP" | "ASAAS"
  asaasPaymentId: string | null
  mpPaymentId: string | null
  bankSlipUrl: string | null
  digitableLine: string | null
  emitAttempts: number
}

/**
 * Emite o boleto de UMA linha do carne. Idempotente: linha já emitida devolve o
 * boleto dela, linha paga/cancelada é pulada. O lock por linha impede que a
 * venda e o cron (ou dois crons) emitam o mesmo boleto duas vezes.
 */
export async function emitCarneRow(rowId: string): Promise<EmitCarneResult> {
  let result: EmitCarneResult = { status: "busy" }
  await withAdvisoryLock(advisoryLockKeyFrom(`SUBSCRIPTION_CARNE_EMIT:${rowId}`), async () => {
    const row = (await prisma.subscriptionPayment.findUnique({
      where: { id: rowId },
      select: ROW_SELECT,
    })) as CarneRow | null
    if (!row || row.number === null || row.paidAt || row.status === CARNE_STATUS.CANCELLED) {
      result = { status: "skipped" }
      return
    }
    if (row.asaasPaymentId || row.mpPaymentId) {
      result = {
        status: "already",
        boleto: row.bankSlipUrl
          ? { url: row.bankSlipUrl, digitableLine: row.digitableLine ?? undefined }
          : null,
      }
      return
    }
    const ctx = await loadContext(row.subscriptionId)
    if (!ctx || ctx.sub.status === "CANCELLED" || ctx.sub.status === "EXPIRED") {
      result = { status: "skipped" }
      return
    }
    const boleto =
      row.gateway === "ASAAS" ? await emitAsaas(row, ctx) : await emitMp(row, ctx)
    result = { status: "emitted", boleto }
  })
  return result
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function todayBr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

function boletoDescription(ctx: CarneContext, row: CarneRow): string {
  return isRecurringInterval(ctx.sub.interval)
    ? `Assinatura ${ctx.sub.planName} — boleto ${row.number}`
    : `Acesso vitalício — ${ctx.sub.planName}`
}

function asaasKeyFor(ctx: CarneContext): string {
  if (!ctx.tenant) {
    // Conta-mãe só para assinatura da vitrine PMB.
    assertPmbCharge({
      enrollmentTenantId: ctx.sub.tenantId,
      studentTenantSlug: null,
      context: "subscription.carne.asaas",
    })
    return motherAsaasKey()
  }
  if (!ctx.tenant.asaasApiKey) {
    throw new Error("unidade sem conta Asaas conectada — boleto não emitido")
  }
  return decryptTenantAsaasKey(ctx.tenant.asaasApiKey)
}

async function asaasCustomerFor(ctx: CarneContext, apiKey: string): Promise<string> {
  if (ctx.sub.asaasCustomerId) return ctx.sub.asaasCustomerId
  const payer = resolvePayer(ctx.sub.student)
  const { customer } = await findOrCreateAsaasCustomer(
    {
      name: payer.nome,
      cpfCnpj: payer.cpf ?? "",
      email: payer.email ?? undefined,
      mobilePhone: payer.fone ?? undefined,
    },
    apiKey,
  )
  await prisma.studentSubscription.update({
    where: { id: ctx.sub.id },
    data: { asaasCustomerId: customer.id },
  })
  ctx.sub.asaasCustomerId = customer.id
  return customer.id
}

/**
 * Cobrança já criada para esta linha numa tentativa que caiu antes de gravar o
 * id. O Asaas não tem chave de idempotência: sem esta busca, a nova tentativa
 * emitiria um SEGUNDO boleto do mesmo ciclo.
 */
async function findOrphanAsaasCharge(
  externalReference: string,
  dueYmd: string,
  apiKey: string,
): Promise<AsaasPayment | null> {
  const list = await listAsaasPayments(
    { externalReference, limit: 100, offset: 0 },
    apiKey,
  ).catch(() => null)
  for (const p of list?.data ?? []) {
    if (p.deleted || p.dueDate !== dueYmd) continue
    if (p.status !== "PENDING" && p.status !== "OVERDUE") continue
    const linked = await prisma.subscriptionPayment.findFirst({
      where: { asaasPaymentId: p.id },
      select: { id: true },
    })
    if (!linked) return p
  }
  return null
}

async function emitAsaas(row: CarneRow, ctx: CarneContext): Promise<BoletoInstrument | null> {
  const apiKey = asaasKeyFor(ctx)
  assertPayerReady(ctx)
  const customer = await asaasCustomerFor(ctx, apiKey)
  const externalReference = `pmb_sub_${ctx.sub.id}`
  // O Asaas não aceita vencimento no passado: boleto atrasado (reemissão ou cron
  // parado) vence hoje. A AGENDA da linha continua a mesma.
  const today = todayBr()
  const dueYmd = ymd(row.dueDate) < today ? today : ymd(row.dueDate)

  const payment =
    (await findOrphanAsaasCharge(externalReference, dueYmd, apiKey)) ??
    (await createAsaasPayment(
      {
        customer,
        billingType: "BOLETO",
        value: Number(row.amount),
        dueDate: dueYmd,
        description: boletoDescription(ctx, row),
        externalReference,
        notificationUrl: asaasWebhookUrl(ctx.tenant?.slug ?? undefined),
      },
      apiKey,
    ))

  const boleto = await asaasBoletoInstrument(payment, apiKey)
  await prisma.subscriptionPayment.update({
    where: { id: row.id },
    data: {
      asaasPaymentId: payment.id,
      status: CARNE_STATUS.PENDING,
      bankSlipUrl: boleto?.url ?? payment.bankSlipUrl ?? null,
      digitableLine: boleto?.digitableLine ?? null,
      generatedAt: new Date(),
      emitAttempts: { increment: 1 },
    },
  })
  return boleto ?? (payment.bankSlipUrl ? { url: payment.bankSlipUrl } : null)
}

async function emitMp(row: CarneRow, ctx: CarneContext): Promise<BoletoInstrument | null> {
  if (!ctx.tenant) {
    // A vitrine PMB assina sempre pelo Asaas da conta-mãe.
    throw new Error("boleto MP de assinatura exige unidade — assinatura é da vitrine PMB")
  }
  if (!ctx.tenant.mpAccessToken) {
    throw new Error("unidade sem Mercado Pago conectado — boleto não emitido")
  }
  const payer = assertPayerReady(ctx)
  const student = ctx.sub.student
  if (!hasCompleteBoletoAddress(student)) {
    throw new CarneInputError("Endereço do aluno incompleto — o Mercado Pago exige no boleto.")
  }

  const attempt = row.emitAttempts + 1
  const externalReference = `${MP_CARNE_REF_PREFIX}${row.id}`
  const payment = await createMpPayment(
    decryptTenantMpToken(ctx.tenant.mpAccessToken),
    mpBoletoPaymentParams({
      amount: Number(row.amount),
      description: boletoDescription(ctx, row),
      externalReference,
      notificationUrl: mpWebhookUrl(ctx.tenant.slug),
      dueDate: row.dueDate,
      payer,
      address: student,
    }),
    // A tentativa entra na chave: o boleto que venceu é reemitido, e com a
    // mesma chave o MP devolveria o pagamento já cancelado.
    `${externalReference}_${attempt}`,
  )

  const url = payment.transaction_details?.external_resource_url ?? null
  const digitableLine = payment.transaction_details?.digitable_line ?? null
  await prisma.subscriptionPayment.update({
    where: { id: row.id },
    data: {
      mpPaymentId: String(payment.id),
      status: CARNE_STATUS.PENDING,
      bankSlipUrl: url,
      digitableLine,
      generatedAt: new Date(),
      emitAttempts: attempt,
    },
  })
  return url ? { url, digitableLine: digitableLine ?? undefined } : null
}

// ── Cancelamento ────────────────────────────────────────────────────────────

/**
 * Cancela no gateway os boletos ainda em aberto e marca as linhas CANCELLED.
 * É a "recorrência a parar" de uma assinatura no boleto: sem isto o aluno
 * seguiria recebendo boletos de uma assinatura encerrada.
 *
 * Só marca o que o gateway confirmou (ou nunca foi emitido); o resto volta como
 * erro para quem chamou alertar.
 */
export async function cancelOpenCarneRows(
  subscriptionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await prisma.subscriptionPayment.findMany({
    where: {
      subscriptionId,
      number: { not: null },
      paidAt: null,
      status: { in: CARNE_OPEN_STATUSES },
    },
    select: { id: true, tenantId: true, asaasPaymentId: true, mpPaymentId: true },
  })
  if (rows.length === 0) return { ok: true }

  const keys = await resolveEnrollmentGatewayKeys({ tenantId: rows[0].tenantId })
  const errors: string[] = []
  for (const row of rows) {
    try {
      if (row.asaasPaymentId) {
        if (!keys.asaasApiKey) throw new Error(keys.missing ?? "chave Asaas indisponível")
        try {
          const res = await deleteAsaasPayment(row.asaasPaymentId, keys.asaasApiKey)
          // DELETE é soft: só `deleted: true` prova que a cobrança saiu.
          if (!res.deleted) throw new Error(`Asaas não confirmou a remoção de ${row.asaasPaymentId}`)
        } catch (err) {
          if (!(err instanceof AsaasApiError && err.statusCode === 404)) throw err
        }
      } else if (row.mpPaymentId) {
        if (!keys.mpAccessToken) throw new Error(keys.missing ?? "token do Mercado Pago indisponível")
        try {
          await cancelMpPayment(keys.mpAccessToken, row.mpPaymentId)
        } catch (err) {
          // 4xx: boleto já cancelado/expirado no MP — nada mais a parar.
          if (!(err instanceof MPApiError && err.statusCode >= 400 && err.statusCode < 500)) {
            throw err
          }
        }
      }
      await prisma.subscriptionPayment.update({
        where: { id: row.id },
        data: { status: CARNE_STATUS.CANCELLED },
      })
    } catch (err) {
      errors.push(`boleto ${row.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return errors.length > 0 ? { ok: false, error: errors.join("; ") } : { ok: true }
}

/**
 * Desfaz o carnê que não chegou a nascer (1º boleto não saiu, ou a venda falhou
 * depois). Cancela o que tenha sido emitido e apaga as linhas não pagas; quem
 * chama decide o destino da assinatura.
 */
async function undoCarne(subscriptionId: string): Promise<void> {
  const cancelled = await cancelOpenCarneRows(subscriptionId)
  if (!cancelled.ok) {
    contextLogger().error(
      { event: "subscription.carne.undo_failed", subscriptionId, error: cancelled.error },
      "boleto de carnê desfeito ficou vivo no gateway",
    )
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: "Boleto de assinatura não cancelado",
      body: `A venda da assinatura ${subscriptionId} falhou, mas um boleto já emitido não pôde ser cancelado no gateway (${cancelled.error}). Cancele à mão para o aluno não pagar por nada.`,
      href: "/admin/alunos",
    }).catch(swallow("subscription.carne.undo"))
  }
  await prisma.subscriptionPayment.deleteMany({
    where: { subscriptionId, number: { not: null }, paidAt: null },
  })
}

/** Venda nova que falhou: some com a assinatura inteira. */
export async function discardSubscriptionCarne(subscriptionId: string): Promise<void> {
  await undoCarne(subscriptionId)
  await prisma.studentSubscription
    .delete({ where: { id: subscriptionId } })
    .catch(swallow("subscription.carne.discard"))
}

/**
 * Assinatura que JÁ EXISTIA (link de pagamento enviado) e em que o boleto não
 * saiu: volta a ser uma assinatura sem cobrança, para o aluno tentar de novo
 * pelo mesmo link — com outro meio, inclusive.
 */
export async function resetSubscriptionCarne(subscriptionId: string): Promise<void> {
  await undoCarne(subscriptionId)
  await prisma.studentSubscription.update({
    where: { id: subscriptionId },
    data: { boletoCarne: false, externalReference: null, billingType: "UNDEFINED" },
  })
}

/**
 * O ALUNO escolheu boleto na loja (checkout ou página de pagamento): a
 * assinatura vira assinatura no boleto, com o 1º boleto vencendo em 3 dias — o
 * mesmo prazo do boleto avulso do checkout. Um boleto só: os seguintes saem na
 * renovação, 7 dias antes de cada vencimento.
 *
 * Quem chama desfaz em caso de erro (`discardSubscriptionCarne` numa
 * assinatura nova, `resetSubscriptionCarne` num link já enviado).
 */
export async function startSelfServiceCarne(input: {
  subscriptionId: string
  studentId: string
  /** Endereço digitado na tela (boleto do Mercado Pago). */
  address?: Parameters<typeof saveBoletoAddress>[1]
}): Promise<CreateCarneResult> {
  if (input.address) await saveBoletoAddress(input.studentId, input.address)
  return createSubscriptionCarne({
    subscriptionId: input.subscriptionId,
    count: 1,
    firstDueDate: carneDueInDays(SUBSCRIPTION_CARNE_SELF_SERVICE_DUE_DAYS),
  })
}

/** Grava o endereço que o boleto do Mercado Pago exige. */
export async function saveBoletoAddress(
  studentId: string,
  address: { cep: string; rua: string; numero: string; bairro: string; cidade: string; estado: string },
): Promise<void> {
  await prisma.student.update({
    where: { id: studentId },
    data: {
      cep: address.cep,
      rua: address.rua,
      numero: address.numero,
      bairro: address.bairro,
      cidade: address.cidade,
      estado: address.estado.toUpperCase(),
    },
  })
}
