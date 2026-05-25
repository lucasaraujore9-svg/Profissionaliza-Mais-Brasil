import { NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { sendEmail, EmailError } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/

// Aceita ambos `companyName` (landing de revendedor) e `name`/`nome`
// (form de contato). Telefone passa a ser opcional para suportar mensagens
// genericas. Campos extras opcionais sao serializados em `notes`.
const leadSchema = z
  .object({
    email: z.string().email("Email inválido").toLowerCase().trim(),
    companyName: z.string().trim().optional(),
    name: z.string().trim().optional(),
    nome: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    telefone: z.string().trim().optional(),
    message: z.string().trim().optional(),
    mensagem: z.string().trim().optional(),
    interest: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().max(4).optional(),
    source: z.string().trim().optional(),
  })
  .refine(
    (v) => (v.companyName ?? v.name ?? v.nome ?? "").trim().length >= 2,
    { message: "Informe seu nome ou nome da empresa", path: ["name"] },
  )
  .refine(
    (v) => {
      const phone = (v.phone ?? v.telefone ?? "").trim()
      return phone.length === 0 || phoneRegex.test(phone)
    },
    { message: "Telefone inválido. Use (11) 99999-9999", path: ["phone"] },
  )

function notesFrom(input: z.infer<typeof leadSchema>): string | null {
  const parts: string[] = []
  const msg = (input.message ?? input.mensagem ?? "").trim()
  if (msg) parts.push(msg)
  const meta: string[] = []
  if (input.interest) meta.push(`Interesse: ${input.interest}`)
  if (input.city) meta.push(`Cidade: ${input.city}`)
  if (input.state) meta.push(`UF: ${input.state}`)
  if (input.source) meta.push(`Origem: ${input.source}`)
  if (meta.length) parts.push(meta.join(" · "))
  return parts.length ? parts.join("\n\n") : null
}

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
  const notes = notesFrom(data)

  try {
    const lead = await prisma.lead.create({
      data: {
        email: data.email,
        companyName,
        phone: phone || "",
        notes,
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
    const summary = phone ? `${data.email} · ${phone}` : data.email
    await createNotification({
      audience: "ROLE",
      roleTarget: "PMB_SALES",
      level: "INFO",
      title: `Novo lead: ${companyName}`,
      body: summary,
      category: "lead",
      href: "/admin/revendedores",
    })
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "INFO",
      title: `Novo lead: ${companyName}`,
      body: summary,
      category: "lead",
      href: "/admin/revendedores",
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
