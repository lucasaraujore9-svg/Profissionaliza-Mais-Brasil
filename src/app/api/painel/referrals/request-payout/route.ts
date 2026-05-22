import { NextResponse } from "next/server"
import { z } from "zod"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { requestPayout, ReferralPayoutError } from "@/lib/referrals/payout"

const bodySchema = z.object({
  method: z.enum(["ASAAS_PIX", "DESCONTO_MENSALIDADE"]),
  pixKey: z.string().min(3).max(120).optional(),
  pixKeyType: z.enum(["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"]).optional(),
})

export async function POST(request: Request) {
  const session = await requireResellerSession()
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados invalidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  try {
    const payout = await requestPayout({
      referrerTenantId: session.tenantId,
      method: parsed.data.method,
      pixKey: parsed.data.pixKey ?? null,
      pixKeyType: parsed.data.pixKeyType ?? null,
    })
    return NextResponse.json({
      data: {
        id: payout.id,
        amount: Number(payout.amount),
        status: payout.status,
      },
    })
  } catch (err) {
    if (err instanceof ReferralPayoutError) {
      const statusByCode: Record<typeof err.code, number> = {
        DISABLED: 403,
        NO_BALANCE: 400,
        BELOW_MIN: 400,
        INVALID_PIX: 400,
        ALREADY_PENDING: 409,
      }
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: statusByCode[err.code] ?? 400 },
      )
    }
    const message = err instanceof Error ? err.message : "Erro interno"
    console.error("[referrals] request-payout falhou:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
