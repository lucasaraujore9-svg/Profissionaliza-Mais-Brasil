import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function randomCode(length = 10): string {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export const POST = withRequestContext(
  { action: "painel.cupons.generate_code", route: "/api/painel/cupons/generate-code" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode()
      const existing = await prisma.coupon.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code } },
        select: { id: true },
      })
      if (!existing) {
        return NextResponse.json({ data: { code } })
      }
    }

    return NextResponse.json(
      { error: "Não foi possível gerar código, tente novamente" },
      { status: 500 },
    )
  },
)
