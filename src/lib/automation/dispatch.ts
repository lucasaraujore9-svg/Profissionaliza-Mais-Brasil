import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"
import { AutomationTemplateKey } from "@prisma/client"
import { renderTemplate } from "./templates"
import { sendTextMessage, WhatsAppNumberNotFoundError } from "./wa-client"
import { rateLimitByKey, RATE_LIMITS } from "@/lib/ratelimit"
import { resolveAutomationContext } from "./context"

interface QueueLeadMessageArgs {
  leadId: string
  templateKey: AutomationTemplateKey
}

/**
 * Enfileira disparo de WhatsApp para um lead. Fire-and-forget.
 * Tratado uniformemente para tenant (unidade) e PMB (sistema mae) via
 * AutomationContext.
 */
export async function queueLeadMessage(
  args: QueueLeadMessageArgs,
): Promise<void> {
  try {
    await sendLeadMessage(args)
  } catch (err) {
    contextLogger().error(
      { err, event: "automation.dispatch.unhandled", leadId: args.leadId },
      "Falha nao tratada no envio de mensagem de lead",
    )
  }
}

export async function sendLeadMessage(args: QueueLeadMessageArgs): Promise<void> {
  const { leadId, templateKey } = args
  const lead = await prisma.studentLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      telefone: true,
      courseSnapshot: true,
      courseId: true,
      course: { select: { slug: true } },
    },
  })

  if (!lead) return

  const ctx = await resolveAutomationContext(lead.tenantId)
  if (!ctx) {
    await recordFailure(leadId, templateKey, "context_not_found")
    return
  }

  if (!ctx.enabled) {
    await recordFailure(leadId, templateKey, "automation_disabled")
    return
  }
  if (ctx.waStatus !== "WORKING" || !ctx.waSessionName) {
    await recordFailure(leadId, templateKey, "wa_not_connected")
    return
  }

  // Busca template do contexto (tenantId null = PMB)
  const template = lead.tenantId
    ? await prisma.automationMessageTemplate.findUnique({
        where: { tenantId_key: { tenantId: lead.tenantId, key: templateKey } },
        select: { body: true, enabled: true },
      })
    : await prisma.automationMessageTemplate.findFirst({
        where: { tenantId: null, key: templateKey },
        select: { body: true, enabled: true },
      })

  if (!template || !template.enabled) {
    await recordFailure(leadId, templateKey, "template_missing_or_disabled")
    return
  }

  const courseLink = lead.course?.slug
    ? `https://${ctx.publicHost}/${lead.tenantId === null ? "cursos" : "curso"}/${lead.course.slug}`
    : null

  const body = renderTemplate(template.body, {
    aluno_nome: lead.nome,
    curso: lead.courseSnapshot ?? "seu curso de interesse",
    escola: ctx.displayName,
    link_curso: courseLink ?? "",
    valor: "",
  })

  const sessionRl = await rateLimitByKey(
    ctx.waSessionName,
    RATE_LIMITS.waSend,
  )
  if (!sessionRl.ok) {
    await recordFailure(leadId, templateKey, "rate_limited")
    return
  }

  try {
    const result = await sendTextMessage({
      sessionName: ctx.waSessionName,
      toPhone: lead.telefone,
      body,
    })

    await prisma.studentLeadActivity.create({
      data: {
        leadId,
        kind: "WA_MESSAGE_SENT",
        body,
        metadata: {
          templateKey,
          engineMessageId: result.engineMessageId,
        },
      },
    })
  } catch (err) {
    // Numero sem WhatsApp: caso esperado e legivel, nao um erro de engine.
    if (err instanceof WhatsAppNumberNotFoundError) {
      contextLogger().warn(
        { event: "automation.dispatch.no_whatsapp", leadId, templateKey },
        "Numero do lead nao possui WhatsApp",
      )
      await recordFailure(
        leadId,
        templateKey,
        "no_whatsapp",
        "Número não possui WhatsApp",
      )
      return
    }
    contextLogger().error(
      { err, event: "automation.dispatch.send_failed", leadId, templateKey },
      "Engine WhatsApp rejeitou o envio",
    )
    await recordFailure(
      leadId,
      templateKey,
      err instanceof Error ? err.message : "engine_error",
    )
  }
}

export type ManualSendResult =
  | { ok: true; engineMessageId: string }
  | {
      ok: false
      code: "wa_not_connected" | "no_whatsapp" | "engine_error"
      message: string
    }

/**
 * Envia uma mensagem de texto LIVRE (digitada pelo operador) para o lead.
 * Diferente de `sendLeadMessage`, que renderiza um template. Reutiliza o mesmo
 * fluxo do engine: check-exists → chatId → envio. Distingue o caso "numero sem
 * WhatsApp" (no_whatsapp) para a UI mostrar a mensagem apropriada.
 *
 * Pre-condicao: o caller ja validou que o lead pertence ao seu escopo (tenant
 * ou PMB) — aqui so resolvemos o contexto de automacao a partir do lead.
 */
export async function sendManualWhatsAppToLead(
  leadId: string,
  body: string,
): Promise<ManualSendResult> {
  const lead = await prisma.studentLead.findUnique({
    where: { id: leadId },
    select: { id: true, tenantId: true, telefone: true },
  })
  if (!lead) {
    return { ok: false, code: "engine_error", message: "Lead não encontrado." }
  }

  const ctx = await resolveAutomationContext(lead.tenantId)
  if (!ctx || !ctx.enabled || ctx.waStatus !== "WORKING" || !ctx.waSessionName) {
    return {
      ok: false,
      code: "wa_not_connected",
      message: "WhatsApp não conectado. Conecte em Automação para enviar mensagens.",
    }
  }

  const sessionRl = await rateLimitByKey(ctx.waSessionName, RATE_LIMITS.waSend)
  if (!sessionRl.ok) {
    return {
      ok: false,
      code: "engine_error",
      message: "Muitos envios em sequência. Aguarde um momento e tente de novo.",
    }
  }

  try {
    const result = await sendTextMessage({
      sessionName: ctx.waSessionName,
      toPhone: lead.telefone,
      body,
    })
    await prisma.studentLeadActivity.create({
      data: {
        leadId,
        kind: "WA_MESSAGE_SENT",
        body,
        metadata: { manual: true, engineMessageId: result.engineMessageId },
      },
    })
    return { ok: true, engineMessageId: result.engineMessageId }
  } catch (err) {
    if (err instanceof WhatsAppNumberNotFoundError) {
      contextLogger().warn(
        { event: "automation.dispatch.manual_no_whatsapp", leadId },
        "Envio manual: numero do lead nao possui WhatsApp",
      )
      await prisma.studentLeadActivity
        .create({
          data: {
            leadId,
            kind: "WA_MESSAGE_FAILED",
            body: "Número não possui WhatsApp",
            metadata: { manual: true, reason: "no_whatsapp" },
          },
        })
        .catch(swallow("automation.dispatch.activity_no_whatsapp"))
      return {
        ok: false,
        code: "no_whatsapp",
        message: "Este número não possui conta no WhatsApp.",
      }
    }
    contextLogger().error(
      { err, event: "automation.dispatch.manual_send_failed", leadId },
      "Engine WhatsApp rejeitou o envio manual",
    )
    await prisma.studentLeadActivity
      .create({
        data: {
          leadId,
          kind: "WA_MESSAGE_FAILED",
          body: "Falha ao enviar mensagem",
          metadata: { manual: true, reason: "engine_error" },
        },
      })
      .catch(swallow("automation.dispatch.activity_engine_error"))
    return {
      ok: false,
      code: "engine_error",
      message: "Falha ao enviar a mensagem. Tente novamente.",
    }
  }
}

/**
 * Registra falha de envio no historico do lead. `reason` e o codigo de
 * maquina (metadata); `message` e o texto amigavel mostrado na UI — quando
 * ausente, usa o proprio reason.
 */
async function recordFailure(
  leadId: string,
  templateKey: AutomationTemplateKey,
  reason: string,
  message?: string,
): Promise<void> {
  await prisma.studentLeadActivity
    .create({
      data: {
        leadId,
        kind: "WA_MESSAGE_FAILED",
        body: message ?? reason,
        metadata: { templateKey, reason },
      },
    })
    .catch(() => {
      // Logger ja registrou; falha aqui nao deve propagar.
    })
}
