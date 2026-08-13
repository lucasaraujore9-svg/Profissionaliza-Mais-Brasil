import { prisma } from "@/lib/prisma"
import {
  findOrCreateAsaasCustomer,
  createPayment as createAsaasPayment,
  createSubscription as createAsaasSubscription,
  createInstallmentWithCreditCard,
  getInstallmentPayments,
  deleteInstallment,
  listPayments as listAsaasPayments,
  getPixQrCode,
  getBillingInfo,
  payWithCreditCard,
  motherAsaasKey,
} from "@/lib/asaas/client"
import { dueDateInDays } from "@/lib/checkout/due-date"
import { asaasWebhookUrl } from "@/lib/tenant/urls"
import { assertPmbCharge, TenantGatewayIsolationError } from "@/lib/checkout/assert-tenant-gateway"
import { createBoletoInstallmentPlan } from "@/lib/installments/plan"
import {
  perInstallment,
  pmbMaxBoletoInstallments,
  pmbMaxCardInstallments,
} from "@/lib/installments/pmb-rules"
import { swallow } from "@/lib/errors"
import {
  isFreeAmount,
  pmbTenantContext,
  releaseFreeEnrollment,
} from "@/lib/checkout/free-enrollment"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { asaasCustomerUpdate, type PayerIdentity } from "@/lib/checkout/payer"

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
  /**
   * O ALUNO — usado so para `student.id` (a quem a cobranca pertence). Nome,
   * CPF e contato da COBRANCA vem de `payer`, que pode ser o responsavel
   * financeiro quando o aluno e menor.
   */
  student: { id: string }
  /** Quem PAGA. Monte com `resolvePayer` (src/lib/checkout/payer.ts). */
  payer: PayerIdentity
  courseNome: string
  /** Descrição da cobrança no Asaas. Default: `Curso: ${courseNome}`. */
  description?: string
  finalAmount: number
  isMonthly: boolean
  monthlyMonths: number | null
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED"
  /**
   * Nº de parcelas escolhido no checkout (cartão ou boleto). 1/undefined = à
   * vista (fluxo atual). Ignorado quando isMonthly. As regras (boleto: parcela
   * mínima R$50 e máx 6; cartão: teto do admin + mínimo R$5) são RE-validadas
   * aqui — nunca confiar só na rota.
   */
  installments?: number
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
      /** Presente quando a compra foi parcelada no boleto (carnê). */
      carne?: {
        count: number
        parcelas: Array<{
          number: number
          amount: number
          dueDate: string
          invoiceUrl: string | null
        }>
      }
    }
  | { mode: "redirect"; initPoint: string | null }
  /** Cupom/desconto zerou o valor: acesso liberado sem cobrança. */
  | { mode: "free" }

export async function issuePmbAsaasCharge(
  input: IssuePmbAsaasChargeInput,
): Promise<PmbAsaasChargeResult> {
  const {
    enrollmentId,
    externalReference,
    student,
    payer,
    courseNome,
    description,
    finalAmount,
    isMonthly,
    monthlyMonths,
    billingType,
    installments,
    creditCard,
    creditCardHolder,
    remoteIp,
  } = input

  const chargeDescription = description ?? `Curso: ${courseNome}`

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

  // ── Valor zerado (cupom de 100%) ──────────────────────────────────────────
  // O Asaas recusa cobrança de R$ 0. Libera a matrícula direto, sem gateway.
  // Fica aqui (e não só nas rotas) para cobrir todo consumidor desta função:
  // checkout de curso, de pacote e a retomada pela tela /pagar.
  if (isFreeAmount(finalAmount)) {
    const pmbTenant = await getOrCreatePmbTenant()
    await releaseFreeEnrollment(pmbTenantContext(pmbTenant), enrollmentId)
    return { mode: "free" }
  }

  const motherKey = motherAsaasKey()

  // ── Parcelamento (só compra one-time): normaliza e RE-valida as regras ──
  // Boleto: cada parcela >= R$50, máx 6 boletos. Cartão: até 12x, mínimo
  // R$5/parcela. A rota já devolve 400 amigável; aqui é defesa em profundidade
  // (lança).
  const n =
    !isMonthly && installments && installments > 1
      ? Math.floor(installments)
      : 1
  if (n > 1 && billingType === "BOLETO") {
    const cap = pmbMaxBoletoInstallments(finalAmount)
    if (n > cap) {
      throw new Error(
        `Parcelamento no boleto acima do permitido para este valor (máximo ${cap}x)`,
      )
    }
  }
  if (n > 1 && billingType === "CREDIT_CARD") {
    // Sem os dados do cartão o fluxo cairia na cobrança à vista com
    // installmentsTotal já gravado — estado inconsistente. As rotas já exigem
    // o cartão (400) antes de chegar aqui.
    if (!creditCard || !creditCardHolder) {
      throw new Error("Dados do cartão obrigatórios para parcelamento")
    }
    const cap = pmbMaxCardInstallments(finalAmount)
    if (n > cap) {
      throw new Error(
        `Parcelamento no cartão acima do permitido (máximo ${cap}x)`,
      )
    }
  }

  // Normaliza a intenção na matrícula ANTES de qualquer chamada Asaas: os
  // eventos das N cobranças chegam pelo webhook e o fulfillEnrollment decide
  // "1ª parcela provisiona / demais incrementam" por installmentsTotal — sem
  // isso, cada parcela confirmada re-provisionaria acesso e re-enviaria emails.
  // N=1 RESETA uma tentativa parcelada anterior (retry na tela /pagar).
  if (!isMonthly) {
    if (billingType === "CREDIT_CARD" && n > 1) {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          paymentType: "CARD_INSTALLMENT",
          installmentsTotal: n,
          externalReference,
        },
      })
    } else if (billingType === "BOLETO" && n > 1) {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          paymentType: "BOLETO_INSTALLMENT",
          installmentsTotal: n,
          // Carnê NÃO usa pmb_enr_: o webhook roteia cada parcela pela linha
          // BoletoInstallment (asaasPaymentId), como na venda direta da revenda.
          externalReference: `carne_${enrollmentId}`,
        },
      })
    } else {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          paymentType: "ONE_TIME",
          installmentsTotal: null,
          externalReference,
        },
      })
    }
  }

  const phoneDigits = (payer.fone ?? "").replace(/\D/g, "")

  const { customer } = await findOrCreateAsaasCustomer({
    name: payer.nome,
    email: payer.email ?? undefined,
    cpfCnpj: payer.cpf ?? "",
    mobilePhone: payer.fone ?? undefined,
    externalReference: `pmb_${payer.asaasExternalReference}`,
  })

  // Grava na COLUNA DO PAGADOR. Escrever o customer do responsavel em
  // `asaasCustomerId` faria o aluno cobrar nele para sempre — inclusive depois
  // dos 18 — e o reuso do customer em cache esconderia o erro.
  if (!payer.asaasCustomerId) {
    await prisma.student.update({
      where: { id: student.id },
      data: asaasCustomerUpdate(payer, customer.id),
    })
  }

  const holderInfo =
    creditCard && creditCardHolder
      ? {
          name: payer.nome,
          email: payer.email ?? "",
          cpfCnpj: payer.cpf ?? "",
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

  // ──── ONE_TIME parcelado no CARTÃO (POST /installments/) ────
  // Captura o valor cheio em N parcelas no cartão numa única chamada. Cada
  // cobrança gerada carrega externalReference pmb_enr_<id>: a 1ª CONFIRMED
  // ativa a matrícula via processPmbDirectSale; as demais (confirmadas mês a
  // mês pelo Asaas) caem no branch de incremento do fulfillEnrollment porque
  // installmentsTotal=n foi persistido acima.
  if (billingType === "CREDIT_CARD" && creditCard && holderInfo && n > 1) {
    const installment = await createInstallmentWithCreditCard(
      {
        installmentCount: n,
        customer: customer.id,
        value: perInstallment(finalAmount, n),
        totalValue: finalAmount,
        billingType: "CREDIT_CARD",
        dueDate: dueDateInDays(0),
        description: chargeDescription,
        paymentExternalReference: externalReference,
        creditCard,
        creditCardHolderInfo: holderInfo,
        remoteIp,
      },
      motherKey,
    )

    // 200 = parcelamento CRIADO, não capturado: a 1ª parcela pode estar em
    // AWAITING_RISK_ANALYSIS. Consulta o status real (padrão de
    // /api/cobranca/[paymentId]/pay-card). Falha na consulta → PENDING; o
    // webhook (pmb_enr_) é a rede de segurança quando a análise aprovar.
    const firstCharge = await getInstallmentPayments(installment.id, motherKey)
      .then(
        (list) =>
          [...list.data].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ??
          null,
      )
      .catch(() => null)

    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        externalReference,
        asaasCustomerId: customer.id,
        asaasInstallmentId: installment.id,
        asaasPaymentId: firstCharge?.id ?? null,
        asaasInvoiceUrl: firstCharge?.invoiceUrl ?? null,
      },
    })

    return {
      mode: "credit_card_result",
      status: firstCharge?.status ?? "PENDING",
      paymentId: firstCharge?.id ?? null,
    }
  }

  // ──── ONE_TIME parcelado no BOLETO (carnê, POST /installments) ────
  // Reusa o maquinário da venda direta da revenda (plan.ts), que no contexto
  // PMB (tenantId=null) emite na conta-mãe e cria uma BoletoInstallment por
  // parcela — o webhook liquida cada uma por asaasPaymentId e o sweep diário
  // cuida de atraso/bloqueio.
  if (billingType === "BOLETO" && n > 1) {
    try {
      const plan = await createBoletoInstallmentPlan({
        enrollmentId,
        count: n,
        installmentValue: perInstallment(finalAmount, n),
        // 1º boleto vence em 3 dias (mesma janela do boleto à vista); os demais
        // mensais. Meio-dia UTC = convenção das linhas BoletoInstallment.
        firstDueDate: new Date(`${dueDateInDays(3)}T12:00:00Z`),
        exactTotalValue: finalAmount,
        description: chargeDescription,
      })

      const first = plan.installments[0] ?? null
      const billing = first?.asaasPaymentId
        ? await getBillingInfo(first.asaasPaymentId, motherKey).catch(() => null)
        : null

      return {
        mode: "boleto",
        paymentId: first?.asaasPaymentId ?? "",
        bankSlipUrl: plan.firstBoletoUrl,
        identificationField: billing?.bankSlip?.identificationField ?? null,
        barCode: billing?.bankSlip?.barCode ?? null,
        carne: {
          count: n,
          parcelas: plan.installments.map((r) => ({
            number: r.number,
            amount: Number(r.amount),
            dueDate: r.dueDate.toISOString(),
            invoiceUrl: r.invoiceUrl,
          })),
        },
      }
    } catch (error) {
      // Carnê órfão: se o parcelamento chegou a ser criado no Asaas
      // (asaasInstallmentId persistido cedo pelo plan.ts), apaga lá — senão o
      // Asaas seguiria emitindo boletos de uma compra que falhou.
      const enr = await prisma.enrollment
        .findUnique({
          where: { id: enrollmentId },
          select: { asaasInstallmentId: true },
        })
        .catch(() => null)
      if (enr?.asaasInstallmentId) {
        await deleteInstallment(enr.asaasInstallmentId, motherKey).catch(
          swallow("pmb-carne.cleanup_asaas"),
        )
        await prisma.enrollment
          .update({
            where: { id: enrollmentId },
            data: { asaasInstallmentId: null },
          })
          .catch(swallow("pmb-carne.cleanup_row"))
      }
      throw error
    }
  }

  // ──── ONE_TIME ────
  const payment = await createAsaasPayment({
    customer: customer.id,
    billingType,
    value: finalAmount,
    dueDate: dueDateInDays(3),
    description: chargeDescription,
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
