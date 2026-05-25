import { NextResponse } from "next/server"
import { z } from "zod"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"

const PIX_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] as const
type PixType = (typeof PIX_TYPES)[number]

const updateSchema = z
  .object({
    pixKey: z.string().trim().max(140).optional().nullable(),
    pixKeyType: z.enum(PIX_TYPES).optional().nullable(),
  })
  .refine(
    (v) => {
      const hasKey = Boolean(v.pixKey && v.pixKey.length > 0)
      const hasType = Boolean(v.pixKeyType)
      // Permite limpar (ambos null/vazio) ou setar (ambos preenchidos).
      return hasKey === hasType
    },
    { message: "Informe chave e tipo, ou deixe ambos em branco para remover.", path: ["pixKey"] },
  )

function validatePixKey(type: PixType, key: string): string | null {
  const k = key.trim()
  if (!k) return "Chave PIX obrigatória"
  if (type === "EMAIL") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k)) return "E-mail inválido"
  }
  if (type === "CPF") {
    const digits = k.replace(/\D/g, "")
    if (digits.length !== 11) return "CPF deve ter 11 dígitos"
  }
  if (type === "CNPJ") {
    const digits = k.replace(/\D/g, "")
    if (digits.length !== 14) return "CNPJ deve ter 14 dígitos"
  }
  if (type === "PHONE") {
    const digits = k.replace(/\D/g, "")
    if (digits.length < 10 || digits.length > 13) return "Telefone inválido"
  }
  if (type === "EVP") {
    // Chave aleatoria (UUID-ish). Aceita qualquer formato razoavel.
    if (k.length < 8) return "Chave aleatória muito curta"
  }
  return null
}

export const GET = withRequestContext(
  { action: "painel.config.pix.get", route: "/api/painel/config/pix" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { pixKey: true, pixKeyType: true },
    })

    return NextResponse.json({
      data: {
        pixKey: tenant?.pixKey ?? null,
        pixKeyType: tenant?.pixKeyType ?? null,
      },
    })
  },
)

export const PATCH = withRequestContext(
  { action: "painel.config.pix.update", route: "/api/painel/config/pix" },
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
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const pixKey = parsed.data.pixKey?.trim() || null
    const pixKeyType = parsed.data.pixKeyType ?? null

    if (pixKey && pixKeyType) {
      const err = validatePixKey(pixKeyType, pixKey)
      if (err) {
        return NextResponse.json(
          { error: err, fields: { pixKey: [err] } },
          { status: 400 },
        )
      }
    }

    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { pixKey, pixKeyType },
    })

    return NextResponse.json({ data: { pixKey, pixKeyType } })
  },
)
