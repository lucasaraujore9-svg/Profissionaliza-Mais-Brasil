import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { resolvePayer, type PayerSource } from "@/lib/checkout/payer"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import {
  createSubscriptionAtGateway,
  type SubscriptionGatewayAccount,
} from "./checkout"
import { INTERVAL_CHARGE_LABEL, isRecurringInterval } from "./interval"
import type { PlanCheckoutData } from "./plans"

/**
 * VENDA DIRETA de assinatura — o vendedor contrata pelo aluno, no /admin ou no
 * /painel, e manda o link de pagamento.
 *
 * NUCLEO COMPARTILHADO pelas duas portas de proposito. A licao do repo
 * (`GUARDIAN_REQUIRED`, `authoredSaleGate`) e que uma regra que nasce numa rota
 * so nao alcanca a outra: aqui moram a trava de assinatura duplicada, a
 * checagem do pagador e o congelamento do preco/periodicidade, para as duas
 * telas nao divergirem em silencio.
 *
 * O QUE ESTE FLUXO NAO FAZ, E POR QUE:
 *
 *  - **Nao cobra na hora.** O vendedor nao tem o cartao do aluno em maos. A
 *    cobranca nasce EM ABERTO (`billingType: UNDEFINED` no Asaas,
 *    `status: "pending"` no preapproval do MP) e o aluno escolhe como pagar na
 *    fatura/autorizacao do gateway. E o mesmo desenho da venda direta de curso
 *    mensal que ja existia em /admin/vendas.
 *  - **Nao aceita cupom.** `StudentSubscription.couponId` existe no schema mas
 *    nunca foi escrito por nenhum checkout — nenhuma superficie de assinatura
 *    aplica cupom hoje. Acordar essa coluna so aqui criaria o unico lugar do
 *    sistema onde um cupom desconta uma recorrencia, com semantica propria
 *    ("vale para todos os ciclos?") que ninguem definiu. O desconto MANUAL do
 *    vendedor, esse sim, passa — e vale para SEMPRE, porque congela em
 *    `priceAtPurchase`.
 */

export interface DirectSubscriptionSaleInput {
  /** Plano com o preco EFETIVO daquela vitrine (resolvido pelo servidor). */
  plan: PlanCheckoutData
  /** Aluno, com os campos do pagador — o menor cobra no CPF do responsavel. */
  student: PayerSource
  /** Vitrine da assinatura: null = vitrine principal PMB. */
  tenantId: string | null
  /** Slug da unidade (roteia o webhook). null/`__pmb__` = conta-mae. */
  tenantSlug: string | null
  /** Quem vendeu — aparece no recorte de carteira da listagem de vendas. */
  soldByUserId: string
  gateway: "MP" | "ASAAS"
  account: SubscriptionGatewayAccount
  /** Desconto manual (%) JA validado contra o teto do vendedor. */
  discountPercent?: number
}

export type DirectSubscriptionSaleResult =
  | {
      ok: true
      subscriptionId: string
      /** Valor de cada ciclo (ou o valor unico, no vitalicio). */
      priceAtPurchase: number
      listPrice: number
      discountAmount: number
      /** Link que o vendedor manda ao aluno para pagar/autorizar. */
      paymentUrl: string | null
      /** Frase pronta para a tela ("Cobrado a cada 3 meses"). */
      chargeLabel: string
      recurring: boolean
    }
  | { ok: false; status: number; error: string; code?: string }

/**
 * Ja existe assinatura viva (ou cobranca em aberto) deste aluno nesta vitrine?
 *
 * Inclui `PENDING` sem janela de expiracao, ao contrario do checkout anonimo:
 * la o PENDING e um carrinho abandonado de 30 minutos; aqui e uma cobranca que
 * o vendedor ja emitiu e mandou. Vender de novo por cima geraria DUAS cobrancas
 * para a mesma pessoa e, se ela pagasse as duas, duas recorrencias no gateway.
 */
async function findLiveSubscription(
  studentId: string,
  tenantId: string | null,
): Promise<{ id: string; status: string } | null> {
  return prisma.studentSubscription.findFirst({
    where: {
      studentId,
      tenantId,
      status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] },
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function createDirectSubscriptionSale(
  input: DirectSubscriptionSaleInput,
): Promise<DirectSubscriptionSaleResult> {
  const { plan, student, tenantId } = input

  const existing = await findLiveSubscription(student.id, tenantId)
  if (existing) {
    return {
      ok: false,
      status: 409,
      code: "SUBSCRIPTION_EXISTS",
      error:
        existing.status === "PENDING"
          ? "Este aluno já tem uma cobrança de assinatura pendente. Aguarde o pagamento ou cancele a anterior."
          : "Este aluno já possui uma assinatura ativa.",
    }
  }

  // Quem PAGA — com aluno menor, o responsável financeiro. O CPF exigido pelo
  // gateway é o DELE.
  const payer = resolvePayer(student)
  if (!payer.email) {
    return {
      ok: false,
      status: 400,
      error: "Aluno sem e-mail cadastrado — o gateway exige e-mail do pagador.",
    }
  }
  if (!payer.cpf) {
    return {
      ok: false,
      status: 400,
      error:
        payer.kind === "GUARDIAN"
          ? "Responsável financeiro sem CPF cadastrado — o gateway exige o CPF para gerar a cobrança."
          : "Aluno sem CPF cadastrado — o gateway exige o CPF para gerar a cobrança.",
    }
  }

  // Desconto sobre o preço de tabela da vitrine. Vira `priceAtPurchase`, que é
  // CONGELADO: numa assinatura recorrente o desconto vale para todos os ciclos,
  // porque o gateway guarda UM valor por assinatura. As telas dizem isso antes
  // do vendedor confirmar.
  const listPrice = plan.price
  const { discountAmount, finalAmount } = input.discountPercent
    ? applyCouponDiscount({
        basePrice: listPrice,
        discountType: "PERCENTAGE",
        discountValue: input.discountPercent,
      })
    : { discountAmount: 0, finalAmount: listPrice }

  // Assinatura de graça não existe: sem cobrança não há gateway a acionar e a
  // recorrência nunca nasceria. Quem quer dar acesso sem cobrar usa a bolsa de
  // estudo (que matricula em cursos), não a assinatura.
  if (!(finalAmount > 0)) {
    return {
      ok: false,
      status: 400,
      code: "SUBSCRIPTION_FREE_NOT_SUPPORTED",
      error:
        "Assinatura não pode sair por R$ 0. Reduza o desconto ou use bolsa de estudo em uma venda de curso.",
    }
  }

  const subscription = await prisma.studentSubscription.create({
    data: {
      studentId: student.id,
      tenantId,
      planId: plan.id,
      status: "PENDING",
      priceAtPurchase: finalAmount,
      // Congelada: editar o plano depois não pode mudar o que este assinante
      // contratou nem o que a renovação vai empurrar.
      interval: plan.interval,
      gateway: input.gateway,
      // A cobrança nasce em aberto — o aluno escolhe o meio na fatura.
      billingType: "UNDEFINED",
      soldByUserId: input.soldByUserId,
    },
    select: { id: true },
  })

  try {
    const result = await createSubscriptionAtGateway(
      {
        subscriptionId: subscription.id,
        // Preço DESCONTADO: é ele que vai para o gateway, não o de tabela.
        plan: { ...plan, price: finalAmount },
        tenantId,
        billingType: "UNDEFINED",
        payer: {
          nome: payer.nome,
          cpf: payer.cpf,
          email: payer.email,
          phone: payer.fone,
        },
      },
      input.gateway,
      input.account,
    )

    const paymentUrl = result.initPoint ?? result.invoiceUrl

    // Persiste o link: ele só existe nesta resposta. Sem gravar, o vendedor que
    // fechasse a aba perderia a única cópia e não teria de onde reemitir.
    if (paymentUrl) {
      await prisma.studentSubscription
        .update({
          where: { id: subscription.id },
          data: { checkoutUrl: paymentUrl },
        })
        .catch(() => undefined)
    }

    return {
      ok: true,
      subscriptionId: subscription.id,
      priceAtPurchase: finalAmount,
      listPrice,
      discountAmount,
      paymentUrl,
      chargeLabel: INTERVAL_CHARGE_LABEL[plan.interval],
      recurring: isRecurringInterval(plan.interval),
    }
  } catch (err) {
    // Rollback: uma assinatura PENDING órfã bloquearia toda nova tentativa de
    // venda para este aluno com 409 — o mesmo raciocínio do
    // `rollbackSaleEnrollment` das vendas de curso.
    await prisma.studentSubscription
      .delete({ where: { id: subscription.id } })
      .catch(() => undefined)
    contextLogger().error(
      {
        err,
        event: "subscription.direct_sale.gateway_failed",
        tenantId,
        planId: plan.id,
        studentId: student.id,
      },
      "falha ao criar assinatura da venda direta no gateway",
    )
    return {
      ok: false,
      status: 502,
      error:
        "Não foi possível gerar a cobrança da assinatura no gateway. Tente novamente.",
    }
  }
}
