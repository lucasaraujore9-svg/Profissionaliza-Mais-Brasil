import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { revokeCertificate } from "@/lib/certificates"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const schema = z.object({
  reason: z.string().trim().min(3, "Justificativa muito curta").max(500),
})

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.certificates.revoke", route: "/api/admin/certificates/[id]/revoke" },
  async (request: Request, { params }) => {
  const guard = await requireAdmin("certificados.manage")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

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
    select: { id: true, revokedAt: true, tenantId: true },
  })
  if (!cert) {
    return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 })
  }
  if (cert.revokedAt) {
    return NextResponse.json({ error: "Certificado já está revogado" }, { status: 409 })
  }

  // R24: quem não enxerga a rede inteira só revoga certificado da vitrine PMB
  // (tenantId = null) — nunca o de um aluno de revendedor.
  if (cert.tenantId !== null && !ctx.can("unidades.viewAll")) {
    return NextResponse.json(
      { error: "Sem permissão para revogar certificados de revendedores" },
      { status: 403 },
    )
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
