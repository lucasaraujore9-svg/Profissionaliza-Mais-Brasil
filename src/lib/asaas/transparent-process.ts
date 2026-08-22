import { z } from "zod"
import type { BoletoInstallment } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { dueDateInDays } from "@/lib/checkout/due-date"
import {
  findOrCreateAsaasCustomer,
  getCustomer as getAsaasCustomer,
  createPayment as createAsaasPayment,
  createSubscription as createAsaasSubscription,
  getPixQrCode,
  getBillingInfo,
  getPayment,
  payWithCreditCard,
  listPayments as listAsaasPayments,
  AsaasApiError,
} from "./client"
import { fulfillFromAsaasPayment, type AsaasFulfillTenant } from "./fulfillment"
import { isFreeAmount, releaseFreeEnrollment } from "@/lib/checkout/free-enrollment"
import { settleBoletoInstallment } from "@/lib/installments/settle"
import { asaasSplitsForEnrollment } from "@/lib/course-authoring/split-server"
import type {
  AsaasCreditCard,
  AsaasCreditCardHolderInfo,
  AsaasPayment,
} from "./types"

/**
 * Núcleo do Checkout Transparente do Asaas para a conta PRÓPRIA da unidade
 * (revendedor recebendo do aluno). Espelha `processTransparentMpPayment`: o
 * comprador escolhe PIX / Cartão / Boleto e paga sem sair do site; o cartão é
 * enviado ao nosso servidor (TLS) e repassado ao Asaas (Asaas não tem SDK de
 * tokenização no browser como o MP). Devolve o MESMO `TransparentResult` do MP
 * para reaproveitar o restante da rota e a UI de resultado. O webhook continua
 * como rede de segurança idempotente (asaasPaymentId).
 */

/** formData do form de checkout Asaas. Card só quando method=CREDIT_CARD. */
export const asaasFormDataSchema = z.object({
  method: z.enum(["PIX", "CREDIT_CARD", "BOLETO"]),
  card: z
    .object({
      holderName: z.string().min(2),
      number: z.string().min(12),
      expiryMonth: z.string().min(1),
      expiryYear: z.string().min(2),
      ccv: z.string().min(3),
    })
    .optional(),
  // Endereço do titular — exigido pelo Asaas no cartão (creditCardHolderInfo) e
  // recomendado no boleto. CEP + número são o mínimo.
  postalCode: z.string().optional(),
  addressNumber: z.string().optional(),
  phone: z.string().optional(),
})

export type AsaasTransparentFormData = z.infer<typeof asaasFormDataSchema>

export interface AsaasTransparentEnrollment {
  id: string
  finalAmount: number
  paymentType: string
  installmentsTotal: number | null
  externalReference: string
  courseNome: string
  /**
   * QUEM PAGA — nao necessariamente quem estuda. Monte com `resolvePayer`
   * (src/lib/checkout/payer.ts): com aluno menor, estes campos sao os do
   * RESPONSAVEL FINANCEIRO. O certificado continua saindo no nome do aluno.
   */
  payerNome: string | null
  payerEmail: string | null
  payerCpf: string | null
  payerFone: string | null
  /**
   * Customer Asaas do PAGADOR (coluna `asaasCustomerId` do aluno OU
   * `responsavelAsaasCustomerId`), ja resolvido por `resolvePayer`. Nunca
   * misturar as duas colunas: o `cus_` da mae no campo do aluno o faria cobrar
   * nela para sempre.
   */
  payerAsaasCustomerId: string | null
  /** `student_enr_<id>` ou `guardian_<studentId>`. Descritivo: o Asaas
   *  deduplica customer por cpfCnpj, nao por esta referencia. */
  payerExternalReference: string
  /**
   * `"GUARDIAN"` INVALIDA o `asaasCustomerId` carimbado na matricula: ele pode
   * ter sido gravado por uma tentativa anterior, quando o pagador ainda era o
   * proprio aluno menor.
   */
  payerKind: "STUDENT" | "GUARDIAN"
  /** Cobranca por matricula, gravada por uma compra anterior nesta mesma conta. */
  asaasCustomerId: string | null
}

export interface AsaasTransparentCtx {
  /** API key DESCRIPTOGRAFADA da conta Asaas da unidade. */
  apiKey: string
  fulfillTenant: AsaasFulfillTenant
  /** URL de notificação do webhook (com ?tenant=<slug>). */
  notificationUrl: string
  /** IP do COMPRADOR (x-forwarded-for) — exigido pelo Asaas no cartão. */
  remoteIp: string | null
}

// Reaproveita o mesmo contrato do MP para a rota/UI não precisarem ramificar.
export type TransparentResult =
  | { kind: "approved"; status: string }
  | {
      kind: "pending"
      pix?: { qrCode: string; qrCodeBase64: string; ticketUrl?: string }
      boleto?: { url: string; digitableLine?: string }
    }
  | { kind: "error"; httpStatus: number; error: string; code: string; statusDetail?: string }

const CONFIRMED_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])
const PENDING_STATUSES = new Set([
  "PENDING",
  "AWAITING_RISK_ANALYSIS",
  "AWAITING_CHARGEBACK_REVERSAL",
])

/**
 * Paga, dentro do checkout transparente, uma cobrança que JÁ pertence ao carnê.
 *
 * A venda direta cria as N cobranças no Asaas antecipadamente. Por isso este
 * fluxo nunca chama `createPayment`: PIX e boleto reutilizam a cobrança da
 * parcela, e cartão usa `/payments/{id}/payWithCreditCard`. Assim o valor
 * cobrado é o da parcela e o `asaasPaymentId` continua sendo o mesmo que o
 * webhook usa para liquidar `BoletoInstallment`.
 */
export async function processExistingAsaasInstallmentPayment(
  installment: BoletoInstallment,
  enrollment: AsaasTransparentEnrollment,
  formData: AsaasTransparentFormData,
  ctx: AsaasTransparentCtx,
): Promise<TransparentResult> {
  const paymentId = installment.asaasPaymentId
  if (!paymentId) {
    return {
      kind: "error",
      httpStatus: 409,
      error: "A parcela ainda não possui cobrança disponível",
      code: "INSTALLMENT_NOT_GENERATED",
    }
  }
  if (!enrollment.payerCpf) {
    return {
      kind: "error",
      httpStatus: 400,
      error: "CPF do pagador é obrigatório no Asaas",
      code: "PAYER_CPF_MISSING",
    }
  }
  if (formData.method === "CREDIT_CARD" && !formData.card) {
    return {
      kind: "error",
      httpStatus: 400,
      error: "Dados do cartão ausentes",
      code: "CARD_REQUIRED",
    }
  }

  let payment: AsaasPayment
  try {
    payment = await getPayment(paymentId, ctx.apiKey)
  } catch (err) {
    return asaasErrorToResult(err)
  }

  const settleConfirmed = async (confirmed: AsaasPayment) => {
    await settleBoletoInstallment({
      installment,
      tenant: {
        ...ctx.fulfillTenant,
        isPmbVitrine: false,
      },
      event: {
        gateway: "ASAAS",
        externalPaymentId: confirmed.id,
        amount: confirmed.value,
        paidAt: confirmed.paymentDate
          ? new Date(confirmed.paymentDate)
          : new Date(),
      },
    })
  }

  // Retomada idempotente: se o Asaas já confirma como paga e o webhook ainda
  // não atualizou o banco, a própria resposta do checkout conclui a parcela.
  if (CONFIRMED_STATUSES.has(payment.status)) {
    await settleConfirmed(payment)
    return { kind: "approved", status: payment.status }
  }
  // A captura no cartão não é idempotente. Se a cobrança está sob análise ou
  // reversão, só aguardamos o webhook/status — nunca reenviamos os dados.
  if (
    payment.status !== "PENDING" &&
    payment.status !== "OVERDUE" &&
    PENDING_STATUSES.has(payment.status)
  ) {
    return { kind: "pending" }
  }
  if (
    payment.status !== "PENDING" &&
    payment.status !== "OVERDUE" &&
    !PENDING_STATUSES.has(payment.status)
  ) {
    return {
      kind: "error",
      httpStatus: 409,
      error: "Esta parcela não está disponível para pagamento",
      code: "INSTALLMENT_NOT_PAYABLE",
      statusDetail: payment.status,
    }
  }

  if (formData.method === "PIX") {
    const qr = await getPixQrCode(paymentId, ctx.apiKey).catch(() => null)
    if (!qr?.payload) {
      return {
        kind: "error",
        httpStatus: 502,
        error: "Não foi possível gerar o PIX desta parcela",
        code: "PIX_UNAVAILABLE",
      }
    }
    return {
      kind: "pending",
      pix: {
        qrCode: qr.payload,
        qrCodeBase64: qr.encodedImage ?? "",
        ticketUrl: payment.invoiceUrl,
      },
    }
  }

  if (formData.method === "BOLETO") {
    const billing = await getBillingInfo(paymentId, ctx.apiKey).catch(() => null)
    const url =
      billing?.bankSlip?.bankSlipUrl ??
      payment.bankSlipUrl ??
      payment.invoiceUrl
    return {
      kind: "pending",
      boleto: {
        url,
        digitableLine: billing?.bankSlip?.identificationField,
      },
    }
  }

  const cardPair = buildCardPair(formData, enrollment)
  if (!cardPair) {
    return {
      kind: "error",
      httpStatus: 400,
      error: "Dados do cartão ausentes",
      code: "CARD_REQUIRED",
    }
  }
  try {
    const result = await payWithCreditCard(
      paymentId,
      {
        ...cardPair,
        remoteIp: ctx.remoteIp ?? "0.0.0.0",
      },
      ctx.apiKey,
    )
    if (CONFIRMED_STATUSES.has(result.status)) {
      await settleConfirmed(result)
      return { kind: "approved", status: result.status }
    }
    if (PENDING_STATUSES.has(result.status)) {
      return { kind: "pending" }
    }
    return {
      kind: "error",
      httpStatus: 400,
      error: "Pagamento recusado. Tente outro cartão ou método.",
      code: "PAYMENT_REJECTED",
      statusDetail: result.status,
    }
  } catch (err) {
    return asaasErrorToResult(err)
  }
}

/** Resolve/cria o customer na conta Asaas DA UNIDADE (não a global da PMB). */
async function resolveCustomerId(
  enrollment: AsaasTransparentEnrollment,
  apiKey: string,
): Promise<string> {
  // ORDEM IMPORTA: o customer do PAGADOR vem primeiro.
  //
  // `enrollment.asaasCustomerId` e carimbado por uma cobranca anterior DESTA
  // matricula. Se a 1a tentativa saiu antes de a ficha ganhar o responsavel, ele
  // aponta para o customer do MENOR — e consulta-lo primeiro faria a cobranca
  // ser lancada no aluno enquanto o `creditCardHolderInfo` ja leva o CPF da mae,
  // misturando exatamente as duas identidades que este recurso separa.
  if (enrollment.payerAsaasCustomerId) {
    try {
      const existing = await getAsaasCustomer(
        enrollment.payerAsaasCustomerId,
        apiKey,
      )
      if (existing && !existing.deleted) return existing.id
    } catch (err) {
      if (!(err instanceof AsaasApiError && err.statusCode === 404)) throw err
    }
  }
  // Customer carimbado nesta matricula por uma compra anterior na MESMA conta.
  // So e reutilizavel quando quem paga e o PROPRIO ALUNO: com responsavel, esse
  // id pode ser o do menor, gravado numa tentativa anterior a ficha ser
  // completada.
  if (enrollment.asaasCustomerId && enrollment.payerKind === "STUDENT") {
    try {
      const existing = await getAsaasCustomer(enrollment.asaasCustomerId, apiKey)
      if (existing && !existing.deleted) return existing.id
    } catch (err) {
      if (!(err instanceof AsaasApiError && err.statusCode === 404)) throw err
    }
  }
  // O lookup do Asaas e por cpfCnpj. Aluno e responsavel tem CPFs diferentes
  // por construcao (withGuardianRule recusa iguais), entao nao ha como se
  // misturarem aqui; e a MESMA mae pagando por dois filhos resolver para UM
  // customer e o comportamento correto — o Asaas rejeita dois com o mesmo CPF.
  const { customer } = await findOrCreateAsaasCustomer(
    {
      name: enrollment.payerNome ?? "Aluno",
      email: enrollment.payerEmail ?? undefined,
      cpfCnpj: enrollment.payerCpf ?? "",
      mobilePhone: enrollment.payerFone ?? undefined,
      externalReference: enrollment.payerExternalReference,
    },
    apiKey,
  )
  return customer.id
}

function buildCardPair(
  formData: AsaasTransparentFormData,
  enrollment: AsaasTransparentEnrollment,
): { creditCard: AsaasCreditCard; creditCardHolderInfo: AsaasCreditCardHolderInfo } | null {
  if (!formData.card) return null
  const card = formData.card
  // CPF e telefone do HOLDER sao os do pagador — com aluno menor, os do
  // responsavel. Telefone de menor nao serve para analise de risco de cartao.
  const cpf = (enrollment.payerCpf ?? "").replace(/\D/g, "")
  const postalCode = (formData.postalCode ?? "").replace(/\D/g, "")
  const phone = (formData.phone ?? enrollment.payerFone ?? "").replace(/\D/g, "")
  return {
    creditCard: {
      holderName: card.holderName,
      number: card.number.replace(/\s/g, ""),
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear.length === 2 ? `20${card.expiryYear}` : card.expiryYear,
      ccv: card.ccv,
    },
    creditCardHolderInfo: {
      // `card.holderName` e o nome em relevo no cartao (vem do form); o
      // fallback e o nome do PAGADOR, nunca o do aluno.
      name: card.holderName || (enrollment.payerNome ?? "Aluno"),
      email: enrollment.payerEmail ?? "",
      cpfCnpj: cpf,
      postalCode,
      addressNumber: formData.addressNumber ?? "0",
      phone,
    },
  }
}

export async function processTransparentAsaasPayment(
  enrollment: AsaasTransparentEnrollment,
  formData: AsaasTransparentFormData,
  ctx: AsaasTransparentCtx,
): Promise<TransparentResult> {
  // ── Valor zerado (cupom de 100%) ──────────────────────────────────────────
  // O Asaas recusa cobrança de R$ 0 (valor mínimo). Libera a matrícula direto,
  // sem gateway — e antes de exigir CPF/cartão, que não fazem sentido aqui.
  // `status: "approved"` (e não "free") porque é o contrato que as telas de
  // checkout e de /pagar já tratam como sucesso.
  if (isFreeAmount(enrollment.finalAmount)) {
    await releaseFreeEnrollment(ctx.fulfillTenant, enrollment.id)
    return { kind: "approved", status: "approved" }
  }

  if (!enrollment.payerCpf) {
    return {
      kind: "error",
      httpStatus: 400,
      error: "CPF do pagador é obrigatório no Asaas",
      code: "PAYER_CPF_MISSING",
    }
  }
  if (formData.method === "CREDIT_CARD" && !formData.card) {
    return {
      kind: "error",
      httpStatus: 400,
      error: "Dados do cartão ausentes",
      code: "CARD_REQUIRED",
    }
  }

  const apiKey = ctx.apiKey
  const customerId = await resolveCustomerId(enrollment, apiKey)
  const description = enrollment.courseNome
  const externalReference = enrollment.externalReference

  // ── Mensal: assinatura no cartão ────────────────────────────────────────────
  if (enrollment.paymentType === "MONTHLY") {
    if (!formData.card) {
      return {
        kind: "error",
        httpStatus: 400,
        error: "Assinatura mensal exige cartão de crédito",
        code: "CARD_REQUIRED",
      }
    }
    const cardPair = buildCardPair(formData, enrollment)
    const months = enrollment.installmentsTotal ?? 12
    try {
      const subscription = await createAsaasSubscription(
        {
          customer: customerId,
          billingType: "CREDIT_CARD",
          // Rateio lido da PROPRIA matricula: nenhum call-site precisa lembrar
          // de passar. Esquecer o split e o pior defeito desta feature — a
          // venda acontece, o aluno recebe o curso e o produtor nunca e pago.
          splits: await asaasSplitsForEnrollment(enrollment.id),
          value: enrollment.finalAmount,
          nextDueDate: dueDateInDays(0),
          cycle: "MONTHLY",
          description: `Mensalidade — ${description}`,
          externalReference,
          maxPayments: months,
          notificationUrl: ctx.notificationUrl,
          ...(cardPair ?? {}),
          // Cartão no Asaas EXIGE remoteIp (IP do comprador). x-forwarded-for
          // pode faltar fora da Vercel — cai no 0.0.0.0, igual ao clientIp() do
          // fluxo provado de installments, em vez de omitir e tomar 400.
          remoteIp: ctx.remoteIp ?? "0.0.0.0",
        },
        apiKey,
      )

      // Captura a 1ª cobrança gerada (id/URL/status) para reconciliação/retorno.
      let firstInvoiceUrl: string | null = null
      let firstPayment: AsaasPayment | null = null
      for (let i = 0; i < 3; i++) {
        const list = await listAsaasPayments(
          { subscription: subscription.id, limit: 1, offset: 0 },
          apiKey,
        ).catch(() => null)
        const first = list?.data?.[0]
        if (first) {
          firstInvoiceUrl = first.invoiceUrl
          firstPayment = first
          break
        }
        await new Promise((r) => setTimeout(r, 500))
      }

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          externalReference,
          asaasCustomerId: customerId,
          asaasSubscriptionId: subscription.id,
          asaasPaymentId: firstPayment?.id ?? null,
          asaasInvoiceUrl: firstInvoiceUrl,
        },
      })

      // SÓ declara aprovado quando a 1ª cobrança no cartão FOI capturada — senão
      // o aluno veria "aprovado" sem cobrança real (o endpoint sem barra podia
      // ignorar o cartão silenciosamente). Capturada → efetiva já (webhook é
      // rede idempotente). Em análise/pendente → aguarda o webhook confirmar.
      if (firstPayment && CONFIRMED_STATUSES.has(firstPayment.status)) {
        await fulfillFromAsaasPayment(ctx.fulfillTenant, enrollment.id, firstPayment)
        return { kind: "approved", status: firstPayment.status }
      }
      return { kind: "pending" }
    } catch (err) {
      return asaasErrorToResult(err)
    }
  }

  // ── À vista: PIX / cartão / boleto ──────────────────────────────────────────
  const billingType =
    formData.method === "PIX"
      ? "PIX"
      : formData.method === "BOLETO"
        ? "BOLETO"
        : "CREDIT_CARD"

  const cardPair =
    formData.method === "CREDIT_CARD" ? buildCardPair(formData, enrollment) : null

  let payment: AsaasPayment
  try {
    payment = await createAsaasPayment(
      {
        customer: customerId,
        billingType,
        splits: await asaasSplitsForEnrollment(enrollment.id),
        value: enrollment.finalAmount,
        // Cartão captura na hora; PIX/boleto vencem em 3 dias.
        dueDate: dueDateInDays(billingType === "CREDIT_CARD" ? 0 : 3),
        description: `Curso: ${description}`,
        externalReference,
        notificationUrl: ctx.notificationUrl,
        ...(cardPair ?? {}),
        // Cartão EXIGE remoteIp no Asaas; PIX/boleto não usam. Fallback 0.0.0.0
        // quando x-forwarded-for falta (mesmo critério do clientIp() provado).
        ...(billingType === "CREDIT_CARD" ? { remoteIp: ctx.remoteIp ?? "0.0.0.0" } : {}),
      },
      apiKey,
    )
  } catch (err) {
    return asaasErrorToResult(err)
  }

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      externalReference,
      asaasCustomerId: customerId,
      asaasPaymentId: payment.id,
      asaasInvoiceUrl: payment.invoiceUrl,
    },
  })

  // Cartão capturado na hora → efetiva já (webhook é só rede de segurança).
  if (CONFIRMED_STATUSES.has(payment.status)) {
    await fulfillFromAsaasPayment(ctx.fulfillTenant, enrollment.id, payment)
    return { kind: "approved", status: payment.status }
  }

  // PIX → QR Code inline.
  if (billingType === "PIX") {
    const qr = await getPixQrCode(payment.id, apiKey).catch(() => null)
    if (qr?.payload) {
      return {
        kind: "pending",
        pix: {
          qrCode: qr.payload,
          qrCodeBase64: qr.encodedImage ?? "",
          ticketUrl: payment.invoiceUrl,
        },
      }
    }
    // Sem QR (raro) — devolve a fatura hospedada como fallback.
    return {
      kind: "pending",
      boleto: { url: payment.invoiceUrl },
    }
  }

  // Boleto → linha digitável + URL do PDF.
  if (billingType === "BOLETO") {
    let digitableLine: string | undefined
    const billing = await getBillingInfo(payment.id, apiKey).catch(() => null)
    if (billing?.bankSlip?.identificationField) {
      digitableLine = billing.bankSlip.identificationField
    }
    return {
      kind: "pending",
      boleto: {
        url: payment.bankSlipUrl ?? payment.invoiceUrl,
        digitableLine,
      },
    }
  }

  // Cartão em análise de risco — sem dados inline; aguarda webhook.
  if (PENDING_STATUSES.has(payment.status)) {
    return { kind: "pending" }
  }

  // Qualquer outro status no cartão = recusado.
  return {
    kind: "error",
    httpStatus: 400,
    error: "Pagamento recusado. Tente outro cartão ou método.",
    code: "PAYMENT_REJECTED",
    statusDetail: payment.status,
  }
}

/** Converte AsaasApiError (ex.: cartão recusado) num TransparentResult de erro. */
function asaasErrorToResult(err: unknown): TransparentResult {
  if (err instanceof AsaasApiError) {
    const description = err.errors?.[0]?.description
    // 4xx → erro de negócio (cartão recusado, dado inválido) → 400 amigável.
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return {
        kind: "error",
        httpStatus: 400,
        error: description ?? "Pagamento recusado. Confira os dados e tente novamente.",
        code: "PAYMENT_REJECTED",
      }
    }
  }
  // 5xx/rede → deixa a rota responder 500 (Asaas/comprador pode re-tentar).
  throw err
}
