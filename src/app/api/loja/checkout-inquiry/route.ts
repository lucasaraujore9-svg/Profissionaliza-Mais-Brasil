import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { rateLimit, rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { resolveTenantFromRequest } from "@/lib/tenant/from-request"
import { pickNextLeadOwner } from "@/lib/automation/assign"
import { linkVisitorToLead, readVisitorId } from "@/lib/automation/tracking"
import { sendEmail } from "@/lib/email/mailer"
import { loadTenantEmailBrand } from "@/lib/email/tenant-brand"
import { emailFromForBrand } from "@/lib/email/brand"
import { createNotification } from "@/lib/notifications"
import { CONSENT_VERSION } from "@/lib/legal/version"
import { getPackageForCheckout } from "@/lib/packages/vitrine"

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Formulário de contato exibido na vitrine quando a unidade AINDA NÃO configurou
 * o checkout (sem MP nem Asaas). Em vez de um beco sem saída — ou, pior, de cair
 * no checkout do sistema mãe — capturamos o interesse e:
 *   1. Criamos um StudentLead no menu de Leads da unidade (sempre — fica
 *      acessível no menu quando a Automação está ativa, como já é hoje).
 *   2. Enviamos um e-mail para o e-mail PRINCIPAL da revenda (owner) — sempre,
 *      independente de Automação. O replyTo é o e-mail do interessado, então a
 *      revenda responde direto para ele.
 *
 * Esta rota NUNCA cobra nada e NUNCA usa o gateway da PMB.
 */

const bodySchema = z
  .object({
    // ID do TenantCourse (curso que o interessado tentou comprar na vitrine).
    courseId: z.string().trim().min(1).max(200).optional(),
    // ID do CoursePackage quando o interesse é por um pacote. Exatamente um dos
    // dois (courseId | packageId) deve estar presente.
    packageId: z.string().trim().min(1).max(200).optional(),
    nome: z.string().trim().min(2).max(160),
    email: z.string().email().toLowerCase().trim(),
    // Mesmo padrão do /api/loja/leads: normaliza para dígitos antes de validar,
    // garantindo que `data.telefone` já chega só com números no normalizeE164.
    telefone: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length >= 10 && v.length <= 15, "Telefone inválido"),
    mensagem: z.string().trim().max(1000).optional(),
    consent: z
      .boolean()
      .refine((v) => v === true, "É necessário aceitar os termos"),
  })
  // XOR: interesse é por um curso OU por um pacote, nunca ambos/nenhum.
  .refine((v) => !!v.courseId !== !!v.packageId, {
    message: "Informe courseId ou packageId",
    path: ["courseId"],
  })

function normalizeE164(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return `+${digits}`
}

export const POST = withRequestContext(
  { action: "loja.checkout_inquiry.create", route: "/api/loja/checkout-inquiry" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.lojaLeads)
    if (!rl.ok) return rateLimitResponse(rl)

    const hasTenantHeader =
      !!request.headers.get("x-tenant-id")?.trim() ||
      !!request.headers.get("x-tenant-slug")?.trim()
    if (!hasTenantHeader) {
      return NextResponse.json(
        { error: "Tenant não identificado", code: "TENANT_MISSING" },
        { status: 400 },
      )
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json(
        { error: "JSON inválido", code: "INVALID_JSON" },
        { status: 400 },
      )
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }
    const data = parsed.data

    const tenant = await resolveTenantFromRequest(request)
    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant não encontrado", code: "TENANT_NOT_FOUND" },
        { status: 404 },
      )
    }

    // Throttle por e-mail dentro da unidade — evita flood de leads/e-mails.
    const emailRl = await rateLimitByKey(
      `${tenant.id}:${data.email}`,
      RATE_LIMITS.lojaLeadsByEmail,
    )
    if (!emailRl.ok) return rateLimitResponse(emailRl)

    // Resolve o alvo de interesse (curso ou pacote) para o snapshot do lead e o
    // nome no e-mail. O lead referencia o Course global por estabilidade — para
    // pacote, usamos o curso primário do pacote (mesmo padrão do checkout de
    // pacote em /api/loja/checkout/package).
    let leadCourseId: string
    let courseName: string
    if (data.packageId) {
      const pkg = await getPackageForCheckout(tenant.id, data.packageId)
      if (!pkg) {
        return NextResponse.json(
          { error: "Pacote não encontrado", code: "PACKAGE_NOT_FOUND" },
          { status: 404 },
        )
      }
      leadCourseId = pkg.courses[0].id
      courseName = `Pacote: ${pkg.name}`
    } else {
      const tenantCourse = await prisma.tenantCourse.findFirst({
        // So gera lead para curso exibivel: visivel na loja E ATIVO na origem.
        where: {
          id: data.courseId,
          tenantId: tenant.id,
          isVisible: true,
          course: { status: "ATIVO" },
        },
        select: { courseId: true, course: { select: { nome: true } } },
      })
      if (!tenantCourse) {
        return NextResponse.json(
          { error: "Curso não encontrado", code: "COURSE_NOT_FOUND" },
          { status: 404 },
        )
      }
      leadCourseId = tenantCourse.courseId
      courseName = tenantCourse.course.nome
    }
    const telefoneE164 = normalizeE164(data.telefone)
    const visitorId = readVisitorId(request)

    // Dedup 24h: mesmo tenant + e-mail + curso reaproveita o lead (sem duplicar).
    const existing = await prisma.studentLead.findFirst({
      where: {
        tenantId: tenant.id,
        email: data.email,
        courseId: leadCourseId,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    })

    let leadId: string
    if (existing) {
      leadId = existing.id
    } else {
      // Rodízio de consultor (best-effort — null quando auto-assign desligado).
      const ownerUserId = await pickNextLeadOwner(tenant.id).catch(() => null)
      const lead = await prisma.studentLead.create({
        data: {
          tenantId: tenant.id,
          nome: data.nome,
          email: data.email,
          telefone: telefoneE164,
          courseId: leadCourseId,
          courseSnapshot: courseName,
          notes: data.mensagem || null,
          stage: "NEW",
          // Reusa FORM_COURSE (form de interesse na página do curso) — evita
          // migração de enum. A origem real (checkout sem gateway) fica no
          // metadata da atividade LEAD_CREATED abaixo.
          source: "FORM_COURSE",
          ownerUserId,
          consentAccepted: data.consent,
          consentVersion: CONSENT_VERSION,
          activities: {
            create: {
              kind: "LEAD_CREATED",
              metadata: { source: "CHECKOUT_NO_GATEWAY", ownerUserId },
            },
          },
        },
        select: { id: true },
      })
      leadId = lead.id

      // Herda o histórico de navegação anônimo (best-effort).
      await linkVisitorToLead({ visitorId, leadId, tenantId: tenant.id }).catch(
        (err) =>
          contextLogger().error(
            { err, event: "loja.checkout_inquiry.visitor_link_failed", leadId },
            "Falha ao herdar histórico de navegação para o lead de contato",
          ),
      )
    }

    // E-mail para o e-mail PRINCIPAL da revenda (owner) — sempre, independente
    // de Automação. Fallback: supportEmail. replyTo = e-mail do interessado.
    try {
      const detail = await prisma.tenant.findUnique({
        where: { id: tenant.id },
        select: {
          slug: true,
          name: true,
          logoUrl: true,
          customDomain: true,
          supportEmail: true,
          owner: { select: { email: true } },
        },
      })
      const recipient = detail?.owner?.email ?? detail?.supportEmail ?? null
      if (recipient) {
        const brand = await loadTenantEmailBrand(tenant.id)
        await sendEmail({
          to: recipient,
          subject: `Novo interesse de compra: ${courseName}`,
          from: emailFromForBrand(brand),
          replyTo: data.email,
          template: {
            type: "reseller-lead-notification",
            props: {
              brand,
              courseName,
              leadName: data.nome,
              leadEmail: data.email,
              leadPhone: telefoneE164,
              message: data.mensagem || null,
            },
          },
        })
      } else {
        contextLogger().warn(
          { event: "loja.checkout_inquiry.no_recipient", tenantId: tenant.id },
          "Unidade sem e-mail (owner/support) — lead criado mas e-mail não enviado",
        )
      }
    } catch (err) {
      // E-mail é best-effort: o lead já foi registrado; não quebramos o form.
      contextLogger().error(
        { err, event: "loja.checkout_inquiry.email_failed", tenantId: tenant.id },
        "Falha ao enviar e-mail de interesse para a revenda",
      )
    }

    // Canal SEMPRE-ATIVO: notifica a revenda no painel (sino de notificações),
    // independente de e-mail e de Automação. Rede de segurança para o caso de a
    // unidade não ter e-mail cadastrado, o envio falhar, ou a Automação (menu de
    // Leads) estar desligada — assim o lojista nunca perde o interesse.
    await createNotification({
      audience: "TENANT",
      tenantId: tenant.id,
      level: "INFO",
      title: `Novo interesse de compra: ${courseName}`,
      body: `${data.nome} (${data.email} · ${telefoneE164}) quer comprar ${courseName}.`,
      href: "/painel/leads",
    }).catch((err) =>
      contextLogger().error(
        { err, event: "loja.checkout_inquiry.notify_failed", tenantId: tenant.id },
        "Falha ao notificar a revenda sobre o interesse de compra",
      ),
    )

    return NextResponse.json({ data: { id: leadId } }, { status: 201 })
  },
)
