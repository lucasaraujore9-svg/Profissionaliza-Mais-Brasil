import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { downloadPayoutProof } from "@/lib/storage/payout-proof"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// DB-001: comprovante de saque é PII financeira em bucket PRIVADO. Servido via
// stream service-role, escopo Financeiro/SUPER_ADMIN. proofUrl guarda o PATH.
export const GET = withRequestContextParams<{ id: string }>(
  {
    action: "admin.financeiro.referral_payouts.proof_download",
    route: "/api/admin/financeiro/referral-payouts/[id]/proof/download",
  },
  async (_request: Request, { params }) => {
    const guard = await requireAdmin("financeiro.manage")
    if (!guard.ok) return guard.response
    const { id } = await params
    const payout = await prisma.referralPayout.findUnique({
      where: { id },
      select: { proofUrl: true },
    })
    if (!payout?.proofUrl) {
      return NextResponse.json({ error: "Comprovante não encontrado" }, { status: 404 })
    }

    try {
      const { buffer, contentType } = await downloadPayoutProof(payout.proofUrl)
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
        },
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "admin.payout.proof_download_failed", payoutId: id },
        "falha ao baixar comprovante do bucket privado",
      )
      return NextResponse.json(
        { error: "Falha ao recuperar o comprovante." },
        { status: 502 },
      )
    }
  },
)
