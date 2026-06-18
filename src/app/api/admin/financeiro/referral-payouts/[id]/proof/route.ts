import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { canMarkPaid } from "@/lib/auth/roles"
import { uploadVitrineAsset } from "@/lib/supabase/storage"
import { isValidImageMagic } from "@/lib/storage/validate-image"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

const MAX_BYTES = 8 * 1024 * 1024 // 8MB
// Comprovante: imagem ou PDF. SVG bloqueado (pode carregar <script>).
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
])

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png"
    case "image/jpeg":
    case "image/jpg":
      return "jpg"
    case "image/webp":
      return "webp"
    case "application/pdf":
      return "pdf"
    default:
      return "bin"
  }
}

// Magic bytes do PDF: "%PDF-".
function isPdf(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer.slice(0, 5))
  return (
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46 &&
    b[4] === 0x2d
  )
}

// Anexa o comprovante de pagamento de um saque de comissão. Visível para a
// revenda em /painel/indicacoes. Bucket público sob `comprovantes/` com caminho
// aleatório (não enumerável). Permissão: Financeiro / SUPER_ADMIN.
export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "admin.financeiro.referral_payouts.proof_upload",
    route: "/api/admin/financeiro/referral-payouts/[id]/proof",
  },
  async (request: Request, context) => {
    const session = await requireAdminSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (!canMarkPaid(session.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const rl = await rateLimit(request, RATE_LIMITS.upload)
    if (!rl.ok) return rateLimitResponse(rl)

    const { id } = await context.params

    const payout = await prisma.referralPayout.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!payout) {
      return NextResponse.json({ error: "Saque não encontrado" }, { status: 404 })
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 })
    }

    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formato não suportado (use PDF, PNG, JPG ou WEBP)" },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Arquivo maior que 8MB" }, { status: 400 })
    }

    const ext = extensionFor(file.type)
    const path = `comprovantes/${payout.id}/${Date.now()}-${Math.round(
      Math.random() * 1e9,
    )}.${ext}`

    try {
      const buffer = await file.arrayBuffer()
      // Validação por magic bytes (o mime declarado pelo client é spoofable).
      const valid =
        file.type === "application/pdf"
          ? isPdf(buffer)
          : isValidImageMagic(buffer, file.type)
      if (!valid) {
        return NextResponse.json(
          { error: "Conteúdo do arquivo não corresponde ao formato declarado" },
          { status: 400 },
        )
      }

      const result = await uploadVitrineAsset(path, buffer, file.type)

      const updated = await prisma.referralPayout.update({
        where: { id: payout.id },
        data: {
          proofUrl: result.publicUrl,
          proofUploadedAt: new Date(),
          proofUploadedById: session.userId,
        },
        select: { id: true, proofUrl: true, proofUploadedAt: true },
      })

      await logAudit({
        action: "payout.proof_upload",
        resource: "ReferralPayout",
        resourceId: payout.id,
        actorUserId: session.userId,
        actorRole: session.role,
        actorEmail: session.email,
        payloadAfter: { proofUrl: updated.proofUrl },
      })

      return NextResponse.json({
        data: {
          id: updated.id,
          proofUrl: updated.proofUrl,
          proofUploadedAt: updated.proofUploadedAt?.toISOString() ?? null,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro no upload"
      return NextResponse.json(
        { error: `Falha ao enviar comprovante: ${message}` },
        { status: 502 },
      )
    }
  },
)
