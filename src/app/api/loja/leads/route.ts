import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  rateLimit,
  rateLimitByKey,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { queueLeadMessage } from "@/lib/automation/dispatch"
import { resolveTenantFromRequest } from "@/lib/tenant/from-request"

const CONSENT_VERSION = "2026-05-v1"
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

const bodySchema = z.object({
  nome: z.string().trim().min(2).max(160),
  email: z.string().email().toLowerCase().trim(),
  telefone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 15, "Telefone inválido"),
  courseSlug: z.string().trim().min(1).max(200),
  consent: z
    .boolean()
    .refine((v) => v === true, "É necessário aceitar os termos"),
})

function normalizeE164(digits: string): string {
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return `+${digits}`
}

export const POST = withRequestContext(
  { action: "loja.leads.create", route: "/api/loja/leads" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.lojaLeads)
    if (!rl.ok) return rateLimitResponse(rl)

    // O proxy injeta x-tenant-slug (e, em paths de vitrine, x-tenant-id). Para
    // /api/* so vem o slug, entao resolvemos por qualquer um dos dois.
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

    const emailRl = await rateLimitByKey(
      `${tenant.id}:${data.email}`,
      RATE_LIMITS.lojaLeadsByEmail,
    )
    if (!emailRl.ok) return rateLimitResponse(emailRl)

    if (!tenant.automationEnabled) {
      return NextResponse.json(
        { error: "Funcionalidade indisponível", code: "AUTOMATION_DISABLED" },
        { status: 404 },
      )
    }

    const course = await prisma.course.findUnique({
      where: { slug: data.courseSlug },
      select: { id: true, nome: true },
    })

    if (!course) {
      return NextResponse.json(
        { error: "Curso não encontrado", code: "COURSE_NOT_FOUND" },
        { status: 404 },
      )
    }

    const telefoneE164 = normalizeE164(data.telefone)
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null
    const userAgent = request.headers.get("user-agent") ?? null

    // Dedup: lead recente (24h) do mesmo tenant + email + curso => reaproveita
    // sem re-disparar WA. Evita spam acidental e mensagens duplicadas.
    const existing = await prisma.studentLead.findFirst({
      where: {
        tenantId: tenant.id,
        email: data.email,
        courseId: course.id,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
      select: { id: true, stage: true },
      orderBy: { createdAt: "desc" },
    })

    if (existing) {
      return NextResponse.json(
        {
          data: { id: existing.id, deduped: true },
          message:
            "Já recebemos seu interesse recentemente. Em breve um consultor entra em contato.",
        },
        { status: 200 },
      )
    }

    const lead = await prisma.studentLead.create({
      data: {
        tenantId: tenant.id,
        nome: data.nome,
        email: data.email,
        telefone: telefoneE164,
        courseId: course.id,
        courseSnapshot: course.nome,
        stage: "NEW",
        source: "FORM_COURSE",
        ipAddress,
        userAgent,
        consentAccepted: data.consent,
        consentVersion: CONSENT_VERSION,
        activities: {
          create: {
            kind: "LEAD_CREATED",
            metadata: { source: "FORM_COURSE" },
          },
        },
      },
      select: { id: true },
    })

    // Disparo do WhatsApp e fire-and-forget. Falha aqui nao quebra o form.
    queueLeadMessage({
      leadId: lead.id,
      templateKey: "FORM_SUBMITTED",
    }).catch((err) => {
      contextLogger().error(
        { err, event: "loja.leads.dispatch_failed", leadId: lead.id },
        "Falha ao enfileirar mensagem de form_submitted",
      )
    })

    return NextResponse.json({ data: { id: lead.id } }, { status: 201 })
  },
)
