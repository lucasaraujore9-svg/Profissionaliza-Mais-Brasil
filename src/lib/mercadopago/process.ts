import { prisma } from "@/lib/prisma"
import { decryptTenantMpToken, getPayment } from "./client"
import { validateMpWebhookSignature } from "./webhook"
import type { MPPayment } from "./types"
import { pmbEaPolo, pmbEaVendedorId, pmbMpAccessToken } from "@/lib/pmb-config"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"

interface ProcessArgs {
  logId: string
  paymentId: string
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
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
  eaVendedorId: string | null
  mpAccessToken: string | null
  primaryColor: string
  isPmbVitrine?: boolean
}

async function pmbContext(): Promise<TenantContext | null> {
  const token = await pmbMpAccessToken()
  if (!token) return null
  return {
    id: "__pmb__",
    name: "PMB Vitrine",
    slug: pmbEaPolo(),
    eaVendedorId: pmbEaVendedorId(),
    mpAccessToken: token, // ja plain (nao criptografado)
    primaryColor: "#00a862",
    isPmbVitrine: true,
  }
}

async function resolveTenantFromReference(
  externalReference: string | null,
): Promise<{ tenant: TenantContext; enrollmentId: string | null } | null> {
  if (!externalReference) return null

  const enrollment = await prisma.enrollment.findFirst({
    where: { externalReference },
    select: {
      id: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          eaVendedorId: true,
          mpAccessToken: true,
          primaryColor: true,
        },
      },
    },
  })
  if (enrollment) {
    if (enrollment.tenant) {
      return { tenant: enrollment.tenant, enrollmentId: enrollment.id }
    }
    if (enrollment.tenantId === null) {
      const pmb = await pmbContext()
      if (pmb) return { tenant: pmb, enrollmentId: enrollment.id }
    }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: externalReference },
    select: {
      id: true,
      name: true,
      slug: true,
      eaVendedorId: true,
      mpAccessToken: true,
      primaryColor: true,
    },
  })
  if (tenant) return { tenant, enrollmentId: null }

  return null
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
      eaVendedorId: tenant.eaVendedorId,
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
  const { logId, paymentId, xSignature, xRequestId, dataId } = args

  try {
    const mpPayment = await prisma.payment.findUnique({
      where: { mpPaymentId: paymentId },
      select: { id: true },
    })

    let tenant: TenantContext | null = null
    let enrollmentId: string | null = null
    let externalReference: string | null = null
    let payment: MPPayment | null = null

    if (!mpPayment) {
      const pending = await prisma.enrollment.findFirst({
        where: { mpPaymentId: paymentId },
        select: {
          id: true,
          tenantId: true,
          externalReference: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              eaVendedorId: true,
              mpAccessToken: true,
              primaryColor: true,
            },
          },
        },
      })
      if (pending) {
        if (pending.tenant) {
          tenant = pending.tenant
        } else if (pending.tenantId === null) {
          tenant = await pmbContext()
        }
        enrollmentId = pending.id
        externalReference = pending.externalReference
      }
    }

    if (!tenant) {
      const mpQuery = dataId ?? paymentId
      const candidates = await prisma.enrollment.findMany({
        where: { externalReference: { not: null } },
        select: { externalReference: true },
        distinct: ["externalReference"],
        take: 1000,
      })

      for (const cand of candidates) {
        if (cand.externalReference && mpQuery.includes(cand.externalReference)) {
          externalReference = cand.externalReference
          break
        }
      }
    }

    if (!tenant && externalReference) {
      const resolved = await resolveTenantFromReference(externalReference)
      if (resolved) {
        tenant = resolved.tenant
        enrollmentId = resolved.enrollmentId
      }
    }

    if (!tenant || !tenant.mpAccessToken) {
      await markLog(
        logId,
        true,
        `tenant nao resolvido para payment ${paymentId}`,
      )
      return
    }

    if (!tenant.isPmbVitrine) {
      await prisma.webhookLog
        .update({
          where: { id: logId },
          data: { tenantId: tenant.id },
        })
        .catch(() => undefined)
    }

    const accessToken = tenant.isPmbVitrine
      ? tenant.mpAccessToken
      : decryptTenantMpToken(tenant.mpAccessToken)

    const secret = process.env.MP_WEBHOOK_SECRET
    if (secret) {
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

    payment = await getPayment(accessToken, paymentId)

    if (payment.status !== "approved") {
      await markLog(logId, true, `status=${payment.status} ignorado`)
      return
    }

    if (!enrollmentId && payment.external_reference) {
      const resolved = await resolveTenantFromReference(payment.external_reference)
      if (resolved?.enrollmentId) enrollmentId = resolved.enrollmentId
    }

    if (!enrollmentId) {
      await markLog(logId, true, "enrollment nao encontrado para fulfill")
      return
    }

    await fulfillFromMp(tenant, enrollmentId, payment)
    await markLog(logId, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    console.error(`[mp] webhook processing failed (${logId}):`, error)
    await markLog(logId, false, message)
  }
}
