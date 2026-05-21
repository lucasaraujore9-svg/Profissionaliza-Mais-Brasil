import { prisma } from "@/lib/prisma"
import { decryptTenantMpToken, getPayment } from "./client"
import { validateMpWebhookSignature } from "./webhook"
import type { MPPayment } from "./types"
import { pmbPlataformaPolo, pmbPlataformaVendedorId, pmbMpAccessToken } from "@/lib/pmb-config"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"

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
    .catch(() => undefined)
}

interface TenantContext {
  id: string
  name: string
  slug: string
  plataformaVendedorId: string | null
  mpAccessToken: string | null
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
    primaryColor: "#00a862",
    isPmbVitrine: true,
  }
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
}

export async function processMpWebhook(args: ProcessArgs): Promise<void> {
  const { logId, paymentId, xSignature, xRequestId, dataId, tenantSlug } = args

  try {
    // Idempotência: se já processamos este payment, ignora
    const alreadyPaid = await prisma.payment.findUnique({
      where: { mpPaymentId: paymentId },
      select: { id: true },
    })
    if (alreadyPaid) {
      await markLog(logId, true, "payment ja processado")
      return
    }

    // ── Passo 1: resolver o tenant ──────────────────────────────────────────
    // A notification_url inclui ?tenant=<slug> para vendas de revendedores,
    // e não inclui para a vitrine PMB. Isso elimina a ambiguidade de qual
    // conta MP pertence o pagamento.
    let tenant: TenantContext | null = null

    if (tenantSlug) {
      tenant = await resolveTenantBySlug(tenantSlug)
    } else {
      // Sem slug = vitrine PMB
      tenant = await buildPmbContext()
    }

    if (!tenant || !tenant.mpAccessToken) {
      await markLog(
        logId,
        true,
        `tenant nao resolvido: slug=${tenantSlug ?? "(pmb)"}`,
      )
      return
    }

    // ── Passo 2: associar o log ao tenant ───────────────────────────────────
    if (!tenant.isPmbVitrine) {
      await prisma.webhookLog
        .update({ where: { id: logId }, data: { tenantId: tenant.id } })
        .catch(() => undefined)
    }

    // ── Passo 3: validar assinatura HMAC ────────────────────────────────────
    // Em produção exige MP_WEBHOOK_SECRET configurado e assinatura válida.
    // Sem isso qualquer um poderia disparar fulfillment forjando webhooks.
    const secret = process.env.MP_WEBHOOK_SECRET
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        await markLog(logId, false, "MP_WEBHOOK_SECRET ausente em produção")
        return
      }
      // Dev: segue sem validar para permitir testes com ngrok.
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

    // ── Passo 4: buscar o payment no MP com o token do tenant ───────────────
    const accessToken = tenant.isPmbVitrine
      ? tenant.mpAccessToken
      : decryptTenantMpToken(tenant.mpAccessToken)

    const payment = await getPayment(accessToken, paymentId)

    if (payment.status !== "approved") {
      await markLog(logId, true, `status=${payment.status} ignorado`)
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

    // ── Passo 6: fulfillment ────────────────────────────────────────────────
    await fulfillFromMp(tenant, enrollmentId, payment)
    await markLog(logId, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    console.error(`[mp] webhook processing failed (${logId}):`, error)
    await markLog(logId, false, message)
  }
}
