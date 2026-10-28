import type { SubscriptionInterval } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"
import {
  AsaasApiError,
  createInstallmentWithCreditCard,
  createPayment as createAsaasPayment,
  deletePayment as deleteAsaasPayment,
  deleteInstallment,
  findOrCreateAsaasCustomer,
  getInstallmentPayments,
} from "@/lib/asaas/client"
import type { AsaasPayment } from "@/lib/asaas/types"
import { createPayment as createMpPayment, MPApiError } from "@/lib/mercadopago/client"
import { perInstallment } from "@/lib/installments/pmb-rules"
import { mpWebhookUrl } from "@/lib/tenant/urls"
import { isRecurringInterval } from "./interval"
import { revokeSubscriptionForRefund, settleSubscriptionCycle } from "./renew"
import { CarneInputError, resetSubscriptionCarne } from "./carne"
import {
  CARD_INSTALLMENT_METHOD,
  CARNE_OPEN_STATUSES,
  CARNE_STATUS,
  MP_CARNE_REF_PREFIX,
  carneDueInDays,
  subscriptionCardInstallmentsCap,
} from "./carne-schedule"

/**
 * Assinatura PARCELADA NO CARTÃO: cada período é uma compra parcelada, paga
 * pelo aluno na página da loja (desenho em
 * docs/superpowers/specs/2026-10-28-assinatura-cartao-parcelado-design.md).
 *
 * Mora no carnê da plataforma (`boletoCarne` + linhas numeradas de
 * `SubscriptionPayment`, `billingType = CARD_INSTALLMENT`): agenda, renovação,
 * período pago, carência e cancelamento são os do carnê. O que muda é QUEM
 * cria a cobrança — o aluno, ao pagar — e por isso a linha nunca é emitida pelo
 * cron.
 *
 * Quem chama segura o lock da assinatura (`SUBSCRIPTION_STORE_PAY:<id>`) ou
 * acabou de criá-la: dois cliques não podem abrir duas compras do mesmo
 * período.
 */

export interface CardInstallmentChargeInput {
  subscriptionId: string
  installments: number
  gateway: "MP" | "ASAAS"
  /** Conta DA UNIDADE, com as credenciais já decifradas. */
  tenant: {
    slug: string
    interestFreeInstallments: number | null
    asaasApiKey?: string
    mpAccessToken?: string
  }
  payer: { nome: string; cpf: string; email: string; phone: string | null }
  card: {
    creditCard?: {
      holderName: string
      number: string
      expiryMonth: string
      expiryYear: string
      ccv: string
    }
    creditCardHolder?: {
      postalCode: string
      addressNumber: string
      addressComplement?: string
    }
    cardToken?: string
    mpPaymentMethodId?: string
    mpIssuerId?: string
  }
  remoteIp?: string
}

export type CardInstallmentChargeResult =
  | { authorized: boolean }
  | { rejectedMessage: string }

/** Compra parcelada em curso sem id gravado (resposta do gateway não voltou). */
const IN_FLIGHT_MS = 15 * 60 * 1000

const SUB_SELECT = {
  id: true,
  tenantId: true,
  status: true,
  interval: true,
  priceAtPurchase: true,
  boletoCarne: true,
  billingType: true,
  asaasCustomerId: true,
  mpPreapprovalId: true,
  asaasSubscriptionId: true,
  externalReference: true,
  plan: { select: { name: true } },
} as const

type Row = {
  id: string
  amount: unknown
  dueDate: Date
  status: string
  generatedAt: Date | null
  asaasPaymentId: string | null
  mpPaymentId: string | null
}

const ROW_SELECT = {
  id: true,
  amount: true,
  dueDate: true,
  status: true,
  generatedAt: true,
  asaasPaymentId: true,
  mpPaymentId: true,
} as const

function description(planName: string, interval: SubscriptionInterval): string {
  return isRecurringInterval(interval)
    ? `Assinatura ${planName}`
    : `Acesso vitalício — ${planName}`
}

/**
 * Cobra no cartão, em `installments` parcelas, o período em aberto da
 * assinatura — o 1º (assinatura nova, ainda sem nada no gateway) ou o de
 * renovação de uma assinatura que já é parcelada.
 *
 * Recusa do cartão devolve `rejectedMessage` e não deixa nada para trás: numa
 * assinatura nova ela volta a ser uma assinatura sem cobrança, para o aluno
 * tentar de novo (com outro meio, inclusive). Erro de rede/5xx SOBE e deixa a
 * linha marcada "em processamento": o parcelamento pode ter sido criado, e o
 * webhook o liga à linha (`applyAsaasSubscriptionEvent`).
 */
export async function chargeSubscriptionCardInstallments(
  input: CardInstallmentChargeInput,
): Promise<CardInstallmentChargeResult> {
  const sub = await prisma.studentSubscription.findUnique({
    where: { id: input.subscriptionId },
    select: SUB_SELECT,
  })
  if (!sub) throw new Error(`assinatura ${input.subscriptionId} não encontrada`)

  const amount = Number(sub.priceAtPurchase)
  const cap = subscriptionCardInstallmentsCap(input.gateway, amount, input.tenant.interestFreeInstallments)
  const n = Math.trunc(input.installments)
  const isNew = !sub.boletoCarne
  // Na 1ª compra, 1x é o cartão de hoje (recorrência do gateway) e nem chega
  // aqui. Na RENOVAÇÃO de uma assinatura parcelada, 1x é uma compra à vista do
  // período: a assinatura segue parcelada, sem débito automático.
  if (!(n >= (isNew ? 2 : 1) && n <= Math.max(cap, 1))) {
    throw new CarneInputError(
      cap > 1
        ? `Esta assinatura pode ser parcelada em até ${cap}x no cartão.`
        : "Esta assinatura não pode ser parcelada no cartão.",
    )
  }
  if (input.gateway === "ASAAS" ? !input.card.creditCard || !input.card.creditCardHolder : !input.card.cardToken || !input.card.mpPaymentMethodId) {
    throw new CarneInputError("Dados do cartão obrigatórios")
  }

  if (isNew) {
    if (sub.status !== "PENDING" || sub.mpPreapprovalId || sub.asaasSubscriptionId || sub.externalReference) {
      // Só assinatura nova e sem nada no gateway vira parcelada (decisão do
      // dono): converter uma viva exigiria desligar a cobrança existente antes,
      // e falhar no meio cobraria em dobro.
      throw new CarneInputError("Esta assinatura já tem uma forma de pagamento.")
    }
    await prisma.studentSubscription.update({
      where: { id: sub.id },
      data: {
        boletoCarne: true,
        billingType: CARD_INSTALLMENT_METHOD,
        gateway: input.gateway,
        // A referência que o webhook do Asaas usa para achar esta assinatura.
        externalReference: `pmb_sub_${sub.id}`,
      },
    })
    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: sub.id,
        tenantId: sub.tenantId,
        number: 1,
        amount,
        gateway: input.gateway,
        status: CARNE_STATUS.SCHEDULED,
        billingType: CARD_INSTALLMENT_METHOD,
        dueDate: carneDueInDays(0),
      },
    })
  } else if (sub.billingType !== CARD_INSTALLMENT_METHOD) {
    throw new CarneInputError("Esta assinatura não é paga no cartão parcelado.")
  }

  const row = (await prisma.subscriptionPayment.findFirst({
    where: {
      subscriptionId: sub.id,
      number: { not: null },
      paidAt: null,
      billingType: CARD_INSTALLMENT_METHOD,
      status: { in: CARNE_OPEN_STATUSES },
    },
    orderBy: { number: "asc" },
    select: ROW_SELECT,
  })) as Row | null
  if (!row) {
    throw new CarneInputError(
      "Não há período em aberto agora. A renovação fica disponível 7 dias antes do fim do período pago.",
    )
  }
  if (
    row.asaasPaymentId ||
    row.mpPaymentId ||
    (row.status === CARNE_STATUS.PENDING &&
      row.generatedAt &&
      Date.now() - row.generatedAt.getTime() < IN_FLIGHT_MS)
  ) {
    throw new CarneInputError(
      "O pagamento deste período já está sendo processado. Aguarde a confirmação.",
    )
  }

  // Marca "em processamento" ANTES de falar com o gateway: no Asaas as parcelas
  // podem chegar pelo webhook antes da resposta, e é por esta linha aberta que
  // elas a encontram.
  // ponytail: sem o id gravado, só o tempo (IN_FLIGHT_MS) segura um 2º clique
  // depois de um 5xx; listar no gateway pela referência se isso aparecer.
  await prisma.subscriptionPayment.update({
    where: { id: row.id },
    data: { status: CARNE_STATUS.PENDING, generatedAt: new Date(), emitAttempts: { increment: 1 } },
  })

  const reject = async (message: string): Promise<CardInstallmentChargeResult> => {
    await prisma.subscriptionPayment.updateMany({
      where: { id: row.id, paidAt: null },
      data: { status: CARNE_STATUS.SCHEDULED, generatedAt: null, asaasPaymentId: null, mpPaymentId: null },
    })
    if (isNew) await resetSubscriptionCarne(sub.id)
    return { rejectedMessage: message }
  }

  const ctx = { sub, row, amount, n, input, reject }
  return input.gateway === "ASAAS" ? chargeAsaas(ctx) : chargeMp(ctx)
}

interface ChargeCtx {
  sub: { id: string; interval: SubscriptionInterval; asaasCustomerId: string | null; plan: { name: string } }
  row: Row
  amount: number
  n: number
  input: CardInstallmentChargeInput
  reject: (message: string) => Promise<CardInstallmentChargeResult>
}

const ASAAS_PAID = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])

async function chargeAsaas(ctx: ChargeCtx): Promise<CardInstallmentChargeResult> {
  const { sub, amount, n, input } = ctx
  const apiKey = input.tenant.asaasApiKey
  if (!apiKey) throw new Error("unidade sem conta Asaas conectada")

  let customer = sub.asaasCustomerId
  if (!customer) {
    const found = await findOrCreateAsaasCustomer(
      {
        name: input.payer.nome,
        cpfCnpj: input.payer.cpf,
        email: input.payer.email,
        mobilePhone: input.payer.phone ?? undefined,
      },
      apiKey,
    )
    customer = found.customer.id
    await prisma.studentSubscription.update({
      where: { id: sub.id },
      data: { asaasCustomerId: customer },
    })
  }

  const holderInfo = {
    name: input.payer.nome,
    email: input.payer.email,
    cpfCnpj: input.payer.cpf,
    postalCode: input.card.creditCardHolder!.postalCode,
    addressNumber: input.card.creditCardHolder!.addressNumber,
    addressComplement: input.card.creditCardHolder!.addressComplement,
    phone: input.payer.phone ?? "",
  }
  const todayYmd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const asaasReject = (err: unknown) =>
    err instanceof AsaasApiError && err.statusCode >= 400 && err.statusCode < 500
      ? ctx.reject(err.errors?.[0]?.description ?? "Pagamento recusado. Confira os dados do cartão.")
      : Promise.reject(err)

  // Renovação à vista: uma cobrança só, sem parcelamento (o Asaas não cria
  // parcelamento de 1x).
  if (n === 1) {
    let payment
    try {
      payment = await createAsaasPayment(
        {
          customer,
          billingType: "CREDIT_CARD",
          value: amount,
          dueDate: todayYmd,
          description: description(sub.plan.name, sub.interval),
          externalReference: `pmb_sub_${sub.id}`,
          creditCard: input.card.creditCard!,
          creditCardHolderInfo: holderInfo,
          remoteIp: input.remoteIp ?? "0.0.0.0",
        },
        apiKey,
      )
    } catch (err) {
      return asaasReject(err)
    }
    return settleAsaasFirst(ctx, payment, apiKey, null)
  }

  let installmentId: string
  try {
    const created = await createInstallmentWithCreditCard(
      {
        installmentCount: n,
        customer,
        value: perInstallment(amount, n),
        // O Asaas ajusta a última parcela pelo total: sem drift de centavos.
        totalValue: amount,
        billingType: "CREDIT_CARD",
        dueDate: todayYmd,
        description: description(sub.plan.name, sub.interval),
        // TODAS as parcelas levam a referência: é por ela que o webhook acha a
        // assinatura, e só a 1ª vale como período.
        paymentExternalReference: `pmb_sub_${sub.id}`,
        creditCard: input.card.creditCard!,
        creditCardHolderInfo: holderInfo,
        remoteIp: input.remoteIp ?? "0.0.0.0",
      },
      apiKey,
    )
    installmentId = created.id
  } catch (err) {
    // 4xx: o Asaas NÃO criou o parcelamento. 5xx/timeout sobe sem desfazer.
    return asaasReject(err)
  }

  const first = await getInstallmentPayments(installmentId, apiKey)
    .then((list) => [...list.data].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null)
    .catch(() => null)
  if (!first) return { authorized: false }
  return settleAsaasFirst(ctx, first, apiKey, installmentId)
}

/**
 * Liga a (1ª) cobrança à linha do período e liquida se o cartão já foi
 * capturado. Recusada depois de criada: desfaz no Asaas e libera a linha.
 */
async function settleAsaasFirst(
  ctx: ChargeCtx,
  first: AsaasPayment,
  apiKey: string,
  installmentId: string | null,
): Promise<CardInstallmentChargeResult> {
  const { sub, row, amount } = ctx

  // CAS: o webhook da 1ª parcela pode ter ligado a linha antes.
  await prisma.subscriptionPayment.updateMany({
    where: { id: row.id, asaasPaymentId: null },
    data: { asaasPaymentId: first.id },
  })

  if (ASAAS_PAID.has(first.status)) {
    await settleSubscriptionCycle(sub.id, {
      gateway: "ASAAS",
      externalPaymentId: first.id,
      // O PERÍODO inteiro, não a parcela: é o que a receita soma.
      amount,
      paidAt: first.paymentDate ? new Date(first.paymentDate) : new Date(),
      dueDate: row.dueDate,
      billingType: CARD_INSTALLMENT_METHOD,
    })
    return { authorized: true }
  }
  if (first.status === "AWAITING_RISK_ANALYSIS") return { authorized: false }

  await (installmentId
    ? deleteInstallment(installmentId, apiKey)
    : deleteAsaasPayment(first.id, apiKey)
  ).catch(swallow("subscription.card_installments.delete"))
  return ctx.reject("Pagamento recusado. Tente outro cartão.")
}

async function chargeMp(ctx: ChargeCtx): Promise<CardInstallmentChargeResult> {
  const { sub, row, amount, n, input } = ctx
  const token = input.tenant.mpAccessToken
  if (!token) throw new Error("unidade sem Mercado Pago conectado")

  let payment
  try {
    payment = await createMpPayment(
      token,
      {
        transaction_amount: amount,
        description: description(sub.plan.name, sub.interval),
        payment_method_id: input.card.mpPaymentMethodId!,
        token: input.card.cardToken,
        installments: n,
        ...(input.card.mpIssuerId ? { issuer_id: input.card.mpIssuerId } : {}),
        // Referência POR LINHA (como o boleto do carnê): o `cancelled`/
        // `rejected` deste pagamento só libera a linha, nunca é lido como
        // estorno da assinatura (`carne-webhook.ts`).
        external_reference: `${MP_CARNE_REF_PREFIX}${row.id}`,
        notification_url: mpWebhookUrl(input.tenant.slug),
        payer: {
          email: input.payer.email,
          first_name: input.payer.nome,
          identification: { type: "CPF", number: input.payer.cpf.replace(/\D/g, "") },
        },
      },
      // O token é de uso único: cada envio é uma tentativa nova.
      input.card.cardToken!,
    )
  } catch (err) {
    if (err instanceof MPApiError && err.statusCode >= 400 && err.statusCode < 500) {
      return ctx.reject("Pagamento recusado. Confira os dados do cartão.")
    }
    throw err
  }

  if (payment.status === "rejected" || payment.status === "cancelled") {
    return ctx.reject("Pagamento recusado. Tente outro cartão.")
  }

  const mpPaymentId = String(payment.id)
  await prisma.subscriptionPayment.updateMany({
    where: { id: row.id, mpPaymentId: null },
    data: { mpPaymentId },
  })
  if (payment.status === "approved" || payment.status === "authorized") {
    await settleSubscriptionCycle(sub.id, {
      gateway: "MP",
      externalPaymentId: mpPaymentId,
      amount,
      paidAt: payment.date_approved ? new Date(payment.date_approved) : new Date(),
      dueDate: row.dueDate,
      billingType: CARD_INSTALLMENT_METHOD,
    })
    return { authorized: true }
  }
  // in_process / pending: análise de risco; o webhook conclui.
  contextLogger().info(
    { event: "subscription.card_installments.pending", subscriptionId: sub.id, status: payment.status },
    "compra parcelada da assinatura em análise",
  )
  return { authorized: false }
}

/**
 * Evento do Asaas de uma PARCELA de compra parcelada no cartão. O Asaas cria N
 * cobranças, todas confirmadas no mesmo minuto e entregues em paralelo, todas
 * com `pmb_sub_<id>`: sem isto cada parcela liquidaria um período, e 12x
 * dariam 12 períodos.
 *
 * Só a 1ª parcela vale como o período (mesmo critério do curso,
 * `isFirstCardInstallment`); as outras não mexem em nada.
 */
export async function applyAsaasCardInstallmentEvent(
  subscriptionId: string,
  event: string,
  payment: {
    id: string
    installmentNumber?: number | null
    paymentDate?: string | null
  },
): Promise<string> {
  const label = `assinatura ${subscriptionId}: parcela ${payment.installmentNumber ?? "?"} (${payment.id})`
  const linked = await prisma.subscriptionPayment.findFirst({
    where: { subscriptionId, asaasPaymentId: payment.id },
    select: { id: true, amount: true, dueDate: true },
  })
  const isFirst =
    payment.installmentNumber != null ? payment.installmentNumber === 1 : Boolean(linked)

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    if (!isFirst) return `${label} — so a 1a parcela vale como periodo`
    let row = linked
    if (!row) {
      // A 1ª parcela chegou antes de o checkout gravar o id: liga à linha
      // de cartão em aberto (só existe uma por vez).
      const open = await prisma.subscriptionPayment.findFirst({
        where: {
          subscriptionId,
          number: { not: null },
          paidAt: null,
          asaasPaymentId: null,
          billingType: CARD_INSTALLMENT_METHOD,
          status: { in: CARNE_OPEN_STATUSES },
        },
        orderBy: { number: "asc" },
        select: { id: true, amount: true, dueDate: true },
      })
      if (!open) return `${label} — nenhum periodo em aberto para ligar`
      const { count } = await prisma.subscriptionPayment.updateMany({
        where: { id: open.id, asaasPaymentId: null },
        data: { asaasPaymentId: payment.id },
      })
      if (count === 0) return `${label} — linha ja ligada por outro evento`
      row = open
    }
    const { settled } = await settleSubscriptionCycle(subscriptionId, {
      gateway: "ASAAS",
      externalPaymentId: payment.id,
      amount: Number(row.amount),
      paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
      dueDate: row.dueDate,
      billingType: CARD_INSTALLMENT_METHOD,
    })
    return settled ? `${label} — periodo liquidado` : `${label} — ja registrado`
  }

  if (event === "PAYMENT_REFUNDED" || event === "PAYMENT_CHARGEBACK_REQUESTED") {
    // Estornar o parcelamento estorna todas as parcelas; basta a 1ª para
    // revogar (e marcar o período como estornado na receita).
    if (!isFirst) return `${label} — estorno registrado pela 1a parcela`
    await revokeSubscriptionForRefund(subscriptionId, { gateway: "ASAAS", externalPaymentId: payment.id })
    return `${label} — estornada`
  }

  if (
    (event === "PAYMENT_DELETED" || event === "PAYMENT_REPROVED_BY_RISK_ANALYSIS") &&
    linked
  ) {
    // Compra que não vingou (reprovada na análise, ou removida no painel do
    // Asaas): o período volta a ficar em aberto para o aluno pagar de novo.
    await prisma.subscriptionPayment.updateMany({
      where: { id: linked.id, paidAt: null },
      data: { asaasPaymentId: null, status: CARNE_STATUS.SCHEDULED, generatedAt: null },
    })
    return `${label} — compra desfeita, periodo em aberto de novo`
  }

  // CREATED/UPDATED/OVERDUE: a linha do período é da plataforma.
  return `${label} — ${event} sem acao`
}
