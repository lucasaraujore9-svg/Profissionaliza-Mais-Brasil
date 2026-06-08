import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z
  .object({
    // Opcional: permite atualizar SÓ a assinatura secreta de quem já conectou,
    // sem reenviar o token. O refine abaixo exige ao menos um dos dois.
    accessToken: z
      .string()
      .trim()
      .min(10, "Token inválido")
      .max(400, "Token muito longo")
      .optional(),
    publicKey: z.string().trim().max(400).optional(),
    mpUserId: z.string().trim().max(100).optional(),
    // Assinatura secreta do webhook desta conta MP (painel MP → Webhooks →
    // "Chave secreta"). Sem ela o webhook de pagamento é rejeitado por HMAC.
    webhookSecret: z
      .string()
      .trim()
      .min(16, "Assinatura secreta inválida (muito curta)")
      .max(200, "Assinatura secreta muito longa")
      .optional(),
  })
  .refine((d) => d.accessToken || d.webhookSecret, {
    message: "Informe o token ou a assinatura secreta",
  })

export const POST = withRequestContext(
  { action: "painel.config.connect_mp", route: "/api/painel/config/connect-mp" },
  async (request: Request) => {
    const session = await auth()
    if (
      !session?.user ||
      session.user.role !== "RESELLER" ||
      !session.user.tenantId
    ) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
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

    const tenantId = session.user.tenantId as string

    // Update só-de-secret: exige que o token já esteja conectado.
    if (!parsed.data.accessToken) {
      const existing = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { mpAccessToken: true },
      })
      if (!existing?.mpAccessToken) {
        return NextResponse.json(
          { error: "Conecte o token do Mercado Pago primeiro", code: "NO_TOKEN" },
          { status: 400 },
        )
      }
    }

    let encryptedToken: string | null = null
    let encryptedSecret: string | null = null
    try {
      if (parsed.data.accessToken) {
        encryptedToken = encrypt(parsed.data.accessToken)
      }
      if (parsed.data.webhookSecret) {
        encryptedSecret = encrypt(parsed.data.webhookSecret)
      }
    } catch {
      return NextResponse.json(
        { error: "Erro ao criptografar token", code: "ENCRYPT_FAILED" },
        { status: 500 },
      )
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        // Cada campo só é tocado quando o respectivo valor foi enviado, para
        // permitir (a) conectar token, (b) atualizar só a secret depois.
        ...(encryptedToken
          ? {
              mpAccessToken: encryptedToken,
              mpPublicKey: parsed.data.publicKey ?? null,
              mpUserId: parsed.data.mpUserId ?? null,
              mpConnected: true,
            }
          : {}),
        ...(encryptedSecret ? { mpWebhookSecret: encryptedSecret } : {}),
      },
    })

    return NextResponse.json({
      data: { connected: true, webhookConfigured: encryptedSecret !== null },
    })
  },
)

export const DELETE = withRequestContext(
  { action: "painel.config.disconnect_mp", route: "/api/painel/config/connect-mp" },
  async () => {
    const session = await auth()
    if (
      !session?.user ||
      session.user.role !== "RESELLER" ||
      !session.user.tenantId
    ) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    await prisma.tenant.update({
      where: { id: session.user.tenantId as string },
      data: {
        mpAccessToken: null,
        mpPublicKey: null,
        mpRefreshToken: null,
        mpUserId: null,
        mpConnected: false,
        mpWebhookSecret: null,
      },
    })

    return NextResponse.json({ data: { connected: false } })
  },
)
