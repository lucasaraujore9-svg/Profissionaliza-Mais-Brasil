// Emails transacionais ao ALUNO para estados de pagamento que NÃO passam pelo
// sistema de notificações in-app: pagamento aguardando (boleto/Pix) e recusado.
//
// Disparados a partir do webhook MP (`process.ts`). Tudo roda em background
// (`afterResponse`) e é best-effort — nunca bloqueia nem derruba o webhook.
// Idempotência via EmailLog (o webhook MP re-entrega): não reenviamos o mesmo
// tipo de email ao mesmo destinatário dentro de uma janela curta.

import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/mailer"
import {
  PMB_EMAIL_BRAND,
  emailFromForBrand,
  type EmailBrand,
} from "@/lib/email/brand"
import { loadTenantEmailBrand } from "@/lib/email/tenant-brand"
import { afterResponse } from "@/lib/after-response"
import { contextLogger } from "@/lib/logger"
import type { MPPayment } from "./types"

interface TenantLike {
  id: string
  isPmbVitrine?: boolean
}

const DEDUPE_WINDOW_DAYS = 7

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

function formatBrDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

function methodLabel(payment: MPPayment): string {
  if (payment.payment_type_id === "ticket") return "boleto"
  if (
    payment.payment_type_id === "bank_transfer" ||
    payment.payment_method_id === "pix"
  ) {
    return "Pix"
  }
  return "pagamento"
}

/** Motivo amigável a partir do status_detail do MP (recusa de cartão). */
function rejectionReason(detail: string | undefined): string | null {
  if (!detail) return null
  if (detail.includes("insufficient")) return "não havia limite/saldo suficiente"
  if (detail.includes("bad_filled")) return "os dados do cartão não conferem"
  if (detail.includes("call_for_authorize")) return "o banco pediu autorização"
  if (detail.includes("high_risk")) return "o pagamento não passou na análise"
  return null
}

/**
 * True se já enviamos ESTE email (mesmo destinatário + template + assunto) na
 * janela de dedupe. O `subject` carrega o nome do item (curso/pacote), então a
 * chave distingue compras diferentes: ela suprime a RE-ENTREGA do mesmo webhook
 * MP, mas não bloqueia o aviso de uma 2a compra de outro item dentro da janela.
 */
async function alreadySent(
  to: string,
  template: string,
  subject: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000)
    const existing = await prisma.emailLog.findFirst({
      where: { to, template, subject, status: "SENT", createdAt: { gte: since } },
      select: { id: true },
    })
    return existing !== null
  } catch {
    // Falha na checagem de dedupe não deve impedir o envio.
    return false
  }
}

async function loadContext(enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      tenantId: true,
      student: { select: { nome: true, email: true } },
      course: { select: { nome: true } },
      coursePackage: { select: { name: true } },
    },
  })
  if (!enrollment?.student.email) return null
  return {
    studentName: enrollment.student.nome,
    studentEmail: enrollment.student.email,
    itemName: enrollment.coursePackage
      ? `pacote ${enrollment.coursePackage.name}`
      : enrollment.course.nome,
    tenantId: enrollment.tenantId,
  }
}

async function brandFor(
  tenant: TenantLike,
  tenantId: string | null,
): Promise<EmailBrand> {
  if (tenant.isPmbVitrine || !tenantId) return PMB_EMAIL_BRAND
  return loadTenantEmailBrand(tenantId)
}

/** Pagamento aguardando confirmação (boleto/Pix) — convida a concluir. */
export function notifyStudentPaymentPending(
  tenant: TenantLike,
  enrollmentId: string,
  payment: MPPayment,
): void {
  // Só faz sentido para boleto/Pix (aguardam ação). Pendência de cartão é
  // transitória e some em segundos — não vale email.
  const isBoletoOrPix =
    payment.payment_type_id === "ticket" ||
    payment.payment_type_id === "bank_transfer" ||
    payment.payment_method_id === "pix"
  if (!isBoletoOrPix) return

  afterResponse(async () => {
    try {
      const ctx = await loadContext(enrollmentId)
      if (!ctx) return
      const subject = `Falta pouco para garantir ${ctx.itemName}`
      if (await alreadySent(ctx.studentEmail, "payment-pending", subject)) return

      const brand = await brandFor(tenant, ctx.tenantId)
      const paymentUrl =
        payment.point_of_interaction?.transaction_data?.ticket_url ??
        payment.transaction_details?.external_resource_url ??
        null

      await sendEmail({
        to: ctx.studentEmail,
        from: emailFromForBrand(brand),
        replyTo: brand.replyTo ?? undefined,
        tenantId: ctx.tenantId,
        subject,
        template: {
          type: "payment-pending",
          props: {
            studentName: ctx.studentName,
            courseName: ctx.itemName,
            amount: formatBRL(payment.transaction_amount),
            methodLabel: methodLabel(payment),
            paymentUrl,
            dueDate: formatBrDate(payment.date_of_expiration),
            brand,
          },
        },
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "mp.payment_pending_email_failed", enrollmentId },
        "email de pagamento pendente falhou",
      )
    }
  })
}

/** Pagamento recusado/expirado — convida a tentar novamente. */
export function notifyStudentPaymentRejected(
  tenant: TenantLike,
  enrollmentId: string,
  payment: MPPayment,
): void {
  afterResponse(async () => {
    try {
      const ctx = await loadContext(enrollmentId)
      if (!ctx) return
      const subject = `Não conseguimos confirmar seu pagamento de ${ctx.itemName}`
      if (await alreadySent(ctx.studentEmail, "payment-rejected", subject)) return

      const brand = await brandFor(tenant, ctx.tenantId)
      // Retry aponta para a vitrine da unidade (ou app PMB) — o aluno refaz a
      // compra a partir de lá. Mantém o white-label.
      const retryUrl = brand.siteUrl ?? null

      await sendEmail({
        to: ctx.studentEmail,
        from: emailFromForBrand(brand),
        replyTo: brand.replyTo ?? undefined,
        tenantId: ctx.tenantId,
        subject,
        template: {
          type: "payment-rejected",
          props: {
            studentName: ctx.studentName,
            courseName: ctx.itemName,
            retryUrl,
            reason: rejectionReason(payment.status_detail),
            brand,
          },
        },
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "mp.payment_rejected_email_failed", enrollmentId },
        "email de pagamento recusado falhou",
      )
    }
  })
}
