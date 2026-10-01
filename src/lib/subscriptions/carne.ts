import type { SubscriptionInterval } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { PAYER_SELECT, resolvePayer, type PayerSource } from "@/lib/checkout/payer"
import { assertPmbCharge } from "@/lib/checkout/assert-tenant-gateway"
import {
  AsaasApiError,
  cancelPixAutomaticAuthorization,
  createPayment as createAsaasPayment,
  createPixAutomaticAuthorization,
  decryptTenantAsaasKey,
  deletePayment as deleteAsaasPayment,
  findOrCreateAsaasCustomer,
  getPixAutomaticAuthorization,
  listPayments as listAsaasPayments,
  motherAsaasKey,
} from "@/lib/asaas/client"
import type { AsaasPayment } from "@/lib/asaas/types"
import {
  asaasBoletoInstrument,
  asaasPixInstrument,
  type BoletoInstrument,
  type PixInstrument,
} from "@/lib/asaas/payment-instrument"
import {
  cancelPayment as cancelMpPayment,
  createPayment as createMpPayment,
  decryptTenantMpToken,
  getPayment as getMpPayment,
  MPApiError,
} from "@/lib/mercadopago/client"
import type { MPPayment } from "@/lib/mercadopago/types"
import { resolveEnrollmentGatewayKeys } from "@/lib/enrollment/gateway-credentials"
import { advisoryLockKeyFrom, withAdvisoryLock } from "@/lib/enrollment/fulfill"
import { isWithinRevealWindow } from "@/lib/installments/schedule"
import { runInChunks } from "@/lib/concurrency"
import {
  boletoExpirationIso,
  hasCompleteBoletoAddress,
  mpBoletoPaymentParams,
  type BoletoAddress,
} from "@/lib/installments/mp-boleto"
import { asaasWebhookUrl, mpWebhookUrl } from "@/lib/tenant/urls"
import { asaasPixAutomaticFrequencyFor, isRecurringInterval } from "./interval"
import {
  CARNE_OPEN_STATUSES,
  CARNE_STATUS,
  MP_CARNE_REF_PREFIX,
  SUBSCRIPTION_CARNE_MIN_AMOUNT,
  SUBSCRIPTION_CARNE_SELF_SERVICE_DUE_DAYS,
  carneDueDate,
  carneDueInDays,
  type CarneMethod,
} from "./carne-schedule"

/**
 * Assinatura NO BOLETO ou NO PIX (carne): criar, emitir e cancelar as
 * cobrancas de cada ciclo.
 *
 * PIX (2026-09-29): mesmo desenho, com duas diferencas — nenhum gateway emite o
 * carne de PIX inteiro de uma vez (o QR expira), e no Asaas a 1a cobranca e o
 * QR de uma autorizacao de PIX AUTOMATICO. Ativa a autorizacao, as cobrancas
 * seguintes saem vinculadas a ela e o banco debita sozinho; sem ela, saem como
 * PIX comum, que o aluno paga na nossa pagina. O Mercado Pago nao expoe Pix
 * Automatico pela API (so pela pagina dele, que a loja nao usa): la e sempre o
 * PIX comum.
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
    method: CarneMethod
    asaasCustomerId: string | null
    pixAutomaticAuthorizationId: string | null
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
      billingType: true,
      asaasCustomerId: true,
      pixAutomaticAuthorizationId: true,
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
      method: sub.billingType === "PIX" ? "PIX" : "BOLETO",
      asaasCustomerId: sub.asaasCustomerId,
      pixAutomaticAuthorizationId: sub.pixAutomaticAuthorizationId,
      planName: sub.plan.name,
      student: sub.student,
    },
    tenant: sub.tenant,
  }
}

/**
 * O pagador consegue receber a cobranca neste gateway? Conferido ANTES de criar
 * qualquer linha, para a venda recusar com uma mensagem que o vendedor
 * consegue resolver — e nao com um 502 depois de metade do carne emitido.
 */
function assertPayerReady(ctx: CarneContext): { nome: string; email: string; cpf: string } {
  const payer = resolvePayer(ctx.sub.student)
  const quem = payer.kind === "GUARDIAN" ? "Responsável financeiro" : "Aluno"
  const meio = ctx.sub.method === "PIX" ? "o PIX" : "o boleto"
  if (!payer.cpf) {
    throw new CarneInputError(`${quem} sem CPF cadastrado — ${meio} exige o CPF de quem paga.`)
  }
  if (!payer.email) {
    throw new CarneInputError(`${quem} sem e-mail cadastrado — ${meio} exige o e-mail de quem paga.`)
  }
  // Endereço só no BOLETO do MP; o PIX dele não pede.
  if (
    ctx.sub.gateway === "MP" &&
    ctx.sub.method === "BOLETO" &&
    !hasCompleteBoletoAddress(ctx.sub.student)
  ) {
    throw new CarneInputError(
      "Informe o endereço completo do aluno (CEP, rua, número, bairro, cidade e UF) — o Mercado Pago exige no boleto.",
    )
  }
  return { nome: payer.nome, email: payer.email, cpf: payer.cpf }
}

// ── Criação ─────────────────────────────────────────────────────────────────

export interface CreateCarneInput {
  subscriptionId: string
  /** Cobranças geradas agora (as seguintes saem sozinhas, na renovação). */
  count: number
  /** Vencimento da 1ª cobrança, ao meio-dia UTC. */
  firstDueDate: Date
  /** Default BOLETO — o carnê de antes do PIX. */
  method?: CarneMethod
}

export interface CreateCarneResult {
  /** PDF + linha digitável do 1º boleto, para mostrar/enviar na hora. */
  firstBoleto: BoletoInstrument | null
  /** QR do 1º PIX (no Asaas, o da autorização de Pix Automático). */
  firstPix: PixInstrument | null
  /** O 1º PIX também pede a autorização do Pix Automático. */
  pixAutomatic: boolean
  count: number
  amount: number
}

/**
 * Transforma a assinatura (PENDING, sem nada no gateway) numa assinatura no
 * boleto ou no PIX: grava a marca, cria as linhas do carne e emite.
 *
 * Lança se a 1ª cobrança não sair — o chamador desfaz com
 * `discardSubscriptionCarne` (venda nova) ou `resetSubscriptionCarne` (link
 * já enviado). Falha numa cobrança seguinte NÃO derruba a venda: a linha fica
 * agendada e o cron tenta de novo.
 */
export async function createSubscriptionCarne(
  input: CreateCarneInput,
): Promise<CreateCarneResult> {
  const method: CarneMethod = input.method ?? "BOLETO"
  const ctx = await loadContext(input.subscriptionId)
  if (!ctx) throw new Error(`assinatura ${input.subscriptionId} não encontrada`)
  const { sub } = ctx
  sub.method = method

  if (!isRecurringInterval(sub.interval) && input.count !== 1) {
    throw new CarneInputError("Acesso vitalício é pago num boleto só.")
  }
  if (method === "PIX" && !isRecurringInterval(sub.interval)) {
    // Vitalício no PIX é a cobrança única de `checkout.ts`, não um carnê.
    throw new Error(`assinatura ${sub.id} vitalícia não vira carnê de PIX`)
  }
  const amount = Number(sub.priceAtPurchase)
  if (!(amount >= SUBSCRIPTION_CARNE_MIN_AMOUNT)) {
    throw new CarneInputError(
      `Cada cobrança precisa ser de pelo menos R$ ${SUBSCRIPTION_CARNE_MIN_AMOUNT},00.`,
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
      billingType: method,
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
        billingType: method,
        dueDate: carneDueDate(input.firstDueDate, sub.interval, n),
      },
      select: { id: true, dueDate: true },
    })
    rows.push({ id: created.id, number: n, dueDate: created.dueDate })
  }

  // PIX no Asaas: a 1ª cobrança é o QR da autorização de Pix Automático. Conta
  // inelegível (ou qualquer recusa) cai no PIX comum logo abaixo.
  let first: EmitCarneResult | null = null
  let pixAutomatic = false
  if (method === "PIX" && sub.gateway === "ASAAS") {
    const qr = await startPixAutomatic(ctx, rows[0], input.firstDueDate)
    if (qr) {
      first = { status: "emitted", boleto: null, pix: qr }
      pixAutomatic = true
    }
  }
  first ??= await emitCarneRow(rows[0].id)
  if (first.status !== "emitted" && first.status !== "already") {
    throw new Error(`1ª cobrança da assinatura ${sub.id} não foi emitida (${first.status})`)
  }

  // Boleto no Asaas: o carnê inteiro sai agora. Nos outros casos só o que já
  // está na janela — um boleto do MP emitido meses antes expiraria no
  // vencimento, e o QR do PIX também expira; o cron emite na hora certa. Em
  // lotes pequenos: 24 boletos em fila deixariam a venda esperando dezenas de
  // segundos (o lock é por linha, então o paralelo não duplica nada).
  const now = new Date()
  const emitsAllNow = sub.gateway === "ASAAS" && method === "BOLETO"
  const rest = rows
    .slice(1)
    .filter((row) => emitsAllNow || isWithinRevealWindow(row, now))
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
        "cobrança do carnê não saiu na venda — o cron tenta de novo",
      )
    }
  })

  contextLogger().info(
    {
      event: "subscription.carne.created",
      subscriptionId: sub.id,
      tenantId: sub.tenantId,
      gateway: sub.gateway,
      method,
      pixAutomatic,
      count: input.count,
    },
    "assinatura no carnê criada",
  )

  const firstDone = first as Extract<EmitCarneResult, { status: "emitted" | "already" }>
  return {
    firstBoleto: firstDone.boleto ?? null,
    firstPix: firstDone.pix ?? null,
    pixAutomatic,
    count: input.count,
    amount,
  }
}

/**
 * Cria a autorização de Pix Automático cujo QR cobra a 1ª linha do carnê. A
 * linha fica PENDING sem id de cobrança: o pagamento do QR só existe depois de
 * pago, e é o webhook (`linkPixAutomaticFirstPayment`) que o liga a ela.
 *
 * `null` quando o Asaas recusa (conta sem Pix Automático, PF, CNPJ com menos de
 * 6 meses): quem chama segue com o PIX comum. Erro de rede/5xx sobe.
 */
async function startPixAutomatic(
  ctx: CarneContext,
  row: { id: string; dueDate: Date },
  firstDueDate: Date,
): Promise<PixInstrument | null> {
  const frequency = asaasPixAutomaticFrequencyFor(ctx.sub.interval)
  if (!frequency) return null
  const apiKey = asaasKeyFor(ctx)
  const customer = await asaasCustomerFor(ctx, apiKey)
  const amount = Number(ctx.sub.priceAtPurchase)
  // O QR vale até o fim do dia do 1º vencimento, como o PIX comum da mesma
  // linha — passado isso a varredura a reemite como PIX comum.
  const expiresAt = new Date(boletoExpirationIso(row.dueDate)).getTime()
  const expirationSeconds = Math.max(3600, Math.floor((expiresAt - Date.now()) / 1000))
  const description = `Assinatura ${ctx.sub.planName}`.slice(0, 35)

  let auth
  try {
    auth = await createPixAutomaticAuthorization(
      {
        customerId: customer,
        frequency,
        // 33 caracteres (limite 35): é por ele que se acha a assinatura no
        // painel do Asaas.
        contractId: `pmb_sub_${ctx.sub.id}`,
        // Os débitos começam no 2º ciclo — o 1º é o próprio QR.
        startDate: ymd(carneDueDate(firstDueDate, ctx.sub.interval, 2)),
        value: amount,
        description,
        paymentCreationMode: "MANUAL",
        immediateQrCode: { expirationSeconds, originalValue: amount, description },
      },
      apiKey,
    )
  } catch (err) {
    if (err instanceof AsaasApiError && err.statusCode >= 400 && err.statusCode < 500) {
      contextLogger().info(
        {
          event: "subscription.carne.pix_automatic_unavailable",
          subscriptionId: ctx.sub.id,
          tenantId: ctx.sub.tenantId,
          error: err.message,
        },
        "Pix Automático recusado pela conta — segue no PIX comum",
      )
      return null
    }
    throw err
  }
  if (!auth.payload) {
    // Sem QR não há o que mostrar: desfaz e segue no PIX comum.
    await cancelPixAutomaticAuthorization(auth.id, apiKey).catch(
      swallow("subscription.carne.pix_automatic_no_qr"),
    )
    return null
  }

  await prisma.studentSubscription.update({
    where: { id: ctx.sub.id },
    data: {
      pixAutomaticAuthorizationId: auth.id,
      // Única ligação com o pagamento do QR — ver linkPixAutomaticFirstPayment.
      pixAutomaticQrId: auth.immediateQrCode?.conciliationIdentifier ?? null,
    },
  })
  ctx.sub.pixAutomaticAuthorizationId = auth.id
  // PENDING (e não SCHEDULED): a varredura só emite SCHEDULED/OVERDUE, então a
  // linha não ganha um PIX comum por cima do QR enquanto ele vale.
  await prisma.subscriptionPayment.update({
    where: { id: row.id },
    data: { status: CARNE_STATUS.PENDING, generatedAt: new Date(), emitAttempts: 1 },
  })
  return { qrCode: auth.payload, qrCodeBase64: auth.encodedImage ?? "" }
}

// ── Emissão ─────────────────────────────────────────────────────────────────

export type EmitCarneResult =
  | {
      status: "emitted" | "already"
      boleto: BoletoInstrument | null
      /** Só nas linhas de PIX. */
      pix?: PixInstrument | null
    }
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
  billingType: true,
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
  billingType: string | null
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
    // O meio é o da LINHA (gravado na criação), não o de hoje da assinatura.
    ctx.sub.method = row.billingType === "PIX" ? "PIX" : "BOLETO"
    const emitted =
      row.gateway === "ASAAS" ? await emitAsaas(row, ctx) : await emitMp(row, ctx)
    result = { status: "emitted", ...emitted }
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
  const unidade = ctx.sub.method === "PIX" ? "cobrança" : "boleto"
  return isRecurringInterval(ctx.sub.interval)
    ? `Assinatura ${ctx.sub.planName} — ${unidade} ${row.number}`
    : `Acesso vitalício — ${ctx.sub.planName}`
}

type Emitted = { boleto: BoletoInstrument | null; pix?: PixInstrument | null }

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

/**
 * Autorização de Pix Automático ATIVA agora, perguntada AO VIVO: o aluno pode
 * cancelá-la pelo app do banco a qualquer momento, e cobrança vinculada a
 * autorização cancelada é recusada. Qualquer dúvida = sem autorização (PIX
 * comum, que o aluno paga na nossa página).
 */
async function activePixAutomaticAuthorization(
  ctx: CarneContext,
  apiKey: string,
): Promise<string | undefined> {
  const id = ctx.sub.pixAutomaticAuthorizationId
  if (!id) return undefined
  const auth = await getPixAutomaticAuthorization(id, apiKey).catch(() => null)
  return auth?.status === "ACTIVE" ? id : undefined
}

async function emitAsaas(row: CarneRow, ctx: CarneContext): Promise<Emitted> {
  const apiKey = asaasKeyFor(ctx)
  assertPayerReady(ctx)
  const customer = await asaasCustomerFor(ctx, apiKey)
  const externalReference = `pmb_sub_${ctx.sub.id}`
  const isPix = ctx.sub.method === "PIX"
  // O Asaas não aceita vencimento no passado: cobrança atrasada (reemissão ou
  // cron parado) vence hoje. A AGENDA da linha continua a mesma.
  const today = todayBr()
  const dueYmd = ymd(row.dueDate) < today ? today : ymd(row.dueDate)

  const create = (pixAutomaticAuthorizationId?: string) =>
    createAsaasPayment(
      {
        customer,
        billingType: isPix ? "PIX" : "BOLETO",
        value: Number(row.amount),
        dueDate: dueYmd,
        description: boletoDescription(ctx, row),
        externalReference,
        notificationUrl: asaasWebhookUrl(ctx.tenant?.slug ?? undefined),
        ...(pixAutomaticAuthorizationId ? { pixAutomaticAuthorizationId } : {}),
      },
      apiKey,
    )

  let payment = await findOrphanAsaasCharge(externalReference, dueYmd, apiKey)
  if (!payment) {
    const authId = isPix && (row.number ?? 0) > 1
      ? await activePixAutomaticAuthorization(ctx, apiKey)
      : undefined
    try {
      payment = await create(authId)
    } catch (err) {
      // Instrução de débito recusada (fora da janela de 2 a 10 dias úteis,
      // autorização que caiu entre a consulta e a criação): a cobrança sai
      // como PIX comum, que o aluno ainda pode pagar.
      if (!(authId && err instanceof AsaasApiError && err.statusCode < 500)) throw err
      contextLogger().warn(
        {
          event: "subscription.carne.pix_automatic_charge_refused",
          subscriptionId: ctx.sub.id,
          rowId: row.id,
          error: err.message,
        },
        "cobrança do Pix Automático recusada — emitida como PIX comum",
      )
      payment = await create()
    }
  }

  if (isPix) {
    const pix = await asaasPixInstrument(payment.id, apiKey)
    await prisma.subscriptionPayment.update({
      where: { id: row.id },
      data: {
        asaasPaymentId: payment.id,
        status: CARNE_STATUS.PENDING,
        generatedAt: new Date(),
        emitAttempts: { increment: 1 },
      },
    })
    return { boleto: null, pix }
  }

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
  return {
    boleto: boleto ?? (payment.bankSlipUrl ? { url: payment.bankSlipUrl } : null),
  }
}

function mpPixInstrument(payment: MPPayment): PixInstrument | null {
  const qr = payment.point_of_interaction?.transaction_data
  return qr?.qr_code ? { qrCode: qr.qr_code, qrCodeBase64: qr.qr_code_base64 ?? "" } : null
}

async function emitMp(row: CarneRow, ctx: CarneContext): Promise<Emitted> {
  if (!ctx.tenant) {
    // A vitrine PMB assina sempre pelo Asaas da conta-mãe.
    throw new Error("cobrança MP de assinatura exige unidade — assinatura é da vitrine PMB")
  }
  if (!ctx.tenant.mpAccessToken) {
    throw new Error("unidade sem Mercado Pago conectado — cobrança não emitida")
  }
  const payer = assertPayerReady(ctx)
  const attempt = row.emitAttempts + 1
  const externalReference = `${MP_CARNE_REF_PREFIX}${row.id}`
  const token = decryptTenantMpToken(ctx.tenant.mpAccessToken)

  if (ctx.sub.method === "PIX") {
    // PIX comum com expiração no fim do dia do vencimento (o MP aceita até 30
    // dias; a linha só é emitida dentro da janela de 7). Expirado, chega como
    // `cancelled` em `carne-webhook.ts`, que libera a linha para reemissão —
    // o mesmo ciclo de vida do boleto.
    const payment = await createMpPayment(
      token,
      {
        transaction_amount: Number(row.amount),
        description: boletoDescription(ctx, row),
        payment_method_id: "pix",
        external_reference: externalReference,
        notification_url: mpWebhookUrl(ctx.tenant.slug),
        date_of_expiration: boletoExpirationIso(row.dueDate),
        payer: {
          email: payer.email,
          first_name: payer.nome,
          identification: { type: "CPF", number: payer.cpf.replace(/\D/g, "") },
        },
      },
      `${externalReference}_${attempt}`,
    )
    await prisma.subscriptionPayment.update({
      where: { id: row.id },
      data: {
        mpPaymentId: String(payment.id),
        status: CARNE_STATUS.PENDING,
        generatedAt: new Date(),
        emitAttempts: attempt,
      },
    })
    return { boleto: null, pix: mpPixInstrument(payment) }
  }

  const student = ctx.sub.student
  if (!hasCompleteBoletoAddress(student)) {
    throw new CarneInputError("Endereço do aluno incompleto — o Mercado Pago exige no boleto.")
  }
  const payment = await createMpPayment(
    token,
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
  return { boleto: url ? { url, digitableLine: digitableLine ?? undefined } : null }
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
  // Autorização de Pix Automático primeiro: com ela viva, o QR do 1º ciclo
  // ainda poderia ser pago. As cobranças seguintes nós é que criamos (modo
  // MANUAL), então as linhas canceladas abaixo já param os débitos — isto é
  // arrumação, e falhar aqui não segura o resto.
  await cancelPixAutomaticFor(subscriptionId)

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

async function cancelPixAutomaticFor(subscriptionId: string): Promise<void> {
  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: { tenantId: true, pixAutomaticAuthorizationId: true },
  })
  const id = sub?.pixAutomaticAuthorizationId
  if (!id) return
  const keys = await resolveEnrollmentGatewayKeys({ tenantId: sub.tenantId })
  if (!keys.asaasApiKey) return
  try {
    await cancelPixAutomaticAuthorization(id, keys.asaasApiKey)
  } catch (err) {
    // 4xx: já cancelada/recusada/expirada — nada a parar.
    if (err instanceof AsaasApiError && err.statusCode < 500) return
    contextLogger().warn(
      { err, event: "subscription.carne.pix_automatic_cancel_failed", subscriptionId },
      "autorização de Pix Automático não cancelada no Asaas",
    )
  }
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
    data: {
      boletoCarne: false,
      externalReference: null,
      billingType: "UNDEFINED",
      pixAutomaticAuthorizationId: null,
    },
  })
}

/**
 * O ALUNO escolheu boleto (ou PIX, na assinatura recorrente) na loja —
 * checkout ou página de pagamento: a assinatura vira carnê, com a 1ª cobrança
 * vencendo em 3 dias — o mesmo prazo do boleto/PIX avulso do checkout. Uma
 * cobrança só: as seguintes saem na renovação, 7 dias antes de cada
 * vencimento.
 *
 * Quem chama desfaz em caso de erro (`discardSubscriptionCarne` numa
 * assinatura nova, `resetSubscriptionCarne` num link já enviado).
 */
export async function startSelfServiceCarne(input: {
  subscriptionId: string
  studentId: string
  method?: CarneMethod
  /** Endereço digitado na tela (boleto do Mercado Pago). */
  address?: Parameters<typeof saveBoletoAddress>[1]
}): Promise<CreateCarneResult> {
  const method = input.method ?? "BOLETO"
  if (input.address && method === "BOLETO") {
    await saveBoletoAddress(input.studentId, input.address)
  }
  return createSubscriptionCarne({
    subscriptionId: input.subscriptionId,
    count: 1,
    firstDueDate: carneDueInDays(SUBSCRIPTION_CARNE_SELF_SERVICE_DUE_DAYS),
    method,
  })
}

// ── PIX em aberto (página de pagamento) ─────────────────────────────────────

/**
 * O PIX que o aluno paga agora numa assinatura no PIX: o da linha mais antiga
 * em aberto que já está na janela, lido AO VIVO no gateway (o QR não é
 * guardado). Emite na hora a linha que ainda não tem cobrança — o PIX expira
 * no vencimento e, sem isto, o aluno que chegasse depois esperaria o cron.
 *
 * A 1ª linha de um Pix Automático ainda não paga devolve o QR da AUTORIZAÇÃO
 * enquanto ela vale; recusada ou expirada, a linha passa ao PIX comum.
 */
export async function openCarnePix(subscriptionId: string): Promise<PixInstrument | null> {
  const row = await prisma.subscriptionPayment.findFirst({
    where: {
      subscriptionId,
      number: { not: null },
      paidAt: null,
      status: { in: CARNE_OPEN_STATUSES },
    },
    orderBy: { number: "asc" },
    select: ROW_SELECT,
  }) as CarneRow | null
  if (!row || !isWithinRevealWindow({ number: row.number ?? 1, dueDate: row.dueDate }, new Date())) {
    return null
  }
  const ctx = await loadContext(subscriptionId)
  if (!ctx) return null

  if (!row.asaasPaymentId && !row.mpPaymentId) {
    if (
      row.number === 1 &&
      row.status === CARNE_STATUS.PENDING &&
      ctx.sub.pixAutomaticAuthorizationId &&
      row.gateway === "ASAAS"
    ) {
      const auth = await getPixAutomaticAuthorization(
        ctx.sub.pixAutomaticAuthorizationId,
        asaasKeyFor(ctx),
      ).catch(() => null)
      if (auth?.status === "CREATED" && auth.payload) {
        return { qrCode: auth.payload, qrCodeBase64: auth.encodedImage ?? "" }
      }
      // O QR não vale mais: a linha volta a ser emitível, como PIX comum.
      await prisma.subscriptionPayment.updateMany({
        where: { id: row.id, paidAt: null, asaasPaymentId: null },
        data: { status: CARNE_STATUS.SCHEDULED },
      })
    }
    const emitted = await emitCarneRow(row.id)
    return emitted.status === "emitted" || emitted.status === "already"
      ? (emitted.pix ?? null)
      : null
  }

  if (row.asaasPaymentId) {
    return asaasPixInstrument(row.asaasPaymentId, asaasKeyFor(ctx))
  }
  if (!ctx.tenant?.mpAccessToken) return null
  const live = await getMpPayment(
    decryptTenantMpToken(ctx.tenant.mpAccessToken),
    row.mpPaymentId!,
  ).catch(() => null)
  return live && live.status === "pending" ? mpPixInstrument(live) : null
}

// ── 1º pagamento do Pix Automático (webhook do Asaas) ───────────────────────

/**
 * O pagamento do QR da autorização chega SEM `externalReference` e SEM
 * `subscription` — o Asaas só o cria depois de pago, então não há id para
 * guardar antes. Ele é reconhecido pelo cliente: a assinatura desta loja com
 * autorização de Pix Automático, do mesmo cliente Asaas, cuja 1ª linha ainda
 * não foi paga e tem o mesmo valor.
 *
 * O cliente NÃO basta: o Asaas cria esse pagamento no cliente do PAGADOR (a
 * conta bancária de quem pagou), que só coincide com o da autorização quando o
 * aluno paga com o próprio CPF. Quem liga de fato é o id do QR
 * (`payment.pixQrCodeId` = `immediateQrCode.conciliationIdentifier`, gravado
 * na criação da autorização); o cliente fica como segunda tentativa.
 *
 * Liga a linha ao pagamento (o PIX comum que a varredura tenha emitido por
 * cima, depois de o QR expirar, é removido — senão o aluno pagaria o ciclo em
 * dobro) e devolve a assinatura para o tratamento normal do evento.
 */
export async function linkPixAutomaticFirstPayment(input: {
  tenantId: string | null
  payment: Pick<AsaasPayment, "id" | "customer" | "value" | "billingType" | "pixQrCodeId">
}): Promise<{ id: string; boletoCarne: boolean } | null> {
  if (input.payment.billingType !== "PIX") return null
  const { pixQrCodeId, customer } = input.payment
  const findBy = (by: { pixAutomaticQrId: string } | { asaasCustomerId: string }) =>
    prisma.studentSubscription.findFirst({
      where: {
        tenantId: input.tenantId,
        pixAutomaticAuthorizationId: { not: null },
        boletoCarne: true,
        payments: { some: { number: 1, paidAt: null } },
        ...by,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        boletoCarne: true,
        payments: {
          where: { number: 1 },
          select: { id: true, amount: true, asaasPaymentId: true },
        },
      },
    })
  const sub =
    (pixQrCodeId ? await findBy({ pixAutomaticQrId: pixQrCodeId }) : null) ??
    (customer ? await findBy({ asaasCustomerId: customer }) : null)
  const row = sub?.payments[0]
  if (!sub || !row) return null
  if (Math.abs(Number(row.amount) - input.payment.value) > 0.01) return null
  if (row.asaasPaymentId === input.payment.id) return sub

  const replaced = row.asaasPaymentId
  const { count } = await prisma.subscriptionPayment.updateMany({
    where: { id: row.id, paidAt: null },
    data: { asaasPaymentId: input.payment.id, status: CARNE_STATUS.PENDING },
  })
  if (count === 0) return sub
  if (replaced) {
    const { asaasApiKey } = await resolveEnrollmentGatewayKeys({ tenantId: input.tenantId })
    const removed = asaasApiKey
      ? deleteAsaasPayment(replaced, asaasApiKey)
      : Promise.reject(new Error("chave Asaas indisponível"))
    await removed.catch((err) => {
      contextLogger().warn(
        { err, event: "subscription.carne.pix_automatic_replaced_delete_failed", rowId: row.id, replaced },
        "PIX comum da 1ª cobrança não removido — o aluno pode pagar em dobro",
      )
    })
  }
  return sub
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
