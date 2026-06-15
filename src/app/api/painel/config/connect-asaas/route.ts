import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { withRequestContext } from "@/lib/observability/with-request-context"

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
    const session = await auth()
    if (
      !session?.user ||
      session.user.role !== "RESELLER" ||
      !session.user.tenantId
    ) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const tenantId = session.user.tenantId as string

    // Gate de capability: a unidade so pode conectar o Asaas se o Admin Master
    // liberou. Sem isso, alguem com sessao de revenda poderia configurar a conta
    // Asaas mesmo com a feature desligada (defesa em profundidade — a UI tambem
    // esconde, mas o servidor e a fronteira de verdade).
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { asaasGatewayEnabled: true, asaasApiKey: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    }
    if (!tenant.asaasGatewayEnabled) {
      return NextResponse.json(
        { error: "Gateway Asaas não liberado para sua unidade", code: "ASAAS_NOT_ALLOWED" },
        { status: 403 },
      )
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
    const session = await auth()
    if (
      !session?.user ||
      session.user.role !== "RESELLER" ||
      !session.user.tenantId
    ) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const tenantId = session.user.tenantId as string

    // Desconectar tambem reverte o gateway ativo para MP — uma unidade nao pode
    // ficar com salesGateway=ASAAS sem credenciais (quebraria todo o checkout).
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        asaasApiKey: null,
        asaasWebhookToken: null,
        asaasConnected: false,
        salesGateway: "MP",
      },
    })

    return NextResponse.json({ data: { connected: false, salesGateway: "MP" } })
  },
)
