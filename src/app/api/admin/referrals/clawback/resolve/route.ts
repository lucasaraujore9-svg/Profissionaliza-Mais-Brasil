import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { requireAdmin } from "@/lib/auth/admin-guard"

// Resolve um clawback pendente ([CLAWBACK_PENDING]) marcado quando uma mensalidade
// e estornada DEPOIS da comissao ja estar liberada/paga. Ate aqui nao havia
// caminho para limpar a marca: o indicador ficava com os payouts automaticos
// (e, com o gate em requestPayout, tambem os manuais) bloqueados indefinidamente.
//
// Acoes:
//   - CANCEL:  o estorno procede. A comissao vira CANCELLED (sai dos totais e
//              nao sera paga). Para comissoes legadas ja PAGAS, e um ajuste de
//              ledger (o dinheiro ja saiu — o financeiro recupera por fora).
//   - DISMISS: o estorno nao afeta a comissao (admin decide manter). Mantem o
//              status, apenas troca o prefixo para [CLAWBACK_RESOLVED] para
//              destravar os payouts.
// Em ambos os casos o cancelReason deixa de comecar com [CLAWBACK_PENDING], entao
// o gate em processMonthlyPayouts/requestPayout volta a liberar o indicador.

const bodySchema = z.object({
  ledger: z.enum(["LEGACY", "MONTHLY"]),
  id: z.string().min(1).max(60),
  action: z.enum(["CANCEL", "DISMISS"]),
})

const PENDING_PREFIX = "[CLAWBACK_PENDING]"

function resolvedReason(action: "CANCEL" | "DISMISS", original: string | null): string {
  const tail = (original ?? "").replace(/^\[CLAWBACK_PENDING\]\s*/, "")
  const label = action === "CANCEL" ? "CANCELADA" : "MANTIDA"
  return `[CLAWBACK_RESOLVED:${label}] ${tail}`.trim()
}

// CANCEL nao pode rodar enquanto a comissao ainda esta vinculada a um saque EM
// ABERTO (REQUESTED/PROCESSING): cancelar so o status deixaria o payout.amount
// inflado e markPayoutPaid (updateMany por payoutId, sem guard de status)
// ressuscitaria a linha como PAID, pagando a mais. O admin deve recusar o saque
// primeiro (failPayout devolve as comissoes para AVAILABLE + payoutId null) e so
// entao cancelar. PAID/FAILED/CANCELLED nao tem esse risco (o pago e historico;
// failPayout ja desvinculou os demais).
async function linkedToOpenPayout(payoutId: string | null): Promise<boolean> {
  if (!payoutId) return false
  const p = await prisma.referralPayout.findUnique({
    where: { id: payoutId },
    select: { status: true },
  })
  return p?.status === "REQUESTED" || p?.status === "PROCESSING"
}

const LINKED_PAYOUT_MSG =
  "Esta comissão está vinculada a um saque em aberto. Recuse o saque (as comissões voltam para disponível) antes de cancelá-la."

export const POST = withRequestContext(
  { action: "admin.referrals.clawback.resolve", route: "/api/admin/referrals/clawback/resolve" },
  async (request: Request) => {
    const guard = await requireAdmin("indicacoes.clawback")
    if (!guard.ok) return guard.response
    const session = guard.ctx
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON invalido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos" }, { status: 400 })
    }
    const { ledger, id, action } = parsed.data
    const now = new Date()

    if (ledger === "LEGACY") {
      const row = await prisma.referralCommission.findUnique({
        where: { id },
        select: { id: true, status: true, cancelReason: true, payoutId: true, referrerTenantId: true },
      })
      if (!row || !row.cancelReason?.startsWith(PENDING_PREFIX)) {
        return NextResponse.json(
          { error: "Comissao sem clawback pendente." },
          { status: 404 },
        )
      }
      if (action === "CANCEL" && (await linkedToOpenPayout(row.payoutId))) {
        return NextResponse.json({ error: LINKED_PAYOUT_MSG }, { status: 409 })
      }
      const updated = await prisma.referralCommission.update({
        where: { id },
        data: {
          status: action === "CANCEL" ? "CANCELLED" : row.status,
          cancelReason: resolvedReason(action, row.cancelReason),
          cancelledAt: action === "CANCEL" ? (now) : undefined,
        },
        select: { id: true, status: true },
      })
      contextLogger().warn(
        { event: "audit.referrals.clawback_resolved", ledger, id, action, by: session.userId, referrerTenantId: row.referrerTenantId },
        "clawback legado resolvido pelo admin",
      )
      return NextResponse.json({ data: { id: updated.id, status: updated.status } })
    }

    // MONTHLY
    const row = await prisma.referralMonthlyCommission.findUnique({
      where: { id },
      select: { id: true, status: true, cancelReason: true, payoutId: true, referrerTenantId: true },
    })
    if (!row || !row.cancelReason?.startsWith(PENDING_PREFIX)) {
      return NextResponse.json(
        { error: "Comissao sem clawback pendente." },
        { status: 404 },
      )
    }
    if (action === "CANCEL" && (await linkedToOpenPayout(row.payoutId))) {
      return NextResponse.json({ error: LINKED_PAYOUT_MSG }, { status: 409 })
    }
    const updated = await prisma.referralMonthlyCommission.update({
      where: { id },
      data: {
        status: action === "CANCEL" ? "CANCELLED" : row.status,
        cancelReason: resolvedReason(action, row.cancelReason),
        cancelledAt: action === "CANCEL" ? now : undefined,
      },
      select: { id: true, status: true },
    })
    contextLogger().warn(
      { event: "audit.referrals.clawback_resolved", ledger, id, action, by: session.userId, referrerTenantId: row.referrerTenantId },
      "clawback mensal resolvido pelo admin",
    )
    return NextResponse.json({ data: { id: updated.id, status: updated.status } })
  },
)
