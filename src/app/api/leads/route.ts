import { NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { sendEmail, EmailError } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { isValidPhone } from "@/lib/validation/phone"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { validateSlugFormat } from "@/lib/tenant/slug"
import { slugify } from "@/lib/utils"
import {
  validateReferralCode,
  resolveReferrerFromCookie,
} from "@/lib/referrals/capture"
import { pickNextRevendaLeadOwner } from "@/lib/automation/assign"

// Endpoint EXCLUSIVO de revenda (interessado em virar revendedor PMB).
// Contato generico migrou para /api/contato (ContactMessage roteado por
// tenant); suporte de aluno vive em /api/aluno/suporte. Aqui so cai quem
// quer abrir uma vitrine — relacao sempre com a PMB, nunca com uma unidade.
// Aceita `companyName` (landing) ou `name`/`nome`. Campos de segmentacao
// (plan/city/state/source) sao persistidos em colunas dedicadas.
const leadSchema = z
  .object({
    email: z.string().email("Email inválido").toLowerCase().trim(),
    companyName: z.string().trim().optional(),
    name: z.string().trim().optional(),
    nome: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    telefone: z.string().trim().optional(),
    plan: z.string().trim().max(60).optional(),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(4).optional(),
    source: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2000).optional(),
    // Captacao completa (form /lp-revenda2): CPF do interessado e o subdominio
    // (slug) desejado para a vitrine. Opcionais — o form /seja-revendedor
    // classico nao os envia.
    cpf: z.string().trim().max(20).optional(),
    slug: z.string().trim().max(32).optional(),
    // Codigo de indicacao informado no formulario (opcional). Tem prioridade
    // sobre o cookie pmb_referral.
    ref: z.string().trim().max(60).optional(),
  })
  .refine(
    (v) => (v.companyName ?? v.name ?? v.nome ?? "").trim().length >= 2,
    { message: "Informe seu nome ou nome da empresa", path: ["name"] },
  )
  .refine(
    (v) => {
      const phone = (v.phone ?? v.telefone ?? "").trim()
      return phone.length === 0 || isValidPhone(phone)
    },
    { message: "Telefone inválido. Use (11) 99999-9999", path: ["phone"] },
  )
  .refine((v) => !v.cpf || isValidCpf(v.cpf), {
    message: "CPF inválido",
    path: ["cpf"],
  })
  .refine((v) => !v.slug || validateSlugFormat(v.slug) === null, {
    message: "Subdomínio inválido. Use letras minúsculas, números e hífen (3-32 caracteres)",
    path: ["slug"],
  })

export const POST = withRequestContext(
  { action: "leads.create", route: "/api/leads" },
  async (request: Request) => {
  const rl = await rateLimit(request, RATE_LIMITS.leads)
  if (!rl.ok) return rateLimitResponse(rl)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: "JSON inválido", code: "INVALID_JSON" },
      { status: 400 },
    )
  }

  let data: z.infer<typeof leadSchema>
  try {
    data = leadSchema.parse(payload)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          code: "VALIDATION_ERROR",
          details: error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }
    throw error
  }

  const companyName = (data.companyName ?? data.name ?? data.nome ?? "").trim()
  const phone = (data.phone ?? data.telefone ?? "").trim()
  // CPF guardado so com digitos; slug normalizado (minusculas/hifen).
  const cpf = data.cpf ? stripCpf(data.cpf) : null
  const slug = data.slug ? slugify(data.slug) : null

  // Atribuicao de indicacao: o codigo digitado no formulario (?ref) tem
  // prioridade; sem ele, cai no cookie pmb_referral capturado quando o
  // visitante abriu /seja-revendedor?ref=CODE. Persistido no lead para que a
  // conversao (mesmo feita pela equipe) credite o revendedor que indicou.
  let referrerTenantId: string | null = null
  if (data.ref) {
    const validated = await validateReferralCode(data.ref)
    referrerTenantId = validated?.tenantId ?? null
  }
  if (!referrerTenantId) {
    referrerTenantId = await resolveReferrerFromCookie()
  }

  // Distribuicao automatica (rodizio) entre vendedores de revenda, se ligada
  // em SystemSettings. Retorna null quando desligada ou sem vendedor elegivel —
  // nesse caso o lead nasce sem dono e o admin/gerente atribui manualmente.
  const ownerUserId = await pickNextRevendaLeadOwner()

  try {
    const lead = await prisma.lead.create({
      data: {
        email: data.email,
        companyName,
        phone: phone || "",
        plan: data.plan || null,
        city: data.city || null,
        state: data.state || null,
        source: data.source || null,
        cpf,
        slug,
        notes: data.notes || null,
        referrerTenantId,
        ownerUserId,
      },
    })

    // Fire-and-forget email; never break the request if Resend falha
    sendEmail({
      to: data.email,
      subject: "Recebemos seu interesse!",
      template: {
        type: "lead-confirmation",
        props: { companyName },
      },
    }).catch((err: unknown) => {
      contextLogger().error(
        {
          err,
          event: "leads.confirmation_email_failed",
          leadEmail: data.email,
          emailErrorType: err instanceof EmailError ? "EmailError" : "Unexpected",
        },
        "envio de email de confirmação do lead falhou",
      )
    })

    // Notifica equipe interna sobre novo lead — equipe de vendas tipicamente
    // tem PMB_SALES, mas sem alguem com esse papel cai pro SUPER_ADMIN.
    const summaryParts = [data.email]
    if (phone) summaryParts.push(phone)
    if (data.plan) summaryParts.push(`Plano: ${data.plan}`)
    if (slug) summaryParts.push(`Subdomínio: ${slug}`)
    const locale = [data.city, data.state].filter(Boolean).join("/")
    if (locale) summaryParts.push(locale)
    const summary = summaryParts.join(" · ")
    await createNotification({
      audience: "ROLE",
      roleTarget: "PMB_SALES",
      level: "INFO",
      title: `Novo lead: ${companyName}`,
      body: summary,
      category: "lead",
      href: "/admin/leads-revenda",
    })
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "INFO",
      title: `Novo lead: ${companyName}`,
      body: summary,
      category: "lead",
      href: "/admin/leads-revenda",
    })

    return NextResponse.json({ data: { id: lead.id } }, { status: 201 })
  } catch (error) {
    contextLogger().error(
      { err: error, event: "leads.create_failed" },
      "criar lead falhou",
    )
    return NextResponse.json(
      { error: "Erro ao salvar lead", code: "DB_ERROR" },
      { status: 500 },
    )
  }
  },
)
