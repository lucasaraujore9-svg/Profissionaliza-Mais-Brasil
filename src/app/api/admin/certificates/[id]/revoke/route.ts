import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { revokeCertificate } from "@/lib/certificates"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import {
  adminCanAccessCertTenant,
  certScopeDeniedResponse,
} from "@/lib/certificates/admin-scope"

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

  // R24: mesmo escopo de download/regenerate/issue — certificado da vitrine
  // PMB exige operar a vitrine; certificado de unidade exige alcancar aquela
  // unidade na carteira. Antes daqui saia um par errado nos dois sentidos: o
  // gerente de unidades nao revogava a propria carteira (403) e revogava
  // certificado da vitrine PMB, que ele nem consegue listar.
  if (!(await adminCanAccessCertTenant(ctx, cert.tenantId))) {
    return certScopeDeniedResponse()
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
