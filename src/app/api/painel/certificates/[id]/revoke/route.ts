import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { revokeCertificate } from "@/lib/certificates"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const schema = z.object({
  reason: z.string().trim().min(3, "Justificativa muito curta").max(500),
})

export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.certificates.revoke", route: "/api/painel/certificates/[id]/revoke" },
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requirePainel("certificados.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const cert = await prisma.certificate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, revokedAt: true },
    })
    if (!cert) {
      return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 })
    }
    if (cert.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Certificado de outro tenant" }, { status: 403 })
    }
    if (cert.revokedAt) {
      return NextResponse.json({ error: "Certificado já está revogado" }, { status: 409 })
    }

    try {
      await revokeCertificate(id, parsed.data.reason, ctx.userId)
      return NextResponse.json({ data: { ok: true } })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao revogar certificado"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  },
)
