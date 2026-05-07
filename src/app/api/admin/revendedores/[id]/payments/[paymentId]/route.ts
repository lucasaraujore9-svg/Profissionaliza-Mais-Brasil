import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { deletePayment, AsaasApiError } from "@/lib/asaas/client"

interface Ctx {
  params: Promise<{ id: string; paymentId: string }>
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const { paymentId } = await ctx.params

  try {
    await deletePayment(paymentId)
    return NextResponse.json({ data: { ok: true } })
  } catch (error) {
    if (error instanceof AsaasApiError && error.statusCode === 404) {
      return NextResponse.json({ error: "Cobrança não encontrada no Asaas" }, { status: 404 })
    }
    const message =
      error instanceof AsaasApiError ? error.message : "Falha ao cancelar cobrança no Asaas"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
