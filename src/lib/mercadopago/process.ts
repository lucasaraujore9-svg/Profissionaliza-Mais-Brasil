import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { decryptTenantMpToken, getPayment, searchPayments } from "./client"
import {
  getPayment as getAsaasPayment,
  listPayments as listAsaasPayments,
} from "@/lib/asaas/client"
import { validateMpWebhookSignature } from "./webhook"
import type { MPPayment } from "./types"
import { pmbPlataformaPolo, pmbPlataformaVendedorId, pmbMpAccessToken } from "@/lib/pmb-config"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { markLeadAsWon } from "@/lib/automation/leads"

interface ProcessArgs {
  logId: string
  paymentId: string
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
  tenantSlug: string | null
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

async function fulfillFromMp(
  tenant: TenantContext,
  enrollmentId: string,
  payment: MPPayment,
): Promise<void> {
  await fulfillEnrollment(
    {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plataformaVendedorId: tenant.plataformaVendedorId,
      isPmbVitrine: tenant.isPmbVitrine,
    },
    enrollmentId,
    {
      gateway: "MP",
      externalPaymentId: String(payment.id),
      amount: payment.transaction_amount,
      paidAt: payment.date_approved
        ? new Date(payment.date_approved)
        : new Date(),
      mpPaymentType: payment.payment_type_id,
      mpStatusDetail: payment.status_detail,
    },
  )

  // Modulo Automacao: move StudentLead vinculado para WON e dispara o
  // template PURCHASE_CONFIRMED. Silencioso quando nao ha lead.
  // PMB usa tenantId=null; revendedor usa tenant.id.
  await markLeadAsWon({
    enrollmentId,
    tenantId: tenant.isPmbVitrine ? null : tenant.id,
    amount: payment.transaction_amount,
  }).catch(swallow("mp.process.lead_won"))
}

export async function processMpWebhook(args: ProcessArgs): Promise<void> {
  const { logId, paymentId, xSignature, xRequestId, dataId, tenantSlug } = args

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
        href: "/admin/webhooks",
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

    if (secret) {
      // A unidade cadastrou a assinatura secreta → validamos o HMAC (camada
      // extra). Assinatura inválida = request descartado.
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
    } else {
      // Sem assinatura secreta. Muitas aplicações MP não expõem a seção de
      // Webhooks (logo não há como o revendedor obter a secret). NÃO bloqueamos:
      // a autenticidade é garantida no Passo 5 — getPayment usa o access token
      // DESTE tenant; um paymentId que não pertença à conta MP dele retorna 404
      // e nada é matriculado. É a validação que o próprio MP recomenda
      // (reconsultar o recurso na API). O HMAC volta a valer automaticamente se
      // a unidade cadastrar a assinatura secreta no futuro.
      contextLogger().warn(
        {
          event: "mp.process.no_secret_api_fallback",
          tenantSlug,
          paymentId,
          tenantId: tenant.id,
          isPmb: tenant.isPmbVitrine ?? false,
        },
        "webhook MP sem assinatura secreta — validando via consulta à API do MP",
      )
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

    const payment = await getPayment(accessToken, paymentId)

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

    // Outros status (pending, in_process, authorized, etc.) são apenas registrados.
    await markLog(logId, true, `status=${payment.status} ignorado`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    contextLogger().error(
      { err: error, event: "mp.process.failed", webhookLogId: logId },
      "webhook MP processing failed",
    )
    await markLog(logId, false, message)
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
  // Key global; vendas via Asaas são da vitrine PMB (tenantId=null). Buscamos
  // pelo paymentId direto ou pela 1ª cobrança da assinatura.
  if (enrollment.gateway === "ASAAS") {
    const ctx =
      enrollment.tenantId === null
        ? {
            id: "__pmb__",
            slug: pmbPlataformaPolo(),
            name: "Profissionaliza Mais Brasil",
            plataformaVendedorId: pmbPlataformaVendedorId(),
            isPmbVitrine: true as const,
          }
        : await resolveTenantById(enrollment.tenantId)
    if (!ctx) return { status: "unsupported" }

    let asaasPaymentId = enrollment.asaasPaymentId
    let asaasStatus: string | null = null
    let asaasValue = 0
    let asaasPaymentDate: string | null = null

    if (asaasPaymentId) {
      const payment = await getAsaasPayment(asaasPaymentId)
      asaasStatus = payment.status
      asaasValue = payment.value
      asaasPaymentDate = payment.paymentDate ?? null
    } else if (enrollment.asaasSubscriptionId) {
      const list = await listAsaasPayments({
        subscription: enrollment.asaasSubscriptionId,
        limit: 1,
        offset: 0,
      })
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
