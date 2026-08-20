import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { decryptTenantMpToken, getPayment, getAuthorizedPayment, searchPayments } from "./client"
import {
  getPayment as getAsaasPayment,
  listPayments as listAsaasPayments,
  decryptTenantAsaasKey,
} from "@/lib/asaas/client"
import { validateMpWebhookSignature } from "./webhook"
import type { MPPayment } from "./types"
import { pmbPlataformaPolo, pmbPlataformaVendedorId, pmbMpAccessToken } from "@/lib/pmb-config"
import { fulfillFromMpPayment } from "./fulfillment"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { settleBoletoInstallment } from "@/lib/installments/settle"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import {
  notifyStudentPaymentPending,
  notifyStudentPaymentRejected,
} from "./student-payment-emails"
import { swallow } from "@/lib/errors"
import {
  settleSubscriptionCycle,
  markSubscriptionPastDue,
  revokeSubscriptionForRefund,
} from "@/lib/subscriptions/renew"
import { isTransientWebhookError } from "@/lib/webhooks/transient"
import { contextLogger } from "@/lib/logger"

interface ProcessArgs {
  logId: string
  paymentId: string
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
  tenantSlug: string | null
  /** type/action/topic da notificação — usado p/ subscription_authorized_payment. */
  topic: string
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
    .catch(swallow("mp.process"))
}

interface TenantContext {
  id: string
  name: string
  slug: string
  plataformaVendedorId: string | null
  mpAccessToken: string | null
  // Secret de validação do webhook MP. Revendedor: criptografada (igual ao
  // token). PMB: valor plain vindo da env MP_WEBHOOK_SECRET.
  mpWebhookSecret: string | null
  primaryColor: string
  isPmbVitrine?: boolean
}

async function buildPmbContext(): Promise<TenantContext | null> {
  const token = await pmbMpAccessToken()
  if (!token) return null
  return {
    id: "__pmb__",
    name: "PMB Vitrine",
    slug: pmbPlataformaPolo(),
    plataformaVendedorId: pmbPlataformaVendedorId(),
    mpAccessToken: token,
    mpWebhookSecret: process.env.MP_WEBHOOK_SECRET ?? null,
    primaryColor: "#00a862",
    isPmbVitrine: true,
  }
}

async function resolveTenantById(id: string): Promise<TenantContext | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      plataformaVendedorId: true,
      mpAccessToken: true,
      mpWebhookSecret: true,
      primaryColor: true,
    },
  })
  if (!tenant || !tenant.mpAccessToken) return null
  return tenant
}

async function resolveTenantBySlug(slug: string): Promise<TenantContext | null> {
  if (slug === "pmb" || slug === pmbPlataformaPolo()) return buildPmbContext()

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      plataformaVendedorId: true,
      mpAccessToken: true,
      mpWebhookSecret: true,
      primaryColor: true,
    },
  })
  if (!tenant || !tenant.mpAccessToken) return null
  return tenant
}

async function resolveEnrollmentId(
  tenant: TenantContext,
  payment: MPPayment,
): Promise<string | null> {
  if (!payment.external_reference) return null

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      externalReference: payment.external_reference,
      ...(tenant.isPmbVitrine ? { tenantId: null } : { tenantId: tenant.id }),
    },
    select: { id: true },
  })
  return enrollment?.id ?? null
}

/**
 * Status MP que devem revogar uma matrícula previamente ativa. Inclui:
 *  - refunded: estorno solicitado pelo vendedor/comprador
 *  - charged_back: chargeback iniciado pelo emissor do cartão
 *  - cancelled: pagamento cancelado pós-aprovação
 */
const MP_TO_PAYMENT_STATUS: Record<string, "REFUNDED" | "CHARGED_BACK" | "CANCELLED"> = {
  refunded: "REFUNDED",
  charged_back: "CHARGED_BACK",
  cancelled: "CANCELLED",
}

async function revokeEnrollmentFromMp(
  tenant: TenantContext,
  enrollmentId: string,
  payment: MPPayment,
): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      studentId: true,
      courseId: true,
      course: { select: { nome: true } },
      student: { select: { id: true, nome: true } },
    },
  })
  if (!enrollment) return

  // Se já estava cancelado, nada a fazer.
  if (enrollment.status === "CANCELLED") return

  const newPaymentStatus = MP_TO_PAYMENT_STATUS[payment.status] ?? "CANCELLED"

  await prisma.$transaction([
    prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "CANCELLED" },
    }),
    prisma.payment.updateMany({
      where: { mpPaymentId: String(payment.id) },
      data: { mpStatus: newPaymentStatus },
    }),
  ])

  // Best-effort: desvincular o curso na plataforma de aulas.
  // Se falhar (curso já desvinculado, plataforma fora do ar, etc.), o estado
  // no nosso banco já reflete CANCELLED e o aluno não verá o curso no painel.
  await unlinkCourseFromStudent(enrollment.studentId, enrollment.courseId).catch(
    (err) => {
      contextLogger().warn(
        { err, event: "mp.revoke.unlink_failed", studentId: enrollment.studentId, courseId: enrollment.courseId },
        "unlink de curso na plataforma falhou no revoke (best-effort)",
      )
    },
  )

  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.studentId,
    level: "WARNING",
    title: `Matrícula em ${enrollment.course.nome} foi cancelada`,
    body:
      payment.status === "refunded"
        ? "Pagamento estornado. Acesso ao curso foi removido."
        : payment.status === "charged_back"
          ? "Chargeback registrado. Acesso ao curso foi removido."
          : "Pagamento cancelado. Acesso ao curso foi removido.",
    category: "enrollment",
    href: "/aluno/cursos",
  }).catch(swallow("mp.process"))

  if (!tenant.isPmbVitrine) {
    await createNotification({
      audience: "TENANT",
      tenantId: tenant.id,
      level: "WARNING",
      title: `Reembolso/chargeback — ${enrollment.student.nome}`,
      body: `${enrollment.course.nome} • status ${payment.status} • R$ ${payment.transaction_amount
        .toFixed(2)
        .replace(".", ",")}`,
      category: "payment",
      href: "/painel/financeiro",
    }).catch(swallow("mp.process"))
  }
}

/**
 * Parcela de carnê (venda parcelada no boleto): external_reference = parc_<id>.
 * Cada boleto do carnê é um pagamento MP independente; roteamos pela linha da
 * parcela (BoletoInstallment) em vez da matrícula. A 1ª parcela paga provisiona
 * o acesso; as demais só registram — tudo via settleBoletoInstallment (idempotente).
 */
async function handleInstallmentMpPayment(
  tenant: TenantContext,
  payment: MPPayment,
  logId: string,
): Promise<void> {
  const installmentId = (payment.external_reference ?? "").slice("parc_".length)
  const installment = await prisma.boletoInstallment.findUnique({
    where: { id: installmentId },
  })
  if (!installment) {
    await markLog(logId, true, `parcela ${installmentId} nao encontrada`)
    return
  }

  // Anti cross-tenant: a parcela pertence à conta MP deste webhook.
  const expectedTenantId = tenant.isPmbVitrine ? null : tenant.id
  if (installment.tenantId !== expectedTenantId) {
    await markLog(logId, false, `parcela ${installmentId} de outro tenant`)
    return
  }

  if (payment.status !== "approved") {
    // pending (boleto emitido), rejected, in_process: só registra. O acesso e a
    // contagem só mudam quando a parcela é efetivamente paga (approved).
    await markLog(logId, true, `parcela ${installment.number} status=${payment.status}`)
    return
  }

  await settleBoletoInstallment({
    installment,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      plataformaVendedorId: tenant.plataformaVendedorId,
      isPmbVitrine: tenant.isPmbVitrine,
      name: tenant.name,
    },
    event: {
      gateway: "MP",
      externalPaymentId: String(payment.id),
      amount: payment.transaction_amount,
      paidAt: payment.date_approved ? new Date(payment.date_approved) : new Date(),
      mpPaymentType: payment.payment_type_id,
    },
  })
  await markLog(logId, true, `parcela ${installment.number} paga`)
}

/** Alias local — delega ao módulo de fulfillment compartilhado. */
const fulfillFromMp = fulfillFromMpPayment

export async function processMpWebhook(args: ProcessArgs): Promise<void> {
  const { logId, paymentId, xSignature, xRequestId, dataId, tenantSlug, topic } = args

  try {
    // ── Passo 1: idempotência ──────────────────────────────────────────────
    // Se já processamos este payment, ignora antes de qualquer query/IO.
    const alreadyPaid = await prisma.payment.findUnique({
      where: { mpPaymentId: paymentId },
      select: { id: true },
    })
    if (alreadyPaid) {
      await markLog(logId, true, "payment ja processado")
      return
    }

    // ── Passo 2: resolver o tenant ANTES do HMAC ───────────────────────────
    // A secret de validação do webhook MP é POR CONTA: cada revendedor usa a
    // própria conta MP, logo cada um tem a própria assinatura secreta. Por isso
    // precisamos saber de qual tenant é a notificação antes de validar o HMAC.
    // A notification_url inclui ?tenant=<slug> para vendas de revendedores, e
    // não inclui para a vitrine PMB — isso elimina a ambiguidade de qual conta
    // MP pertence o pagamento. tenantSlug é sanitizado em
    // /api/webhooks/mercadopago/route.ts (regex /^[a-z0-9_-]{1,64}$/i).
    let tenant: TenantContext | null = null

    if (tenantSlug) {
      tenant = await resolveTenantBySlug(tenantSlug)
    } else {
      // Sem slug = vitrine PMB
      tenant = await buildPmbContext()
    }

    if (!tenant || !tenant.mpAccessToken) {
      // Antes marcávamos como processed=true e retornávamos 200 ao MP —
      // pagamento aprovado virava aluno NUNCA matriculado, sem retry e sem
      // visibilidade. Agora: deixamos processed=false (para inspeção via
      // WebhookLog) e alertamos os admins para investigar. NÃO lançamos erro
      // (causaria retry infinito do MP enquanto o slug não for corrigido).
      const reason = `tenant nao resolvido: slug=${tenantSlug ?? "(pmb)"}`
      await markLog(logId, false, reason)
      contextLogger().error(
        { event: "mp.process.tenant_unresolved", tenantSlug, paymentId },
        "webhook MP recebido mas tenant nao foi resolvido — pagamento orfao",
      )
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "ERROR",
        title: "Webhook MP sem tenant",
        body: `paymentId=${paymentId} slug=${tenantSlug ?? "(pmb)"} — pagamento aprovado pode estar sem matricula. Verifique WebhookLog ${logId}.`,
        category: "webhook",
        href: "/admin/configuracoes",
      }).catch(swallow("mp.process.notify"))
      return
    }

    // ── Passo 3: validar HMAC com a secret DESTE tenant ─────────────────────
    // Revendedor: secret criptografada no banco (mpWebhookSecret). PMB: valor
    // plain vindo de MP_WEBHOOK_SECRET (já resolvido em buildPmbContext).
    // Defesa em profundidade: mesmo que a secret vaze, o Passo 5 chama
    // getPayment com o access token do tenant — um paymentId que não pertença
    // à conta MP daquele tenant devolve 404, bloqueando cross-tenant.
    const secret = tenant.mpWebhookSecret
      ? tenant.isPmbVitrine
        ? tenant.mpWebhookSecret
        : decrypt(tenant.mpWebhookSecret)
      : null

    if (!secret) {
      // Sem secret configurada não há como provar autenticidade. Em dev, a flag
      // MP_WEBHOOK_DEV_BYPASS=1 (nunca em produção) pula a validação p/ ngrok.
      const explicitBypass =
        process.env.MP_WEBHOOK_DEV_BYPASS === "1" &&
        process.env.NODE_ENV !== "production"
      if (!explicitBypass) {
        const reason = tenant.isPmbVitrine
          ? "MP_WEBHOOK_SECRET (PMB) ausente — request rejeitado"
          : "tenant sem mpWebhookSecret — configure a assinatura secreta no painel"
        await markLog(logId, false, reason)
        contextLogger().error(
          { event: "mp.process.secret_missing", tenantSlug, paymentId, tenantId: tenant.id },
          "webhook MP sem secret de validação — fulfillment automático bloqueado",
        )
        // Não derruba a venda: o aluno pode reconciliar via "já paguei" e o
        // admin via sync-payment. Avisa quem pode resolver (a unidade).
        if (tenant.isPmbVitrine) {
          await createNotification({
            audience: "ROLE",
            roleTarget: "SUPER_ADMIN",
            level: "ERROR",
            title: "MP_WEBHOOK_SECRET (PMB) ausente",
            body: `paymentId=${paymentId} — configure MP_WEBHOOK_SECRET no Vercel. Venda pode ficar sem matrícula automática.`,
            category: "webhook",
            href: "/admin/configuracoes",
          }).catch(swallow("mp.process.notify"))
        } else {
          await createNotification({
            audience: "TENANT",
            tenantId: tenant.id,
            level: "ERROR",
            title: "Assinatura secreta do Mercado Pago ausente",
            body: "Recebemos um pagamento mas a matrícula automática está bloqueada: cadastre a assinatura secreta do webhook em Configurações → Pagamentos.",
            category: "payment",
            href: "/painel/configuracoes",
          }).catch(swallow("mp.process.notify"))
        }
        return
      }
      contextLogger().warn(
        { event: "mp.webhook.dev_bypass_active" },
        "MP_WEBHOOK_DEV_BYPASS ativo — validação de HMAC pulada (apenas dev)",
      )
    } else {
      const valid = validateMpWebhookSignature(
        xSignature,
        xRequestId,
        dataId ?? paymentId,
        secret,
      )
      if (!valid) {
        await markLog(logId, false, "hmac invalid")
        return
      }
    }

    // ── Passo 4: associar o log ao tenant ───────────────────────────────────
    if (!tenant.isPmbVitrine) {
      await prisma.webhookLog
        .update({ where: { id: logId }, data: { tenantId: tenant.id } })
        .catch(swallow("mp.process"))
    }

    // ── Passo 5: buscar o payment no MP com o token do tenant ───────────────
    const accessToken = tenant.isPmbVitrine
      ? tenant.mpAccessToken
      : decryptTenantMpToken(tenant.mpAccessToken)

    // subscription_authorized_payment: o dataId é o id do AUTHORIZED PAYMENT (sub-
    // recurso da preapproval), NÃO de um payment. Resolve o payment_id real com o
    // TOKEN DESTE tenant — antes a rota tentava com o token PMB (e num branch
    // inalcançável), então getPayment tomava 404 e a cobrança recorrente (assinatura
    // MP da revenda/PMB) nunca efetivava via webhook. A idempotência final é por
    // mpPaymentId no fulfill + advisory lock, então reentregas são seguras.
    let effectivePaymentId = paymentId
    if (
      topic === "subscription_authorized_payment" ||
      topic.includes("subscription_authorized_payment")
    ) {
      const ap = await getAuthorizedPayment(accessToken, dataId ?? paymentId)
      if (!ap.payment_id) {
        await markLog(logId, true, `authorized_payment ${dataId ?? paymentId} ainda sem payment_id`)
        return
      }
      effectivePaymentId = String(ap.payment_id)
    }

    const payment = await getPayment(accessToken, effectivePaymentId)

    // ── Parcela de carnê (parc_<id>): roteia pela linha da parcela ──────────
    if (payment.external_reference?.startsWith("parc_")) {
      await handleInstallmentMpPayment(tenant, payment, logId)
      return
    }

    // ── Assinatura de aluno (pmb_sub_<id>) ─────────────────────────────────
    // Roteada ANTES de `resolveEnrollmentId`: uma assinatura não tem matrícula
    // própria (as matrículas nascem sob demanda, uma por curso aberto), então
    // cairia em "enrollment nao encontrado" e o ciclo nunca renovaria.
    if (payment.external_reference?.startsWith("pmb_sub_")) {
      const subscriptionId = payment.external_reference.slice("pmb_sub_".length)
      const sub = await prisma.studentSubscription.findUnique({
        where: { id: subscriptionId },
        select: { id: true },
      })
      if (!sub) {
        await markLog(logId, true, `assinatura ${subscriptionId} nao encontrada`)
        return
      }

      if (payment.status === "approved") {
        const { settled } = await settleSubscriptionCycle(sub.id, {
          gateway: "MP",
          externalPaymentId: String(payment.id),
          amount: payment.transaction_amount,
          paidAt: payment.date_approved
            ? new Date(payment.date_approved)
            : new Date(),
          dueDate: new Date(),
          billingType: payment.payment_type_id,
        })
        await markLog(
          logId,
          true,
          settled
            ? `assinatura ${sub.id}: ciclo liquidado`
            : `assinatura ${sub.id}: ciclo ja registrado`,
        )
        return
      }

      if (
        payment.status === "refunded" ||
        payment.status === "charged_back" ||
        payment.status === "cancelled"
      ) {
        await revokeSubscriptionForRefund(sub.id)
        await markLog(logId, true, `assinatura ${sub.id}: ${payment.status}`)
        return
      }

      if (payment.status === "rejected") {
        // Cartão recusado na renovação: marca em atraso e deixa a carência
        // correr. Cortar aqui apagaria o progresso de quem só trocou de cartão.
        await markSubscriptionPastDue(sub.id)
        await markLog(logId, true, `assinatura ${sub.id}: cobranca recusada`)
        return
      }

      await markLog(logId, true, `assinatura ${sub.id}: status=${payment.status}`)
      return
    }

    // ── Passo 5: resolver o enrollmentId pelo external_reference ────────────
    const enrollmentId = await resolveEnrollmentId(tenant, payment)

    if (!enrollmentId) {
      await markLog(
        logId,
        true,
        `enrollment nao encontrado para external_reference=${payment.external_reference ?? "null"}`,
      )
      return
    }

    // ── Passo 6: rotear conforme status ─────────────────────────────────────
    if (payment.status === "approved") {
      await fulfillFromMp(tenant, enrollmentId, payment)
      await markLog(logId, true)
      return
    }

    if (payment.status in MP_TO_PAYMENT_STATUS) {
      await revokeEnrollmentFromMp(tenant, enrollmentId, payment)
      await markLog(logId, true, `revoked: status=${payment.status}`)
      return
    }

    if (payment.status === "rejected") {
      // Recusa (cartão recusado etc.): avisa o aluno para tentar de novo.
      notifyStudentPaymentRejected(tenant, enrollmentId, payment)
      await markLog(logId, true, `rejected: aviso enviado`)
      return
    }

    if (payment.status === "pending" || payment.status === "in_process") {
      // Aguardando boleto/Pix: envia instruções de conclusão (idempotente).
      notifyStudentPaymentPending(tenant, enrollmentId, payment)
      await markLog(logId, true, `pending: status=${payment.status}`)
      return
    }

    // Outros status (authorized, in_mediation, etc.) são apenas registrados.
    await markLog(logId, true, `status=${payment.status} ignorado`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    contextLogger().error(
      { err: error, event: "mp.process.failed", webhookLogId: logId },
      "webhook MP processing failed",
    )
    await markLog(logId, false, message)
    // Erros transitórios (MP 5xx/rede, deadlock/timeout de DB, plataforma 5xx)
    // são RELANÇADOS para a rota responder 500 e o MP REENTREGAR — o fulfillment
    // é idempotente (mpPaymentId + advisory lock). Sem isto, uma falha passageira
    // deixava a venda PENDING sem retry automático (aluno pagava e não era
    // matriculado até reconciliação manual). Erros terminais continuam engolidos:
    // já há early-return para hmac inválido / tenant não resolvido / secret
    // ausente / enrollment não encontrado, e 4xx de negócio não se beneficiam de
    // retry — ficam visíveis no WebhookLog (processed=false) + reconcile.
    if (isTransientWebhookError(error)) throw error
  }
}

export type ReconcileResult =
  /** Pagamento aprovado no gateway — matrícula efetivada (ou já estava). */
  | { status: "confirmed" }
  /** Sem pagamento aprovado no gateway ainda — pedir para aguardar. */
  | { status: "pending" }
  /** Não há como verificar automaticamente (ex: gateway Asaas, sem referência). */
  | { status: "unsupported" }

/**
 * Reconciliação sob demanda disparada pelo aluno ("Já fiz o pagamento").
 *
 * Consulta o gateway da matrícula (Mercado Pago OU Asaas) e, se houver um
 * pagamento aprovado/confirmado, roda o mesmo `fulfillEnrollment` do webhook
 * (idempotente — se já foi processado, é no-op). Serve de rede de segurança
 * quando o webhook atrasa ou não chega. Espelha a verificação ativa que o
 * admin já faz em /api/admin/vendas/[id]/sync-payment.
 *
 * NÃO confia em input do aluno: só efetiva se o GATEWAY confirmar o pagamento.
 */
export async function reconcilePendingEnrollment(
  enrollmentId: string,
): Promise<ReconcileResult> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      tenantId: true,
      gateway: true,
      paymentType: true,
      externalReference: true,
      asaasPaymentId: true,
      asaasSubscriptionId: true,
    },
  })
  if (!enrollment) return { status: "unsupported" }

  // Já liberado (webhook chegou antes, ou clique duplo) — devolve confirmado.
  if (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") {
    return { status: "confirmed" }
  }

  // ── Asaas ──────────────────────────────────────────────────────────────
  // A conta Asaas depende do DONO do gateway: vitrine PMB (tenantId=null) usa a
  // chave global; venda de revenda usa a conta PRÓPRIA da unidade. Ids do Asaas
  // sao por-conta — consultar a venda da revenda com a chave global devolve 404
  // e mata este backstop. Buscamos pelo paymentId direto ou pela 1ª cobranca da
  // assinatura (cobre o mensal da revenda, que so efetiva via webhook).
  if (enrollment.gateway === "ASAAS") {
    const isPmb = enrollment.tenantId === null

    // Contexto de fulfillment da venda Asaas. NÃO usa `resolveTenantById`: aquele
    // resolvedor é do fluxo do Mercado Pago e devolve `null` quando a unidade não
    // tem `mpAccessToken` — o que fazia TODA venda de uma unidade Asaas-only
    // (ceipro, n1, umnovohorizonte hoje) responder "unsupported" sem sequer
    // consultar o Asaas. Era o motivo de o "verificar pagamento"/"já fiz o
    // pagamento" nunca destravar uma cobrança dessas unidades. Aqui pedimos
    // apenas o que o fulfill precisa; a credencial do Asaas vem logo abaixo.
    let ctx: {
      id: string
      slug: string
      name: string
      plataformaVendedorId: string | null
      isPmbVitrine: boolean
    } | null = null

    // Chave da conta Asaas a usar nas consultas: undefined = global PMB; para
    // revenda, descriptografa a chave da unidade. Sem chave conectada não há
    // como reconciliar — pede para aguardar (o webhook ainda pode chegar).
    let asaasApiKey: string | undefined

    if (isPmb) {
      ctx = {
        id: "__pmb__",
        slug: pmbPlataformaPolo(),
        name: "Profissionaliza Mais Brasil",
        plataformaVendedorId: pmbPlataformaVendedorId(),
        isPmbVitrine: true,
      }
    } else {
      const merchant = await prisma.tenant.findUnique({
        where: { id: enrollment.tenantId! },
        select: {
          id: true,
          slug: true,
          name: true,
          plataformaVendedorId: true,
          asaasApiKey: true,
        },
      })
      if (!merchant) return { status: "unsupported" }
      if (!merchant.asaasApiKey) return { status: "pending" }
      asaasApiKey = decryptTenantAsaasKey(merchant.asaasApiKey)
      ctx = {
        id: merchant.id,
        slug: merchant.slug,
        name: merchant.name,
        plataformaVendedorId: merchant.plataformaVendedorId,
        isPmbVitrine: false,
      }
    }

    let asaasPaymentId = enrollment.asaasPaymentId
    let asaasStatus: string | null = null
    let asaasValue = 0
    let asaasPaymentDate: string | null = null

    if (asaasPaymentId) {
      const payment = await getAsaasPayment(asaasPaymentId, asaasApiKey)
      asaasStatus = payment.status
      asaasValue = payment.value
      asaasPaymentDate = payment.paymentDate ?? null
    } else if (enrollment.asaasSubscriptionId) {
      const list = await listAsaasPayments({
        subscription: enrollment.asaasSubscriptionId,
        limit: 1,
        offset: 0,
      }, asaasApiKey)
      const first = list.data?.[0]
      if (first) {
        asaasPaymentId = first.id
        asaasStatus = first.status
        asaasValue = first.value
        asaasPaymentDate = first.paymentDate ?? null
      }
    }

    // Sem cobrança localizável ou ainda não confirmada → pedir para aguardar.
    if (!asaasPaymentId || !asaasStatus) return { status: "pending" }
    if (asaasStatus !== "RECEIVED" && asaasStatus !== "CONFIRMED") {
      return { status: "pending" }
    }

    await fulfillEnrollment(
      {
        id: ctx.id,
        slug: ctx.slug,
        name: ctx.name,
        plataformaVendedorId: ctx.plataformaVendedorId,
        isPmbVitrine: ctx.isPmbVitrine,
      },
      enrollment.id,
      {
        gateway: "ASAAS",
        externalPaymentId: asaasPaymentId,
        amount: asaasValue,
        paidAt: asaasPaymentDate ? new Date(asaasPaymentDate) : new Date(),
        paymentType: enrollment.paymentType,
      },
    )
    return { status: "confirmed" }
  }

  // ── Mercado Pago ─────────────────────────────────────────────────────────
  if (enrollment.gateway === "MP") {
    if (!enrollment.externalReference) return { status: "unsupported" }

    const tenant =
      enrollment.tenantId === null
        ? await buildPmbContext()
        : await resolveTenantById(enrollment.tenantId)
    if (!tenant || !tenant.mpAccessToken) return { status: "unsupported" }

    const accessToken = tenant.isPmbVitrine
      ? tenant.mpAccessToken
      : decryptTenantMpToken(tenant.mpAccessToken)

    const { results } = await searchPayments(accessToken, {
      external_reference: enrollment.externalReference,
    })
    const approved = results.find((p) => p.status === "approved")
    if (!approved) return { status: "pending" }

    await fulfillFromMp(tenant, enrollment.id, approved)
    return { status: "confirmed" }
  }

  return { status: "unsupported" }
}
