import { NextResponse } from "next/server"
import { processMonthlyPayouts } from "@/lib/referrals/payout"

export const maxDuration = 60

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") ?? ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : header
  return bearer === secret
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  try {
    const result = await processMonthlyPayouts()
    return NextResponse.json({ data: result })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido"
    console.error("[cron] referral-monthly-payout falhou:", error)
    return NextResponse.json(
      { error: `Falha no payout mensal: ${message}` },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
