import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Define o gateway ATIVO da vitrine da unidade (MP padrao | ASAAS). Uma venda
// por vez vai por um gateway — o /api/loja/checkout le tenant.salesGateway.
const bodySchema = z.object({
  gateway: z.enum(["MP", "ASAAS"]),
})

export const PATCH = withRequestContext(
  { action: "painel.config.sales_gateway", route: "/api/painel/config/sales-gateway" },
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

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        slug: true,
        customDomain: true,
        asaasGatewayEnabled: true,
        asaasApiKey: true,
        asaasWebhookToken: true,
        mpAccessToken: true,
        mpPublicKey: true,
        mpWebhookSecret: true,
      },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    }

    // So permite ATIVAR um gateway que esteja realmente pronto para vender —
    // caso contrario a vitrine ficaria com checkout quebrado.
    if (parsed.data.gateway === "ASAAS") {
      if (!tenant.asaasGatewayEnabled) {
        return NextResponse.json(
          { error: "Gateway Asaas não liberado para sua unidade", code: "ASAAS_NOT_ALLOWED" },
          { status: 403 },
        )
      }
      if (!tenant.asaasApiKey || !tenant.asaasWebhookToken) {
        return NextResponse.json(
          {
            error: "Conecte a API key e o token do webhook do Asaas antes de ativá-lo",
            code: "ASAAS_NOT_CONFIGURED",
          },
          { status: 400 },
        )
      }
    } else {
      // MP: exige token + public key + assinatura secreta (mesma trinca que o
      // checkout transparente do MP precisa).
      if (!tenant.mpAccessToken || !tenant.mpPublicKey || !tenant.mpWebhookSecret) {
        return NextResponse.json(
          {
            error: "Conecte o Mercado Pago (token, public key e assinatura secreta) antes de ativá-lo",
            code: "MP_NOT_CONFIGURED",
          },
          { status: 400 },
        )
      }
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { salesGateway: parsed.data.gateway },
    })

    await invalidateTenant({
      id: tenantId,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    }).catch(() => {})

    return NextResponse.json({ data: { salesGateway: parsed.data.gateway } })
  },
)
