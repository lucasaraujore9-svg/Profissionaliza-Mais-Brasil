import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { resolveOverdueRuler, overdueDays } from "@/lib/tenants/overdue-policy"
import { getPayment as getAsaasPayment, AsaasApiError } from "./client"
import { isTransientWebhookError } from "@/lib/webhooks/transient"
import { sendEmail } from "@/lib/email/resend"
import { afterResponse } from "@/lib/after-response"
import { blockTenantStudents, unblockTenantStudents } from "@/lib/auto-block"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { settleBoletoInstallment } from "@/lib/installments/settle"
import { pmbPlataformaPolo, pmbPlataformaVendedorId } from "@/lib/pmb-config"
import { createNotification } from "@/lib/notifications"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import {
  createCommissionForTenantPayment,
  cancelCommissionForTenantPayment,
  freezeCommissionForPartialRefund,
} from "@/lib/referrals/commission"
import { flagMonthlyCommissionForRefund } from "@/lib/referrals/monthly"
import { logAudit } from "@/lib/audit"
import type { AsaasWebhookPayload } from "./types"
import { swallow } from "@/lib/errors"
import {
  competenciaPagamento,
  dataPagamentoCliente,
} from "@/lib/asaas/competencia"
import { contextLogger } from "@/lib/logger"
import {
  applySplitEvent,
  isSplitEvent,
  splitIdFromPayload,
} from "@/lib/course-authoring/split-webhook"
import {
  settleSubscriptionCycle,
  markSubscriptionPastDue,
  revokeSubscriptionForRefund,
  recordOpenSubscriptionCharge,
} from "@/lib/subscriptions/renew"

/**
 * Campos da unidade que o processamento de MENSALIDADE precisa. Extraido para
 * constante porque agora ha DOIS caminhos que resolvem a mesma unidade — pela
 * assinatura (`asaasSubscriptionId`) e pelo cliente (`asaasCustomerId`, quando
 * a cobranca e avulsa) — e os dois desembocam no mesmo bloco. Dois `select`
 * escritos a mao divergiriam no primeiro campo novo, e o caminho esquecido
 * quebraria em runtime.
 */
const TENANT_BILLING_SELECT = {
  id: true,
  name: true,
  slug: true,
  customDomain: true,
  billingMode: true,
  status: true,
  activatedAt: true,
  cancellationPolicy: true,
  owner: { select: { email: true, name: true } },
} as const

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return iso
  }
}

/**
 * Suspende o tenant cuja Asaas subscription foi inativada/cancelada. Sem isso
 * o sweep so detectaria ~3 dias apos a proxima cobranca vencer.
 */
async function handleSubscriptionCancellation(
  logId: string,
  payload: AsaasWebhookPayload,
): Promise<void> {
  const { event, subscription } = payload
  const subscriptionId = subscription?.id
  if (!subscriptionId) {
    await markLog(logId, true, `${event} sem subscription.id`)
    return
  }

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { asaasSubscriptionId: subscriptionId },
        { asaasPromoSubscriptionId: subscriptionId },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      status: true,
      asaasSubscriptionId: true,
      asaasPromoSubscriptionId: true,
      owner: { select: { email: true, name: true } },
    },
  })

  if (!tenant) {
    await markLog(logId, true, `tenant nao encontrado para ${subscriptionId}`)
    return
  }

  await prisma.webhookLog
    .update({ where: { id: logId }, data: { tenantId: tenant.id } })
    .catch(swallow("asaas.process"))

  // Encerramento NATURAL da promo: ao atingir maxPayments, o Asaas inativa a
  // subscription promocional. Isso NAO pode suspender o tenant — a assinatura
  // regular (valor cheio) assume a partir do mes N. So suspendemos quando a
  // assinatura REGULAR e cancelada.
  if (
    subscriptionId === tenant.asaasPromoSubscriptionId &&
    subscriptionId !== tenant.asaasSubscriptionId
  ) {
    await markLog(logId, true, `${event}: promo encerrada (maxPayments) — sem suspensao`)
    return
  }

  if (tenant.status !== "SUSPENDED" && tenant.status !== "CANCELLED") {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "SUSPENDED" },
    })

    // Aguarda invalidação de cache antes de seguir — evita race onde requests
    // simultâneos leem status cached ACTIVE enquanto DB já mudou para SUSPENDED.
    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    }).catch(swallow("asaas.process"))

    const blockResult = await blockTenantStudents(tenant.id)
    if (blockResult.errors.length > 0) {
      contextLogger().error(
        { event: "asaas.subscription.block_errors", tenantId: tenant.id, errors: blockResult.errors },
        "erros ao bloquear alunos após cancelamento de assinatura",
      )
    }

    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: `Revendedor ${tenant.name} teve assinatura cancelada`,
      body: `Assinatura Asaas ${subscriptionId} foi ${event === "SUBSCRIPTION_DELETED" ? "removida" : "inativada"}. Tenant suspenso automaticamente.`,
      category: "tenant-billing",
      href: `/admin/revendedores/${tenant.id}`,
    })
  }

  await markLog(logId, true, `${event} processado`)
}

/**
 * Confirma o cancelamento de uma cobrança (mensalidade) via webhook
 * PAYMENT_DELETED. Valida na fonte que a cobrança foi REALMENTE removida —
 * `deleted: true` na re-busca, ou 404 — antes de marcar DELETED; um evento cuja
 * cobrança segue viva é espúrio e é ignorado. Fecha o ciclo iniciado pelo botão
 * "Cancelar" do painel (que deixa a linha em DELETING) e também pega a cobrança
 * apagada direto no Asaas, sem esperar a reconciliação diária.
 * asaasPaymentId é único, então o update casa no máximo 1 linha.
 */
async function handlePaymentDeleted(
  logId: string,
  payload: AsaasWebhookPayload,
): Promise<void> {
  const paymentId = payload.payment?.id
  if (!paymentId) {
    await markLog(logId, true, "PAYMENT_DELETED sem payment.id")
    return
  }

  // Validação: a cobrança foi mesmo removida?
  //
  // O DELETE do Asaas é um SOFT DELETE — a cobrança removida continua
  // respondendo 200 aqui, e o `status` dela NÃO muda (fica em PENDING/OVERDUE).
  // Quem prova a remoção é `payment.deleted`. A versão anterior desta função
  // exigia 404 como prova e por isso IGNOROU todos os PAYMENT_DELETED que já
  // recebemos, sem uma única confirmação; o que vinha salvando o banco era a
  // reconciliação diária, que só percebe a remoção até 24h depois.
  //
  // Continuamos RE-BUSCANDO em vez de ler o `deleted` do corpo do webhook —
  // mesma defesa em profundidade do resto do arquivo: corpo forjado não vira
  // escrita no banco. O 404 segue valendo como prova: id que não resolve na
  // conta é cobrança que não existe nem para ser lida.
  try {
    const payment = await getAsaasPayment(paymentId)
    if (!payment.deleted) {
      await markLog(logId, true, `PAYMENT_DELETED mas ${paymentId} não está removida no Asaas — ignorado`)
      return
    }
  } catch (err) {
    if (!(err instanceof AsaasApiError && err.statusCode === 404)) throw err
    // 404 confirmado → segue para marcar DELETED.
  }

  const existing = await prisma.tenantPayment.findUnique({
    where: { asaasPaymentId: paymentId },
    select: { id: true, tenantId: true, paidAt: true, markedPaidAt: true },
  })
  if (!existing) {
    await markLog(logId, true, `PAYMENT_DELETED: ${paymentId} sem TenantPayment correspondente`)
    return
  }

  // Mensalidade com PROVA DE PAGAMENTO nunca vira DELETED. `paidAt`/
  // `markedPaidAt` sobrevivem à reescrita de status (mesma doutrina da terceira
  // prova da varredura de inadimplência); `status` não.
  //
  // Não é hipótese: há mensalidades em produção que receberam PAYMENT_DELETED e
  // hoje constam RECEIVED — cobrança removida e, no mesmo dia, restaurada
  // (`POST /payments/{id}/restore`) e paga. Enquanto este handler era código
  // morto isso não tinha consequência; agora ele ESCREVE, e apagar do extrato
  // uma mensalidade que a unidade pagou tiraria receita real dos relatórios e
  // da comissão do indicador. Na dúvida, preservamos o pagamento: a
  // reconciliação diária corrige o caso contrário.
  if (existing.paidAt || existing.markedPaidAt) {
    await markLog(logId, true, `PAYMENT_DELETED: ${paymentId} tem pagamento registrado — ignorado`)
    return
  }

  await prisma.tenantPayment.update({
    where: { asaasPaymentId: paymentId },
    data: { status: "DELETED" },
  })

  await prisma.webhookLog
    .update({ where: { id: logId }, data: { tenantId: existing.tenantId } })
    .catch(swallow("asaas.process"))

  await markLog(logId, true, `PAYMENT_DELETED confirmado para ${paymentId}`)
}

async function markLog(
  logId: string,
  success: boolean,
  error?: string,
): Promise<void> {
  await prisma.webhookLog
    .update({
      where: { id: logId },
      data: {
        processed: success,
        processedAt: new Date(),
        error: error ?? null,
      },
    })
    .catch(swallow("asaas.process"))
}

/**
 * Parcela de uma MENSALIDADE DA UNIDADE parcelada no cartao.
 *
 * Por que existe: ao parcelar, criamos um parcelamento no Asaas
 * (POST /installments/) e REMOVEMOS a cobranca original da assinatura, senao a
 * unidade pagaria duas vezes. A consequencia e que as N parcelas chegam ao
 * webhook SEM `subscription` — elas nao casam com a assinatura da unidade, nao
 * casam com `BoletoInstallment` e nao casam com venda de aluno. Antes disto
 * caiam todas no fallback "sem subscription" e a linha em `tenant_payments`
 * ficava congelada no estado gravado na hora da compra.
 *
 * A linha-pai (`asaas_payment_id` = `ins_...`) representa o parcelamento
 * INTEIRO: `amount` ja e o valor cheio da mensalidade. Por isso aqui NAO se cria
 * linha nova por parcela — seria receita multiplicada por N no financeiro — nem
 * se mexe em `amount`. So avanca a contagem de parcelas pagas.
 *
 * Tambem NAO suspende a unidade num `PAYMENT_OVERDUE` de parcela: o valor cheio
 * ja foi autorizado no cartao na captura da 1a parcela, e uma parcela que o
 * emissor recusa depois e assunto de conciliacao, nao motivo para tirar a
 * vitrine do ar. Alertamos o SUPER_ADMIN em vez disso.
 *
 * Devolve `false` quando o parcelamento nao e de mensalidade de unidade (ex.:
 * carne de aluno), para o caller seguir com os demais roteamentos.
 */
export async function processTenantInstallmentPayment(
  logId: string,
  event: string,
  payment: NonNullable<AsaasWebhookPayload["payment"]>,
): Promise<boolean> {
  const installmentId = payment.installment
  if (!installmentId) return false

  const row = await prisma.tenantPayment.findFirst({
    where: { installmentId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      paidAt: true,
      installmentCount: true,
      installmentPaidIds: true,
      tenant: { select: { name: true } },
    },
  })
  if (!row) return false

  const isPaid = event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED"

  if (isPaid) {
    const total = row.installmentCount ?? 0

    // Re-entrega do Asaas: a parcela ja contada nao avanca nada. Sem isto a
    // linha passaria a exibir "7 de 6".
    if (row.installmentPaidIds.includes(payment.id)) {
      await markLog(logId, true, `mensalidade parcelada: parcela ${payment.id} ja contabilizada`)
      return true
    }

    // `push` no proprio UPDATE: duas entregas simultaneas nao podem ler o mesmo
    // array e uma sobrescrever a outra (o guard acima e read-then-write).
    const updated = await prisma.tenantPayment.update({
      where: { id: row.id },
      data: {
        status: "CONFIRMED",
        // `paidAt` marca a COMPETENCIA da mensalidade e so e gravado na
        // primeira liquidacao. Reescrever a cada parcela empurrava a data mes a
        // mes: uma mensalidade de janeiro parcelada em 6x aparecia como receita
        // de junho nos relatorios (que agrupam por `paid_at`), e janeiro ficava
        // zerado.
        ...(row.paidAt
          ? {}
          : {
              paidAt: payment.paymentDate
                ? new Date(payment.paymentDate)
                : new Date(),
            }),
        installmentPaidIds: { push: payment.id },
      },
      select: { installmentPaidIds: true },
    })
    const paidCount = updated.installmentPaidIds.length

    contextLogger().info(
      {
        event: "asaas.tenant_installment.paid",
        tenantId: row.tenantId,
        installmentId,
        paid: paidCount,
        total,
      },
      "parcela de mensalidade parcelada liquidada",
    )

    await markLog(
      logId,
      true,
      `mensalidade parcelada: parcela ${paidCount}${total ? `/${total}` : ""} liquidada`,
    )
    return true
  }

  if (event === "PAYMENT_OVERDUE" || event === "PAYMENT_REFUNDED") {
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: "Parcela de mensalidade com problema",
      body: `Revenda ${row.tenant.name}: a parcela ${payment.id} do parcelamento ${installmentId} veio como ${event}. A unidade NAO foi suspensa (o valor cheio foi autorizado na compra) — concilie no Asaas.`,
      href: "/admin/financeiro",
    }).catch(swallow("asaas.tenant_installment"))

    await markLog(logId, true, `mensalidade parcelada: ${event} — alerta enviado`)
    return true
  }

  await markLog(logId, true, `mensalidade parcelada: ${event} — sem acao`)
  return true
}

/**
 * Evento de cobranca de uma ASSINATURA DE ALUNO.
 *
 * Existe como funcao porque ha DUAS formas de chegar ate a mesma assinatura, e
 * elas precisam decidir IGUAL:
 *
 *  - pelo `asaasSubscriptionId`, nas assinaturas RECORRENTES (mensal a anual);
 *  - pelo `externalReference` `pmb_sub_<id>`, nas VITALICIAS — que nascem de uma
 *    cobranca AVULSA e por isso nao tem assinatura nenhuma no Asaas.
 *
 * Enquanto so existia o 1o caminho, a cobranca de um acesso vitalicio caia no
 * fallback de "mensalidade avulsa da unidade" logo abaixo: o aluno pagava, a
 * assinatura ficava PENDING para sempre e ele nunca via o catalogo que comprou.
 *
 * Devolve `true` quando o evento era de assinatura (tratado ou explicitamente
 * sem acao) e `false` quando nao ha assinatura correspondente — ai o chamador
 * segue com as demais resolucoes.
 */
async function handleStudentSubscriptionPayment(
  logId: string,
  event: string,
  payment: NonNullable<AsaasWebhookPayload["payment"]>,
  where: Prisma.StudentSubscriptionWhereInput,
): Promise<boolean> {
  const studentSub = await prisma.studentSubscription.findFirst({
    where,
    select: { id: true },
  })
  if (!studentSub) return false

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const { settled } = await settleSubscriptionCycle(studentSub.id, {
      gateway: "ASAAS",
      externalPaymentId: payment.id,
      amount: payment.value,
      paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
      dueDate: new Date(payment.dueDate),
      billingType: payment.billingType,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl,
    })
    await markLog(
      logId,
      true,
      settled
        ? `assinatura ${studentSub.id}: ciclo liquidado`
        : `assinatura ${studentSub.id}: ciclo ja registrado`,
    )
    return true
  }
  if (event === "PAYMENT_OVERDUE") {
    // Grava a fatura ANTES de marcar o atraso: é este link que a área do
    // aluno mostra para ele regularizar dentro da carência.
    await recordOpenSubscriptionCharge(studentSub.id, {
      gateway: "ASAAS",
      externalPaymentId: payment.id,
      amount: payment.value,
      dueDate: new Date(payment.dueDate),
      billingType: payment.billingType,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl,
      status: "OVERDUE",
    })
    // Só MARCA. Quem corta é o cron, depois da carência — revogar aqui
    // apagaria o progresso na EA de quem se atrasou um dia.
    await markSubscriptionPastDue(studentSub.id)
    await markLog(logId, true, `assinatura ${studentSub.id}: em atraso`)
    return true
  }

  if (event === "PAYMENT_CREATED" || event === "PAYMENT_UPDATED") {
    // Ciclo novo emitido pela recorrência: guarda o link de pagamento.
    await recordOpenSubscriptionCharge(studentSub.id, {
      gateway: "ASAAS",
      externalPaymentId: payment.id,
      amount: payment.value,
      dueDate: new Date(payment.dueDate),
      billingType: payment.billingType,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl,
      status: "PENDING",
    })
    await markLog(logId, true, `assinatura ${studentSub.id}: cobranca em aberto registrada`)
    return true
  }
  if (
    event === "PAYMENT_REFUNDED" ||
    event === "PAYMENT_CHARGEBACK_REQUESTED"
  ) {
    // Sem carência: ela existe para quem está tentando pagar, não para quem
    // pediu o dinheiro de volta.
    await revokeSubscriptionForRefund(studentSub.id)
    await markLog(logId, true, `assinatura ${studentSub.id}: estornada`)
    return true
  }
  await markLog(logId, true, `assinatura ${studentSub.id}: ${event} — sem acao`)
  return true
}

async function processPmbDirectSale(
  logId: string,
  event: string,
  payment: NonNullable<AsaasWebhookPayload["payment"]>,
): Promise<boolean> {
  // Detecta venda direta PMB por:
  // 1. externalReference (pmb_enr_<id>) — propagado para todas as cobrancas da subscription
  // 2. asaas_payment_id (legado, cobrancas one-time)
  // 3. asaas_subscription_id (parcelas seguintes da subscription, caso externalReference falhe)
  let enrollment = null as Awaited<
    ReturnType<typeof prisma.enrollment.findFirst>
  >

  if (payment.externalReference?.startsWith("pmb_enr_")) {
    const enrollmentId = payment.externalReference.replace("pmb_enr_", "")
    enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
    })
  }

  if (!enrollment) {
    enrollment = await prisma.enrollment.findFirst({
      where: { asaasPaymentId: payment.id },
    })
  }

  if (!enrollment && payment.subscription) {
    enrollment = await prisma.enrollment.findFirst({
      where: { asaasSubscriptionId: payment.subscription },
    })
  }

  if (!enrollment || enrollment.tenantId !== null) return false

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const wasSuspended = enrollment.status === "SUSPENDED"
    await fulfillEnrollment(
      {
        id: "__pmb__",
        slug: pmbPlataformaPolo(),
        plataformaVendedorId: pmbPlataformaVendedorId(),
        isPmbVitrine: true,
      },
      enrollment.id,
      {
        gateway: "ASAAS",
        externalPaymentId: payment.id,
        amount: payment.value,
        paidAt: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
        paymentType: enrollment.paymentType,
      },
    )
    // Recuperação pós-OVERDUE (mensalidade/cartão parcelado): o branch de
    // parcela subsequente do fulfill registra o pagamento mas NÃO mexe no
    // status — sem isto, uma matrícula suspensa por atraso ficaria SUSPENDED
    // para sempre mesmo com a cobrança regularizada. (Carnê de boleto não passa
    // aqui — reativa via settleBoletoInstallment/maybeReactivate.)
    if (wasSuspended) {
      const fresh = await prisma.enrollment.findUnique({
        where: { id: enrollment.id },
        select: { status: true },
      })
      if (fresh?.status === "SUSPENDED") {
        await prisma.enrollment
          .update({ where: { id: enrollment.id }, data: { status: "ACTIVE" } })
          .catch(swallow("asaas.process"))
      }
    }
    await markLog(
      logId,
      true,
      enrollment.installmentsTotal
        ? `pmb mensalidade processada (${enrollment.installmentsPaid + 1}/${enrollment.installmentsTotal})`
        : "pmb venda direta processada",
    )
    return true
  }

  if (event === "PAYMENT_OVERDUE") {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "SUSPENDED" },
    }).catch(swallow("asaas.process"))
  }

  await markLog(logId, true, `pmb venda direta: ${event} sem fulfillment`)
  return true
}

export async function processAsaasWebhook(
  logId: string,
  payload: AsaasWebhookPayload,
): Promise<void> {
  try {
    const { event } = payload

    // Eventos de assinatura (cancelamento/inativacao) chegam com `subscription`
    // em vez de `payment`. Tratamos primeiro para suspender o tenant antes
    // de qualquer logica que dependa de `payment`.
    if (
      event === "SUBSCRIPTION_INACTIVATED" ||
      event === "SUBSCRIPTION_DELETED"
    ) {
      await handleSubscriptionCancellation(logId, payload)
      return
    }

    if (event === "SUBSCRIPTION_CREATED" || event === "SUBSCRIPTION_UPDATED") {
      await markLog(logId, true, `assinatura ${event.toLowerCase()} — no-op`)
      return
    }

    // Confirmação de cancelamento de cobrança. Tratado ANTES do re-fetch geral:
    // uma cobrança deletada responde 404, então o getAsaasPayment abaixo
    // abortaria com "não existe → ignorado" e nunca marcaria o banco. Aqui o
    // 404 é justamente a PROVA de que a cobrança sumiu (DELETING → DELETED).
    if (event === "PAYMENT_DELETED") {
      await handlePaymentDeleted(logId, payload)
      return
    }

    let payment = payload.payment
    if (!payment) {
      await markLog(logId, true, `evento ${event} sem payment`)
      return
    }

    // Defesa em profundidade (espelha reseller-process.ts e o webhook MP): NÃO
    // confiar no corpo do webhook. Re-busca o pagamento autoritativo na conta
    // Asaas GLOBAL da PMB (sem apiKeyOverride). Se o id não existir lá (404), o
    // corpo é forjado/alheio → ignora. Reatribui `payment` para que TODO o
    // processamento abaixo (upsert de TenantPayment, ativação, comissão, venda
    // direta PMB) reflita value/status/dueDate REAIS, não o que veio no corpo.
    // Antes, a única barreira era o token estático global — insuficiente se ele
    // vazasse (ativação/comissão forjadas sem pagamento real).
    try {
      payment = await getAsaasPayment(payment.id)
    } catch (err) {
      if (err instanceof AsaasApiError && err.statusCode === 404) {
        await markLog(logId, true, `pagamento ${payment.id} não existe na conta global PMB — ignorado`)
        return
      }
      throw err
    }

    // ── Eventos de rateio ────────────────────────────────────────────────
    // ANTES de qualquer roteamento. Uma cobranca COM split e, por definicao,
    // uma venda direta da vitrine PMB — e `processPmbDirectSale` devolve `true`
    // para TODO evento que casa com a matricula (o `${event} sem fulfillment`
    // do fim). Tratado la embaixo no switch, o ramo era inalcancavel justamente
    // para as cobrancas que tem rateio: o alerta de DIVERGENCE_BLOCK nunca
    // saia, o Asaas cancelava o split em 2 dias uteis e o produtor perdia o
    // dinheiro daquela venda em silencio.
    if (isSplitEvent(event)) {
      const splitNote = await applySplitEvent(event, {
        asaasPaymentId: payment.id,
        splitId: splitIdFromPayload(payload),
        // Conta-mae: a cobranca emitida aqui tem `Payment.tenantId` null.
        tenantId: null,
        splits: payment.splits,
      })
      await markLog(logId, true, splitNote)
      return
    }

    const subscriptionId = payment.subscription

    // ASSINATURA DE ALUNO pelo `externalReference`. Roteada ANTES de tudo, e em
    // especial antes do bloco `!subscriptionId` logo abaixo: a assinatura
    // VITALICIA nasce de uma cobranca AVULSA, entao ela chega aqui sem
    // `subscription` e cairia no fallback de "mensalidade avulsa da unidade",
    // que tenta casar a cobranca com um tenant pelo `customer`. O aluno pagaria
    // e a assinatura ficaria PENDING para sempre.
    //
    // O Asaas propaga o `externalReference` para TODAS as cobrancas de uma
    // assinatura, entao este caminho tambem cobre as recorrentes — o casamento
    // por `asaasSubscriptionId` continua abaixo como rede de seguranca.
    if (payment.externalReference?.startsWith("pmb_sub_")) {
      const handledSub = await handleStudentSubscriptionPayment(
        logId,
        event,
        payment,
        { id: payment.externalReference.slice("pmb_sub_".length) },
      )
      if (handledSub) return
    }

    // Preenchido quando a cobranca e AVULSA (sem assinatura) e mesmo assim
    // pertence a uma unidade — ver o bloco "MENSALIDADE AVULSA" abaixo.
    let tenantFromCustomer: Prisma.TenantGetPayload<{
      select: typeof TENANT_BILLING_SELECT
    }> | null = null
    if (!subscriptionId) {
      // Parcela de carnê da VITRINE PMB (tenantId=null): roteia pela linha
      // BoletoInstallment (asaasPaymentId), como no branch da revenda
      // (reseller-process.ts). Roda ANTES de processPmbDirectSale de propósito:
      // as parcelas usam externalReference carne_<id> (não pmb_enr_), e um
      // PAYMENT_OVERDUE de parcela NÃO pode cair no SUSPENDED genérico da venda
      // direta — o sweep diário é o dono da semântica de atraso do carnê.
      const pmbParcel = await prisma.boletoInstallment.findFirst({
        where: { asaasPaymentId: payment.id, tenantId: null },
      })
      if (pmbParcel) {
        if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
          await settleBoletoInstallment({
            installment: pmbParcel,
            tenant: {
              id: "__pmb__",
              slug: pmbPlataformaPolo(),
              plataformaVendedorId: pmbPlataformaVendedorId(),
              isPmbVitrine: true,
            },
            event: {
              gateway: "ASAAS",
              externalPaymentId: payment.id,
              amount: payment.value,
              paidAt: payment.paymentDate
                ? new Date(payment.paymentDate)
                : new Date(),
            },
          })
          await markLog(
            logId,
            true,
            `pmb carne parcela ${pmbParcel.number} liquidada`,
          )
          return
        }
        await markLog(
          logId,
          true,
          `pmb carne parcela ${pmbParcel.number}: ${event} — sem acao (sweep trata atraso)`,
        )
        return
      }

      // Parcela de uma MENSALIDADE DA UNIDADE parcelada no cartao. O
      // parcelamento substitui a cobranca da assinatura (que e removida), entao
      // as parcelas chegam SEM `subscription` — sem este branch elas morriam no
      // fallback abaixo e a linha em tenant_payments nunca refletia o recebido.
      if (payment.installment) {
        const handledInstallment = await processTenantInstallmentPayment(
          logId,
          event,
          payment,
        )
        if (handledInstallment) return
      }

      const handled = await processPmbDirectSale(logId, event, payment)
      if (handled) return

      // MENSALIDADE AVULSA DA UNIDADE.
      //
      // Cobranca criada A MAO no painel do Asaas — valor negociado, acordo de
      // parcelamento, diferenca de plano — nasce SEM `subscription` e SEM
      // `externalReference`. Ate aqui ela morria no fallback logo abaixo: a
      // unidade PAGAVA e nada acontecia. Nao entrava no ledger pelo webhook,
      // nao reativava a unidade suspensa, nao gerava comissao de indicacao.
      // Medido em producao: 48 pagamentos recebidos e ignorados desde junho —
      // `cesitec` pagou R$ 120 em 26/08 e seguiu CANCELADA; `ascentro...` pagou
      // R$ 239 em 30/06 e seguiu SUSPENSA.
      //
      // O `reconcile` diario espelhava essas cobrancas em TenantPayment (por
      // isso algumas aparecem como RECEIVED no financeiro), mas ele NAO mexe em
      // status de unidade — o dinheiro entrava e a vitrine continuava fora do
      // ar. Espelhar nao e efetivar.
      //
      // O unico vinculo que o Asaas propaga numa cobranca avulsa e o
      // `customer`, que e exatamente o `asaasCustomerId` que gravamos quando a
      // assinatura da unidade foi criada.
      tenantFromCustomer = payment.customer
        ? await prisma.tenant.findFirst({
            where: { asaasCustomerId: payment.customer },
            select: TENANT_BILLING_SELECT,
          })
        : null

      if (!tenantFromCustomer) {
        await markLog(logId, true, `sem subscription: ${event}`)
        return
      }
    }

    // ASSINATURA DE ALUNO. Roteada ANTES da matricula e do tenant: os tres usam
    // `asaasSubscriptionId`, e uma assinatura nao casaria com nenhum dos outros
    // dois — cairia no fallback e o ciclo nunca renovaria.
    //
    // Guardado por `subscriptionId`: a mensalidade avulsa resolvida acima chega
    // aqui SEM assinatura e nao tem o que casar nestes dois blocos.
    if (subscriptionId) {
    if (
      await handleStudentSubscriptionPayment(logId, event, payment, {
        asaasSubscriptionId: subscriptionId,
      })
    ) {
      return
    }

    // Se a subscription pertence a uma matricula PMB (vitrine principal),
    // delega para o processamento de venda direta antes de tentar tenant.
    const pmbEnrollmentForSubscription = await prisma.enrollment.findFirst({
      where: { asaasSubscriptionId: subscriptionId, tenantId: null },
      select: { id: true },
    })
    if (pmbEnrollmentForSubscription) {
      const handled = await processPmbDirectSale(logId, event, payment)
      if (handled) return
    }
    }

    // Casa tanto a assinatura regular quanto a promocional (mensalidade
    // promocional usa duas subscriptions; ambas cobram o mesmo tenant).
    // `tenantFromCustomer` ja vem resolvido quando a cobranca e avulsa.
    const tenant =
      tenantFromCustomer ??
      (await prisma.tenant.findFirst({
        where: {
          OR: [
            { asaasSubscriptionId: subscriptionId },
            { asaasPromoSubscriptionId: subscriptionId },
          ],
        },
        select: TENANT_BILLING_SELECT,
      }))

    if (!tenant) {
      await markLog(logId, true, `tenant nao encontrado para ${subscriptionId}`)
      return
    }

    await prisma.webhookLog.update({
      where: { id: logId },
      data: { tenantId: tenant.id },
    }).catch(swallow("asaas.process"))

    const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : null
    // Tres datas, tres perguntas: `paidAt` = quando o dinheiro entrou (caixa),
    // `clientPaidAt` = quando o cliente pagou (fato), `competenceAt` = a que mes
    // a mensalidade pertence (regra). Ver ./competencia.ts.
    const clientPaidAt = dataPagamentoCliente(payment)
    const competenceAt = competenciaPagamento(payment)

    const tenantPaymentRow = await prisma.tenantPayment.upsert({
      where: { asaasPaymentId: payment.id },
      update: {
        status: payment.status,
        paidAt,
        clientPaidAt,
        competenceAt,
        ...(payment.invoiceUrl ? { invoiceUrl: payment.invoiceUrl } : {}),
        ...(payment.bankSlipUrl ? { bankSlipUrl: payment.bankSlipUrl } : {}),
      },
      create: {
        tenantId: tenant.id,
        asaasPaymentId: payment.id,
        amount: payment.value,
        billingType: payment.billingType,
        status: payment.status,
        dueDate: new Date(payment.dueDate),
        paidAt,
        clientPaidAt,
        competenceAt,
        invoiceUrl: payment.invoiceUrl ?? null,
        bankSlipUrl: payment.bankSlipUrl ?? null,
      },
      select: { id: true },
    })

    switch (event) {
      case "PAYMENT_RECEIVED":
      case "PAYMENT_CONFIRMED": {
        const wasSuspended = tenant.status === "SUSPENDED"

        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            status: "ACTIVE",
            // Marca a 1a ativacao (base p/ escalonamento de comissao). So na
            // primeira vez — reativacoes pos-suspensao nao reiniciam a escala.
            ...(tenant.activatedAt ? {} : { activatedAt: paidAt ?? new Date() }),
          },
        })

        await invalidateTenant({ id: tenant.id, slug: tenant.slug, customDomain: tenant.customDomain }).catch(swallow("asaas.process"))

        if (wasSuspended) {
          const result = await unblockTenantStudents(tenant.id)
          if (result.errors.length > 0) {
            contextLogger().error(
              { event: "asaas.payment.unblock_errors", tenantId: tenant.id, errors: result.errors },
              "erros ao desbloquear alunos após pagamento",
            )
          }
        }

        if (tenant.owner?.email) {
          const ownerEmail = tenant.owner.email
          const ownerName = tenant.owner.name ?? tenant.name
          // Em background (após o 200 do webhook) para não somar latência de SMTP
          // ao tempo de resposta do gateway. Best-effort — falha só é logada.
          afterResponse(async () => {
            try {
              await sendEmail({
                to: ownerEmail,
                tenantId: tenant.id,
                subject: "Pagamento da mensalidade confirmado",
                template: {
                  type: "payment",
                  props: {
                    customerName: ownerName,
                    amount: formatMoney(payment.value),
                    paymentDate: formatDate(payment.paymentDate),
                    description:
                      "Recebemos sua mensalidade do Profissionaliza Mais Brasil — obrigado! Sua vitrine segue ativa.",
                    receiptUrl: payment.transactionReceiptUrl ?? undefined,
                    variant: "confirmed",
                  },
                },
              })
            } catch (err) {
              contextLogger().error(
                { err, event: "asaas.payment.email_failed", tenantId: tenant.id },
                "falha ao enviar email de confirmação de pagamento",
              )
            }
          })
        }

        await createNotification({
          audience: "TENANT",
          tenantId: tenant.id,
          level: "SUCCESS",
          title: wasSuspended
            ? "Conta reativada após pagamento"
            : "Mensalidade paga",
          body: `Pagamento de ${formatMoney(payment.value)} confirmado.`,
          category: "tenant-billing",
          href: "/painel/financeiro",
          // Email de confirmação dedicado já enviado acima — não duplicar.
          suppressEmail: true,
        })

        // Cria comissao de indicacao (1-nivel) se o tenant possui referrer
        await createCommissionForTenantPayment(tenantPaymentRow.id).catch(
          (err) => {
            contextLogger().error(
              { err, event: "asaas.payment.commission_failed", tenantPaymentId: tenantPaymentRow.id },
              "createCommissionForTenantPayment falhou",
            )
          },
        )
        break
      }

      case "PAYMENT_OVERDUE": {
        // A CARENCIA E DA REGUA, NAO DO GATEWAY.
        //
        // Este branch suspendia a unidade e bloqueava os alunos no INSTANTE em
        // que o Asaas dispara PAYMENT_OVERDUE — que e D+1. A regra do produto
        // (`overdue-policy.ts`, tambem usada pelo sweep diario) so corta em
        // D+3, e ha unidade em producao com carencia propria de 15 dias. Como
        // o webhook sempre chega antes do cron, ele decidia sozinho e a regua
        // nunca era consultada: em 01/09 seis unidades foram suspensas com 1 ou
        // 2 dias de atraso e 17 alunos perderam acesso as aulas.
        //
        // O relogio aqui e o MESMO do sweep — `dueDate` da cobranca, em dia
        // civil brasileiro — para as duas metades nao divergirem.
        const ruler = resolveOverdueRuler(tenant.cancellationPolicy)
        const diasDeAtraso = overdueDays(new Date(payment.dueDate))

        if (diasDeAtraso < ruler.suspendAfterDays) {
          // Ainda dentro da carencia: a cobranca ja foi registrada no
          // TenantPayment acima (a unidade ve o vencido no painel) e o e-mail
          // de aviso sai normalmente. Quem suspende, se ela nao pagar, e o
          // sweep diario quando o prazo estourar.
          await markLog(
            logId,
            true,
            `overdue ${diasDeAtraso}d — dentro da carencia de ${ruler.suspendAfterDays}d, sem suspensao`,
          )
          break
        }

        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { status: "SUSPENDED" },
        })

        await invalidateTenant({ id: tenant.id, slug: tenant.slug, customDomain: tenant.customDomain }).catch(swallow("asaas.process"))

        if (tenant.billingMode === "AUTO") {
          const result = await blockTenantStudents(tenant.id)
          if (result.errors.length > 0) {
            contextLogger().error(
              { event: "asaas.overdue.block_errors", tenantId: tenant.id, errors: result.errors },
              "erros ao bloquear alunos após overdue",
            )
          }
        }

        if (tenant.owner?.email) {
          const ownerEmail = tenant.owner.email
          const ownerName = tenant.owner.name ?? tenant.name
          const subject =
            tenant.billingMode === "AUTO"
              ? "Sua mensalidade venceu — alunos bloqueados"
              : "Sua mensalidade venceu"
          afterResponse(async () => {
            try {
              await sendEmail({
                to: ownerEmail,
                tenantId: tenant.id,
                subject,
                template: {
                  type: "payment",
                  props: {
                    customerName: ownerName,
                    amount: formatMoney(payment.value),
                    paymentDate: formatDate(payment.dueDate),
                    description:
                      tenant.billingMode === "AUTO"
                        ? "Sua mensalidade venceu. Para evitar perda de receita, seus alunos foram bloqueados temporariamente até a regularização."
                        : "Sua mensalidade venceu. Regularize agora para manter a vitrine ativa e evitar o bloqueio dos seus alunos.",
                    receiptUrl: payment.invoiceUrl ?? undefined,
                    variant: "overdue",
                  },
                },
              })
            } catch (err) {
              contextLogger().error(
                { err, event: "asaas.overdue.email_failed", tenantId: tenant.id },
                "falha ao enviar email de overdue",
              )
            }
          })
        }

        await createNotification({
          audience: "TENANT",
          tenantId: tenant.id,
          level: "ERROR",
          title: "Mensalidade em atraso — conta suspensa",
          body:
            tenant.billingMode === "AUTO"
              ? `Vencimento ${formatDate(payment.dueDate)}. Seus alunos foram bloqueados.`
              : `Vencimento ${formatDate(payment.dueDate)}. Regularize para evitar bloqueio dos alunos.`,
          category: "tenant-billing",
          href: payment.invoiceUrl ?? "/painel/financeiro",
          // Email de atraso dedicado já enviado acima — não duplicar.
          suppressEmail: true,
        })

        await createNotification({
          audience: "ROLE",
          roleTarget: "SUPER_ADMIN",
          level: "WARNING",
          title: `Revendedor ${tenant.name} inadimplente`,
          body: `Cobrança ${formatMoney(payment.value)} venceu em ${formatDate(payment.dueDate)}.`,
          category: "tenant-billing",
          href: `/admin/revendedores/${tenant.id}`,
        })
        break
      }

      case "PAYMENT_REFUNDED":
      case "PAYMENT_PARTIALLY_REFUNDED": {
        const isPartial = event === "PAYMENT_PARTIALLY_REFUNDED"

        // Atualiza status da cobrança no banco
        await prisma.tenantPayment
          .updateMany({
            where: { asaasPaymentId: payment.id, tenantId: tenant.id },
            data: { status: payment.status },
          })
          .catch(swallow("asaas.process"))

        // Cancela comissao de indicacao (se houver). Para refund TOTAL,
        // a comissão é cancelada inteira. Para refund PARCIAL, só
        // anulamos se o refund cobre a comissão integral; caso contrário
        // a deixamos para revisão manual (admin avalia se é proporcional).
        // Antes, refund parcial CANCELAVA toda a comissão — desproporcional
        // pra refund de R$10 em fatura de R$200.
        if (!isPartial) {
          await cancelCommissionForTenantPayment(
            tenantPaymentRow.id,
            "refund",
          ).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.refund.cancel_commission_failed", tenantPaymentId: tenantPaymentRow.id },
              "cancelCommissionForTenantPayment falhou",
            )
          })
          // Motor por faixas (MONTHLY_TIERED): a comissão mensal não está
          // atrelada a um tenantPaymentId, então tratamos o clawback à parte.
          await flagMonthlyCommissionForRefund(
            tenantPaymentRow.id,
            "refund",
          ).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.refund.flag_monthly_failed", tenantPaymentId: tenantPaymentRow.id },
              "flagMonthlyCommissionForRefund falhou",
            )
          })
        } else {
          // Refund PARCIAL (SAAS-005): NÃO cancela/reverte a comissão (evita
          // over-clawback num estorno pequeno — o valor proporcional é decisão
          // do admin), mas CONGELA o saque marcando [CLAWBACK_PENDING], que os
          // gates de saque (requestPayout + processMonthlyPayouts) honram para
          // BLOQUEAR novos payouts do indicador até a revisão manual. Sem isto,
          // o indicador poderia sacar a comissão integral sobre uma mensalidade
          // parcialmente estornada.
          await freezeCommissionForPartialRefund(
            tenantPaymentRow.id,
            "refund_parcial",
          ).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.partial_refund.freeze_commission_failed", tenantPaymentId: tenantPaymentRow.id },
              "freezeCommissionForPartialRefund falhou",
            )
          })
          // Motor por faixas (MONTHLY_TIERED): congela a comissão mensal
          // AVAILABLE/PAID da competência (mesmo marcador) — bloqueio idêntico.
          await flagMonthlyCommissionForRefund(
            tenantPaymentRow.id,
            "refund_parcial",
          ).catch((err) => {
            contextLogger().error(
              { err, event: "asaas.partial_refund.flag_monthly_failed", tenantPaymentId: tenantPaymentRow.id },
              "flagMonthlyCommissionForRefund (parcial) falhou",
            )
          })
          await logAudit({
            action: "referral.partial_refund.freeze",
            resource: "TenantPayment",
            resourceId: tenantPaymentRow.id,
            actorRole: "SYSTEM",
            actorEmail: "asaas-webhook",
            tenantId: tenant.id,
            payloadAfter: {
              asaasPaymentId: payment.id,
              status: payment.status,
              note: "comissão congelada; saques do indicador bloqueados até revisão manual",
            },
          })
          await createNotification({
            audience: "ROLE",
            roleTarget: "SUPER_ADMIN",
            level: "WARNING",
            title: `Refund parcial em ${tenant.name}`,
            body: `Pagamento ${payment.id} estornado parcialmente. A comissão de indicação foi CONGELADA (saques bloqueados) — revise e ajuste manualmente em /admin/indicacoes/comissoes.`,
            category: "referral",
            href: `/admin/indicacoes/comissoes`,
          }).catch(swallow("asaas.partial_refund_freeze_notify"))
        }

        // Verifica se ainda há algum pagamento RECEIVED/CONFIRMED para este tenant.
        // Se não houver, suspende a conta (dinheiro foi devolvido = não pagou).
        // Para refund PARCIAL, NÃO suspende — tenant ainda pagou parte.
        const otherConfirmed = await prisma.tenantPayment.findFirst({
          where: {
            tenantId: tenant.id,
            asaasPaymentId: { not: payment.id },
            status: { in: ["RECEIVED", "CONFIRMED"] },
          },
          select: { id: true },
        })

        if (!isPartial && !otherConfirmed && tenant.status === "ACTIVE") {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { status: "SUSPENDED" },
          })
          await invalidateTenant({ id: tenant.id, slug: tenant.slug, customDomain: tenant.customDomain }).catch(swallow("asaas.process"))

          if (tenant.billingMode === "AUTO") {
            const result = await blockTenantStudents(tenant.id)
            if (result.errors.length > 0) {
              contextLogger().error(
                { event: "asaas.refund.block_errors", tenantId: tenant.id, errors: result.errors },
                "erros ao bloquear alunos após refund",
              )
            }
          }
        }

        // Notifica admin sobre o estorno
        await createNotification({
          audience: "ROLE",
          roleTarget: "SUPER_ADMIN",
          level: "WARNING",
          title: `Estorno detectado: ${tenant.name}`,
          body: `Pagamento de ${formatMoney(payment.value)} foi ${isPartial ? "parcialmente estornado" : "estornado"}.${!isPartial && !otherConfirmed ? " Conta suspensa automaticamente." : ""}`,
          category: "tenant-billing",
          href: `/admin/revendedores/${tenant.id}`,
        })

        // Notifica o dono do tenant
        await createNotification({
          audience: "TENANT",
          tenantId: tenant.id,
          level: "ERROR",
          title: "Pagamento estornado",
          body: `O pagamento de ${formatMoney(payment.value)} foi estornado.${!otherConfirmed ? " Sua conta foi suspensa. Regularize para reativar." : ""}`,
          category: "tenant-billing",
          href: "/painel/financeiro",
          // Email de estorno dedicado já enviado abaixo — não duplicar.
          suppressEmail: true,
        })

        if (tenant.owner?.email) {
          const ownerEmail = tenant.owner.email
          const ownerName = tenant.owner.name ?? tenant.name
          afterResponse(async () => {
            try {
              await sendEmail({
                to: ownerEmail,
                tenantId: tenant.id,
                subject: "Pagamento estornado",
                template: {
                  type: "payment",
                  props: {
                    customerName: ownerName,
                    amount: formatMoney(payment.value),
                    paymentDate: formatDate(payment.paymentDate),
                    description: !otherConfirmed
                      ? "Identificamos o estorno deste pagamento e sua conta foi suspensa. Para reativar a vitrine, faça uma nova cobrança."
                      : "Identificamos um estorno. Sua conta permanece ativa porque há outros pagamentos confirmados no período.",
                    receiptUrl: payment.invoiceUrl ?? undefined,
                    variant: "refunded",
                  },
                },
              })
            } catch (err) {
              contextLogger().error(
                { err, event: "asaas.refund.email_failed", tenantId: tenant.id },
                "falha ao enviar email de estorno",
              )
            }
          })
        }
        break
      }

      // PAYMENT_DELETED é tratado cedo em handlePaymentDeleted (a cobrança
      // deletada responde 404 e nunca chega aqui após o re-fetch).

      case "PAYMENT_CREATED":
      case "PAYMENT_UPDATED":
      default:
        break
    }

    await markLog(logId, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    contextLogger().error(
      { err: error, event: "asaas.process.failed", webhookLogId: logId },
      "webhook Asaas processing failed",
    )
    await markLog(logId, false, message)
    // Erros transitórios (Asaas 5xx/rede, deadlock/timeout de DB) são RELANÇADOS
    // para a rota responder 500 e o Asaas REENTREGAR — o processamento é
    // idempotente (asaasPaymentId no upsert + advisory lock no fulfill). Mesma
    // política do webhook MP e do branch de revenda (que relança tudo).
    if (isTransientWebhookError(error)) throw error
  }
}
