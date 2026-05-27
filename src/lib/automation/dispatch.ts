import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { AutomationTemplateKey } from "@prisma/client"
import { renderTemplate } from "./templates"
import { sendTextMessage } from "./wa-client"
import { rateLimitByKey, RATE_LIMITS } from "@/lib/ratelimit"

interface QueueLeadMessageArgs {
  leadId: string
  templateKey: AutomationTemplateKey
}

/**
 * Enfileira disparo de WhatsApp para um lead. Fire-and-forget: a request
 * que chama retorna antes do envio completar. Em Vercel Functions, o
 * runtime aguarda alguns ms a mais antes de encerrar — suficiente pro
 * engine local (200-500ms).
 *
 * Falhas sao logadas e gravam StudentLeadActivity{kind:WA_MESSAGE_FAILED}
 * para auditoria; nao propagam erro para o caller.
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

/**
 * Envia a mensagem agora (await). Usado por `queueLeadMessage` e por
 * caminhos que precisam aguardar (ex: testes).
 */
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
      tenant: {
        select: {
          name: true,
          slug: true,
          automationEnabled: true,
          waSessionName: true,
          waStatus: true,
        },
      },
    },
  })

  if (!lead) return

  if (!lead.tenant.automationEnabled) {
    await recordFailure(leadId, templateKey, "automation_disabled")
    return
  }
  if (lead.tenant.waStatus !== "WORKING" || !lead.tenant.waSessionName) {
    await recordFailure(leadId, templateKey, "wa_not_connected")
    return
  }

  const template = await prisma.automationMessageTemplate.findUnique({
    where: { tenantId_key: { tenantId: lead.tenantId, key: templateKey } },
    select: { body: true, enabled: true },
  })

  if (!template || !template.enabled) {
    await recordFailure(leadId, templateKey, "template_missing_or_disabled")
    return
  }

  const courseLink = lead.course?.slug
    ? `https://${lead.tenant.slug}.livrecursos.com.br/curso/${lead.course.slug}`
    : null

  const body = renderTemplate(template.body, {
    aluno_nome: lead.nome,
    curso: lead.courseSnapshot ?? "seu curso de interesse",
    escola: lead.tenant.name,
    link_curso: courseLink ?? "",
    valor: "",
  })

  const sessionRl = await rateLimitByKey(
    lead.tenant.waSessionName,
    RATE_LIMITS.waSend,
  )
  if (!sessionRl.ok) {
    await recordFailure(leadId, templateKey, "rate_limited")
    return
  }

  try {
    const result = await sendTextMessage({
      sessionName: lead.tenant.waSessionName,
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

async function recordFailure(
  leadId: string,
  templateKey: AutomationTemplateKey,
  reason: string,
): Promise<void> {
  await prisma.studentLeadActivity
    .create({
      data: {
        leadId,
        kind: "WA_MESSAGE_FAILED",
        body: reason,
        metadata: { templateKey, reason },
      },
    })
    .catch(() => {
      // Logger ja registrou; falha aqui nao deve propagar.
    })
}
