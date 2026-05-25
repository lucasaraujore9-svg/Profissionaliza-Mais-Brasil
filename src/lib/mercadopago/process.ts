import { prisma } from "@/lib/prisma"
import { decryptTenantMpToken, getPayment } from "./client"
import { validateMpWebhookSignature } from "./webhook"
import type { MPPayment } from "./types"
import { pmbPlataformaPolo, pmbPlataformaVendedorId, pmbMpAccessToken } from "@/lib/pmb-config"
import { fulfillEnrollment } from "@/lib/enrollment/fulfill"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"

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

    // ── Passo 2: validar HMAC ANTES de tocar em qualquer tenant ────────────
    // Usamos um secret global (MP_WEBHOOK_SECRET) porque o Mercado Pago não
    // permite secret por tenant via API de Preference — todos os webhooks
    // chegam aqui e provam autenticidade com o mesmo secret. Defesa em
    // profundidade contra vazamento do secret:
    //  - Passo 5 chama getPayment(tenant.mpAccessToken, paymentId): se o
    //    paymentId não pertencer à conta MP do tenant resolvido, a API
    //    devolve 404. Atacante que vaze o secret não consegue cross-tenant
    //    sem também ter o access token do tenant.
    //  - tenantSlug é sanitizado em /api/webhooks/mercadopago/route.ts
    //    (regex /^[a-z0-9_-]{1,64}$/i) — não há log/SQL injection.
    const secret = process.env.MP_WEBHOOK_SECRET
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        await markLog(logId, false, "MP_WEBHOOK_SECRET ausente em producao")
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

    // ── Passo 3: resolver o tenant ──────────────────────────────────────────
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
