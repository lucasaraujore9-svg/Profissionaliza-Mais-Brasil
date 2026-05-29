import { NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import {
  rateLimit,
  rateLimitByKey,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { isValidPhone } from "@/lib/validation/phone"
import { resolveTenantFromRequest } from "@/lib/tenant/from-request"

// Contato publico roteado por tenant (ContactMessage kind=CONTACT).
// - Com header `x-tenant-id` (storefront de revenda) -> cai na unidade dona.
// - Sem header (site institucional PMB) -> cai na PMB (tenantId null).
// Diferente de /api/leads (revenda) e /api/loja/leads (interesse em curso):
// aqui e duvida/atendimento generico de quem ja chegou na vitrine.
const bodySchema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome").max(160),
    email: z.string().email("Email inválido").toLowerCase().trim(),
    telefone: z.string().trim().optional(),
    assunto: z.string().trim().max(160).optional(),
    mensagem: z.string().trim().min(10, "Escreva sua mensagem").max(2000),
    source: z.string().trim().max(120).optional(),
  })
  .refine(
    (v) => {
      const phone = (v.telefone ?? "").trim()
      return phone.length === 0 || isValidPhone(phone)
    },
    { message: "Telefone inválido. Use (11) 99999-9999", path: ["telefone"] },
  )

export const POST = withRequestContext(
  { action: "contato.create", route: "/api/contato" },
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

    let data: z.infer<typeof bodySchema>
    try {
      data = bodySchema.parse(payload)
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

    // Resolve dono pelos headers do proxy (x-tenant-id OU x-tenant-slug).
    // Storefront => unidade; sem headers (site PMB) => PMB.
    const hasTenantHeader =
      !!request.headers.get("x-tenant-id")?.trim() ||
      !!request.headers.get("x-tenant-slug")?.trim()
    let tenant: { id: string; slug: string } | null = null
    if (hasTenantHeader) {
      tenant = await resolveTenantFromRequest(request)
      if (!tenant) {
        return NextResponse.json(
          { error: "Tenant não encontrado", code: "TENANT_NOT_FOUND" },
          { status: 404 },
        )
      }
    }

    // Throttle por email dentro do escopo (tenant ou PMB) — anti-spam.
    const emailRl = await rateLimitByKey(
      `contato:${tenant?.id ?? "pmb"}:${data.email}`,
      RATE_LIMITS.lojaLeadsByEmail,
    )
    if (!emailRl.ok) return rateLimitResponse(emailRl)

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null
    const userAgent = request.headers.get("user-agent") ?? null
    const source = tenant ? `loja:${tenant.slug}` : data.source || "/contato"

    try {
      const message = await prisma.contactMessage.create({
        data: {
          tenantId: tenant?.id ?? null,
          kind: "CONTACT",
          nome: data.nome,
          email: data.email,
          telefone: data.telefone || null,
          assunto: data.assunto || null,
          mensagem: data.mensagem,
          source,
          ipAddress,
          userAgent,
        },
        select: { id: true },
      })

      const title = `Nova mensagem: ${data.assunto || data.nome}`
      const body = `${data.nome} (${data.email})\n\n${data.mensagem}`

      if (tenant) {
        await createNotification({
          audience: "TENANT",
          tenantId: tenant.id,
          level: "INFO",
          title,
          body,
          category: "support",
          href: "/painel/atendimento",
        })
      } else {
        // Equipe interna PMB que enxerga /admin/atendimento.
        for (const roleTarget of ["SUPER_ADMIN", "PMB_SALES"] as const) {
          await createNotification({
            audience: "ROLE",
            roleTarget,
            level: "INFO",
            title,
            body,
            category: "support",
            href: "/admin/atendimento",
          })
        }
      }

      return NextResponse.json({ data: { id: message.id } }, { status: 201 })
    } catch (error) {
      contextLogger().error(
        { err: error, event: "contato.create_failed" },
        "criar mensagem de contato falhou",
      )
      return NextResponse.json(
        { error: "Erro ao enviar mensagem", code: "DB_ERROR" },
        { status: 500 },
      )
    }
  },
)
