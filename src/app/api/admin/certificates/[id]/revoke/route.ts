import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { revokeCertificate } from "@/lib/certificates"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const schema = z.object({
  reason: z.string().trim().min(3, "Justificativa muito curta").max(500),
})

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.certificates.revoke", route: "/api/admin/certificates/[id]/revoke" },
  async (request: Request, { params }) => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

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

  // R24: PMB staff (PMB_SALES, PMB_RESELLER_MGR) só podem revogar certificados PMB
  // (tenantId = null). Certificados de revendedores (tenantId != null) exigem SUPER_ADMIN.
  if (cert.tenantId !== null && ctx.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode revogar certificados de revendedores" },
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
