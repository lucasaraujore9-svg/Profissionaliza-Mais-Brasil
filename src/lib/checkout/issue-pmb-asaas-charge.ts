import { prisma } from "@/lib/prisma"
import {
  findOrCreateAsaasCustomer,
  createPayment as createAsaasPayment,
  createSubscription as createAsaasSubscription,
  listPayments as listAsaasPayments,
  getPixQrCode,
  getBillingInfo,
  payWithCreditCard,
  motherAsaasKey,
} from "@/lib/asaas/client"
import { dueDateInDays } from "@/lib/checkout/due-date"
import { asaasWebhookUrl } from "@/lib/tenant/urls"
import { assertPmbCharge, TenantGatewayIsolationError } from "@/lib/checkout/assert-tenant-gateway"

/**
 * Cobrança Asaas do sistema-mãe (PMB) para UMA matrícula. Extraído de
 * /api/checkout para ser reusado por:
 *   - o checkout público (curso novo → matrícula recém-criada);
 *   - a tela /pagar/[id] (retomada de uma matrícula PENDENTE já existente).
 *
 * Responsabilidades (espelha o comportamento original):
 *   1. garante o cliente Asaas do aluno (persiste asaasCustomerId se faltava);
 *   2. cria a cobrança (one-time `createPayment` ou assinatura `createSubscription`);
 *   3. persiste os campos asaas na MESMA matrícula (`enrollmentId`) + a
 *      `externalReference = pmb_enr_<id>` (chave de match do webhook);
 *   4. devolve os dados específicos do método (PIX/boleto/cartão/redirect).
 *
 * NÃO captura erros do Asaas — relança para o chamador decidir a limpeza
 * (checkout público apaga a matrícula órfã; /pagar mantém a matrícula p/ retry).
 */
export interface IssuePmbAsaasChargeInput {
  /** Matrícula PMB (tenantId=null) a cobrar. */
  enrollmentId: string
  /** Deve ser `pmb_enr_<enrollmentId>` — o weblook casa por este prefixo. */
  externalReference: string
  student: {
    id: string
    nome: string
    email: string
    cpf: string
    fone: string
    asaasCustomerId: string | null
  }
  courseNome: string
  finalAmount: number
  isMonthly: boolean
  monthlyMonths: number | null
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED"
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
  /** IP do COMPRADOR — exigido pelo Asaas na análise de risco do cartão. */
  remoteIp: string
}

export type PmbAsaasChargeResult =
  | { mode: "credit_card_result"; status: string; paymentId: string | null }
  | {
      mode: "pix"
      paymentId: string
      pix: Awaited<ReturnType<typeof getPixQrCode>> | null
    }
  | {
      mode: "boleto"
      paymentId: string
      bankSlipUrl: string | null
      identificationField: string | null
      barCode: string | null
    }
  | { mode: "redirect"; initPoint: string | null }

export async function issuePmbAsaasCharge(
  input: IssuePmbAsaasChargeInput,
): Promise<PmbAsaasChargeResult> {
  const {
    enrollmentId,
    externalReference,
    student,
    courseNome,
    finalAmount,
    isMonthly,
    monthlyMonths,
    billingType,
    creditCard,
    creditCardHolder,
    remoteIp,
  } = input

  // Defesa em profundidade no hop do dinheiro: esta função SEMPRE cobra na
  // conta-mãe (PMB). Confirma, autoritativamente no banco, que a matrícula é PMB
  // (tenantId=null) e o aluno pertence ao placeholder __pmb__. Uma matrícula de
  // revenda que chegue aqui (ex.: regressão de roteamento) LANÇA em vez de cair
  // no caixa da PMB. `student.tenantId` é NOT NULL, então `student.tenant` existe.
  const guard = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { tenantId: true, student: { select: { tenant: { select: { slug: true } } } } },
  })
  if (!guard) {
    // Matrícula inexistente (id stale/errado, ou removida em corrida — ex.: pela
    // cron fix-gateway-collapse). NÃO cobrar: um lookup nulo colapsaria para
    // (null, null) e PASSARIA o assert como se fosse PMB, gerando uma cobrança
    // órfã e não rastreável na conta-mãe. Falha fechada é a postura correta no
    // hop do dinheiro.
    throw new TenantGatewayIsolationError(
      "Matrícula não encontrada para cobrança PMB",
    )
  }
  assertPmbCharge({
    enrollmentTenantId: guard.tenantId,
    studentTenantSlug: guard.student?.tenant?.slug ?? null,
    context: "issuePmbAsaasCharge",
  })

  const motherKey = motherAsaasKey()

  const phoneDigits = student.fone.replace(/\D/g, "")

  const { customer } = await findOrCreateAsaasCustomer({
    name: student.nome,
    email: student.email,
    cpfCnpj: student.cpf,
    mobilePhone: student.fone,
    externalReference: `pmb_student_${student.id}`,
  })

  if (!student.asaasCustomerId) {
    await prisma.student.update({
      where: { id: student.id },
      data: { asaasCustomerId: customer.id },
    })
  }

  const holderInfo =
    creditCard && creditCardHolder
      ? {
          name: student.nome,
          email: student.email,
          cpfCnpj: student.cpf,
          postalCode: creditCardHolder.postalCode,
          addressNumber: creditCardHolder.addressNumber,
          addressComplement: creditCardHolder.addressComplement,
          phone: phoneDigits,
          mobilePhone: phoneDigits,
        }
      : null

  // ──── MONTHLY (assinatura) ────
  if (isMonthly && monthlyMonths) {
    // Cartão: cria a assinatura JÁ COM o cartão inline (tokeniza + cobra a 1ª
    // parcela e vincula o cartão às mensalidades seguintes).
    const monthlyCardPair =
      billingType === "CREDIT_CARD" && creditCard && holderInfo
        ? { creditCard, creditCardHolderInfo: holderInfo, remoteIp }
        : null

    const subscription = await createAsaasSubscription({
      customer: customer.id,
      billingType,
      value: finalAmount,
      // Cartão captura na hora (vence hoje); PIX/boleto vencem em 3 dias.
      nextDueDate: dueDateInDays(billingType === "CREDIT_CARD" ? 0 : 3),
      cycle: "MONTHLY",
      description: `Mensalidade — ${courseNome}`,
      externalReference,
      maxPayments: monthlyMonths,
      notificationUrl: asaasWebhookUrl(),
      ...(monthlyCardPair ?? {}),
    }, motherKey)

    // Asaas gera as cobranças async; busca a 1ª invoice em até 3 tentativas.
    let firstPayment:
      | { id: string; invoiceUrl: string; bankSlipUrl: string | null; status: string }
      | null = null
    for (let i = 0; i < 3; i++) {
      const list = await listAsaasPayments({
        subscription: subscription.id,
        limit: 1,
        offset: 0,
      }).catch(() => null)
      const first = list?.data?.[0]
      if (first) {
        firstPayment = {
          id: first.id,
          invoiceUrl: first.invoiceUrl,
          bankSlipUrl: first.bankSlipUrl,
          status: first.status,
        }
        break
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        externalReference,
        asaasCustomerId: customer.id,
        asaasSubscriptionId: subscription.id,
        asaasPaymentId: firstPayment?.id ?? null,
        asaasInvoiceUrl: firstPayment?.invoiceUrl ?? null,
      },
    })

    if (billingType === "CREDIT_CARD") {
      return {
        mode: "credit_card_result",
        status: firstPayment?.status ?? "PENDING",
        paymentId: firstPayment?.id ?? null,
      }
    }

    if (billingType === "PIX" && firstPayment) {
      const qr = await getPixQrCode(firstPayment.id).catch(() => null)
      return { mode: "pix", paymentId: firstPayment.id, pix: qr }
    }

    if (billingType === "BOLETO" && firstPayment) {
      const billing = await getBillingInfo(firstPayment.id).catch(() => null)
      return {
        mode: "boleto",
        paymentId: firstPayment.id,
        bankSlipUrl: firstPayment.bankSlipUrl ?? billing?.bankSlip?.bankSlipUrl ?? null,
        identificationField: billing?.bankSlip?.identificationField ?? null,
        barCode: billing?.bankSlip?.barCode ?? null,
      }
    }

    // Fallback: link de checkout Asaas (UNDEFINED ou sem 1ª invoice).
    return { mode: "redirect", initPoint: firstPayment?.invoiceUrl ?? null }
  }

  // ──── ONE_TIME ────
  const payment = await createAsaasPayment({
    customer: customer.id,
    billingType,
    value: finalAmount,
    dueDate: dueDateInDays(3),
    description: `Curso: ${courseNome}`,
    externalReference,
    notificationUrl: asaasWebhookUrl(),
  }, motherKey)

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      externalReference,
      asaasCustomerId: customer.id,
      asaasPaymentId: payment.id,
      asaasInvoiceUrl: payment.invoiceUrl,
    },
  })

  if (billingType === "CREDIT_CARD" && creditCard && holderInfo) {
    const result = await payWithCreditCard(payment.id, {
      creditCard,
      creditCardHolderInfo: holderInfo,
      remoteIp,
    }, motherKey)
    return {
      mode: "credit_card_result",
      status: result.status,
      paymentId: result.id,
    }
  }

  if (billingType === "PIX") {
    const qr = await getPixQrCode(payment.id).catch(() => null)
    return { mode: "pix", paymentId: payment.id, pix: qr }
  }

  if (billingType === "BOLETO") {
    const billing = await getBillingInfo(payment.id).catch(() => null)
    return {
      mode: "boleto",
      paymentId: payment.id,
      bankSlipUrl: payment.bankSlipUrl ?? billing?.bankSlip?.bankSlipUrl ?? null,
      identificationField: billing?.bankSlip?.identificationField ?? null,
      barCode: billing?.bankSlip?.barCode ?? null,
    }
  }

  // billingType === "UNDEFINED" → link checkout Asaas.
  return { mode: "redirect", initPoint: payment.invoiceUrl }
}
