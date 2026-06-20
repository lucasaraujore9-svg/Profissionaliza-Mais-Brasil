import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { downloadPayoutProof } from "@/lib/storage/payout-proof"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// DB-001: a revenda baixa o comprovante do PRÓPRIO saque (bucket privado) via
// esta rota autenticada e escopada por tenant — nunca pela URL pública.
export const GET = withRequestContextParams<{ payoutId: string }>(
  {
    action: "painel.indicacoes.proof_download",
    route: "/api/painel/indicacoes/proof/[payoutId]",
  },
  async (_request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { payoutId } = await params
    const payout = await prisma.referralPayout.findUnique({
      where: { id: payoutId },
      select: { proofUrl: true, referrerTenantId: true },
    })
    if (!payout) {
      return NextResponse.json({ error: "Saque não encontrado" }, { status: 404 })
    }
    // Escopo: só o dono do saque (a revenda indicadora) acessa o comprovante.
    if (payout.referrerTenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }
    if (!payout.proofUrl) {
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
        { err, event: "painel.payout.proof_download_failed", payoutId },
        "falha ao baixar comprovante do bucket privado",
      )
      return NextResponse.json(
        { error: "Falha ao recuperar o comprovante." },
        { status: 502 },
      )
    }
  },
)
