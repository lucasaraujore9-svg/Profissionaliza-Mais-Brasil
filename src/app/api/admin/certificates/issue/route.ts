import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  adminCanAccessCertTenant,
  certScopeDeniedResponse,
} from "@/lib/certificates/admin-scope"
import { issueCertificateManual } from "@/lib/certificates"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const schema = z.object({
  enrollmentId: z.string().min(1),
  force: z.boolean().optional(),
})

export const POST = withRequestContext(
  { action: "admin.certificates.issue", route: "/api/admin/certificates/issue" },
  async (request: Request) => {
  const guard = await requireAdmin("certificados.manage")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

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

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: { id: true, tenantId: true },
  })
  if (!enrollment) {
    return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
  }

  // Escopo por papel: emitir cria um certificado oficial (tenantId =
  // enrollment.tenantId) e notifica o aluno. Sem isto, PMB_SALES/PMB_RESELLER_MGR
  // emitiriam certificados em nome de revendedores que nao administram.
  if (!(await adminCanAccessCertTenant(ctx, enrollment.tenantId))) {
    return certScopeDeniedResponse()
  }

  // Forcar emissao sem conclusao do curso e privilegio de quem enxerga a rede
  // inteira (`unidades.viewAll`, exclusiva do super admin).
  const canForce = ctx.can("unidades.viewAll")

  try {
    const certificate = await issueCertificateManual({
      enrollmentId: parsed.data.enrollmentId,
      source: "MANUAL_ADMIN",
      issuedByUserId: ctx.userId,
      force: canForce ? parsed.data.force ?? false : false,
    })
    return NextResponse.json({ data: { certificate } })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao emitir certificado"
    return NextResponse.json({ error: message }, { status: 400 })
  }
  },
)
