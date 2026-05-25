import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(10, "Token inválido")
    .max(400, "Token muito longo"),
  publicKey: z.string().trim().max(400).optional(),
  mpUserId: z.string().trim().max(100).optional(),
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

    let encryptedToken: string
    try {
      encryptedToken = encrypt(parsed.data.accessToken)
    } catch {
      return NextResponse.json(
        { error: "Erro ao criptografar token", code: "ENCRYPT_FAILED" },
        { status: 500 },
      )
    }

    await prisma.tenant.update({
      where: { id: session.user.tenantId as string },
      data: {
        mpAccessToken: encryptedToken,
        mpPublicKey: parsed.data.publicKey ?? null,
        mpUserId: parsed.data.mpUserId ?? null,
        mpConnected: true,
      },
    })

    return NextResponse.json({ data: { connected: true } })
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
      },
    })

    return NextResponse.json({ data: { connected: false } })
  },
)
