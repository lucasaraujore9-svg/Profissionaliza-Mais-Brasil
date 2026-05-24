import { NextResponse } from "next/server"
import { processMonthlyPayouts } from "@/lib/referrals/payout"
import { isCronAuthorized } from "@/lib/auth/bearer"

export const maxDuration = 300

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
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
