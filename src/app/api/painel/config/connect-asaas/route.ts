import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePainel } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

// Conexao da conta Asaas PROPRIA da unidade (gateway de vendas). Espelha
// /api/painel/config/connect-mp: a unidade cola a API key da conta Asaas dela
// + o token de auth do webhook que ela configura no painel Asaas. Ambos sao
// criptografados (AES-256). NUNCA confundir com a integracao Asaas da
// mensalidade da unidade para a PMB (asaasCustomerId/asaasSubscriptionId).
const bodySchema = z
  .object({
    // Opcional: permite atualizar so o token do webhook depois, sem reenviar a
    // API key. O refine abaixo exige ao menos um dos dois.
    apiKey: z
      .string()
      .trim()
      .min(10, "API key inválida")
      .max(400, "API key muito longa")
      .optional(),
    webhookToken: z
      .string()
      .trim()
      .min(8, "Token do webhook inválido (muito curto)")
      .max(200, "Token do webhook muito longo")
      .optional(),
  })
  .refine((d) => d.apiKey || d.webhookToken, {
    message: "Informe a API key ou o token do webhook",
  })

export const POST = withRequestContext(
  { action: "painel.config.connect_asaas", route: "/api/painel/config/connect-asaas" },
  async (request: Request) => {
    const guard = await requirePainel("gateway.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const tenantId = ctx.tenantId

    // Conectar o Asaas nao depende mais de capability do Admin Master: as duas
    // opcoes de gateway valem para toda unidade. Quem pode configurar continua
    // sendo decidido pela permissao `gateway.manage` do guard acima. A leitura
    // abaixo so serve para o update so-de-token (exige API key ja conectada).
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { asaasApiKey: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Update so-de-token: exige que a API key ja esteja conectada.
    if (!parsed.data.apiKey && !tenant.asaasApiKey) {
      return NextResponse.json(
        { error: "Conecte a API key do Asaas primeiro", code: "NO_API_KEY" },
        { status: 400 },
      )
    }

    let encryptedKey: string | null = null
    let encryptedToken: string | null = null
    try {
      if (parsed.data.apiKey) {
        encryptedKey = encrypt(parsed.data.apiKey)
      }
      if (parsed.data.webhookToken) {
        encryptedToken = encrypt(parsed.data.webhookToken)
      }
    } catch {
      return NextResponse.json(
        { error: "Erro ao criptografar credenciais", code: "ENCRYPT_FAILED" },
        { status: 500 },
      )
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(encryptedKey
          ? { asaasApiKey: encryptedKey, asaasConnected: true }
          : {}),
        ...(encryptedToken ? { asaasWebhookToken: encryptedToken } : {}),
      },
    })

    // SAAS-001: trilha de auditoria da conexão do gateway Asaas. NUNCA registrar
    // API key/token no payload — só quais campos foram tocados.
    await logAudit({
      action: "tenant.gateway.connect",
      resource: "Tenant",
      resourceId: tenantId,
      actorUserId: ctx.userId,
      actorRole: "RESELLER",
      tenantId,
      payloadAfter: {
        gateway: "ASAAS",
        apiKeyUpdated: Boolean(encryptedKey),
        webhookConfigured: encryptedToken !== null,
      },
    })

    return NextResponse.json({
      data: {
        connected: encryptedKey !== null || Boolean(tenant.asaasApiKey),
        webhookConfigured: encryptedToken !== null,
      },
    })
  },
)

export const DELETE = withRequestContext(
  { action: "painel.config.disconnect_asaas", route: "/api/painel/config/connect-asaas" },
  async () => {
    const guard = await requirePainel("gateway.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const tenantId = ctx.tenantId

    // Desconectar reverte o gateway ativo para MP APENAS quando o Mercado Pago
    // esta de fato pronto (mesma trinca exigida pelo PATCH /sales-gateway).
    // Reverter incondicionalmente violava a REGRA DE OURO do checkout: a unidade
    // que migrou para o Asaas e nunca revogou o token antigo do MP voltaria a
    // cobrar, sem pedir nada, numa conta que ela considera desativada. Sem MP
    // pronto, `salesGateway` continua ASAAS e o checkout-mode devolve NONE —
    // a vitrine mostra o formulario de contato ate a unidade reconectar algo.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        salesGateway: true,
        mpAccessToken: true,
        mpPublicKey: true,
        mpWebhookSecret: true,
      },
    })
    const mpReady = Boolean(
      tenant?.mpAccessToken && tenant?.mpPublicKey && tenant?.mpWebhookSecret,
    )
    const salesGateway = mpReady ? "MP" : (tenant?.salesGateway ?? "MP")

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        asaasApiKey: null,
        asaasWebhookToken: null,
        asaasConnected: false,
        ...(mpReady ? { salesGateway: "MP" as const } : {}),
      },
    })

    // SAAS-001: trilha de auditoria da desconexão do gateway Asaas.
    await logAudit({
      action: "tenant.gateway.disconnect",
      resource: "Tenant",
      resourceId: tenantId,
      actorUserId: ctx.userId,
      actorRole: "RESELLER",
      tenantId,
      payloadAfter: { gateway: "ASAAS", salesGateway },
    })

    return NextResponse.json({ data: { connected: false, salesGateway } })
  },
)
