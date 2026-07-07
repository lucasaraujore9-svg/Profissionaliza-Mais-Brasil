import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { mpWebhookUrl, asaasWebhookUrl } from "@/lib/tenant/urls"
import { forbiddenNameError } from "@/lib/tenant/forbidden-names"

const updateSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(160),
  companyName: z.string().trim().min(2).max(160),
})

async function requireResellerSession() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    return null
  }
  return {
    userId: session.user.id as string,
    tenantId: session.user.tenantId as string,
  }
}

export const GET = withRequestContext(
  { action: "painel.config.get", route: "/api/painel/config" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true },
    })
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        billingMode: true,
        status: true,
        mpConnected: true,
        mpUserId: true,
        mpWebhookSecret: true,
        mpPublicKey: true,
        monthlyAllowed: true,
        monthlyEnabled: true,
        monthlyScope: true,
        boletoInstallmentAllowed: true,
        boletoInstallmentEnabled: true,
        interestFreeInstallments: true,
        // Asaas como gateway de vendas (so aparece no painel quando liberado).
        // asaasConnected ja indica conexao; nao buscamos a api key (segredo) aqui.
        asaasGatewayEnabled: true,
        asaasConnected: true,
        asaasWebhookToken: true,
        salesGateway: true,
      },
    })

    if (!user || !tenant) {
      return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    }

    // Nunca expõe segredos em si — só se estão configurados. A public key não é
    // secreta (vai pro client no checkout), mas a UI só precisa do booleano.
    const {
      mpWebhookSecret,
      mpPublicKey,
      asaasWebhookToken,
      ...tenantSafe
    } = tenant
    return NextResponse.json({
      data: {
        user,
        tenant: {
          ...tenantSafe,
          mpWebhookConfigured: mpWebhookSecret !== null,
          mpPublicKeyConfigured: mpPublicKey !== null,
          // URL exata que enviamos ao MP e que a unidade cola no painel MP.
          mpWebhookUrl: mpWebhookUrl(tenant.slug),
          // Asaas: só os booleanos + a URL de webhook por-tenant (a unidade cola
          // no painel Asaas dela). A API key e o token nunca chegam ao client.
          asaasWebhookConfigured: asaasWebhookToken !== null,
          asaasWebhookUrl: asaasWebhookUrl(tenant.slug),
        },
      },
    })
  },
)

export const PUT = withRequestContext(
  { action: "painel.config.update", route: "/api/painel/config" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = updateSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Marca reservada (contrato): a unidade não pode renomear-se usando
    // Bolsa Mais Brasil / Profissionaliza / Escola de Ensino a Distância /
    // Livre Cursos. Mesma regra da criação (admin).
    const forbidden = forbiddenNameError(parsed.data.companyName)
    if (forbidden) {
      return NextResponse.json(
        { error: forbidden, fields: { companyName: [forbidden] } },
        { status: 400 },
      )
    }

    const emailTaken = await prisma.user.findFirst({
      where: { email: parsed.data.email, NOT: { id: ctx.userId } },
      select: { id: true },
    })
    if (emailTaken) {
      return NextResponse.json(
        { error: "Email já está em uso", code: "EMAIL_TAKEN" },
        { status: 409 },
      )
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: ctx.userId },
        data: { name: parsed.data.name, email: parsed.data.email },
      }),
      prisma.tenant.update({
        where: { id: ctx.tenantId },
        data: { name: parsed.data.companyName },
      }),
    ])

    return NextResponse.json({ data: { ok: true } })
  },
)
