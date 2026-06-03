import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import {
  adminCanAccessCertTenant,
  certScopeDeniedResponse,
} from "@/lib/certificates/admin-scope"
import { issueCertificateManual } from "@/lib/certificates"
import { withRequestContext } from "@/lib/observability/with-request-context"

const schema = z.object({
  enrollmentId: z.string().min(1),
  force: z.boolean().optional(),
})

export const POST = withRequestContext(
  { action: "admin.certificates.issue", route: "/api/admin/certificates/issue" },
  async (request: Request) => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

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
  if (!(await adminCanAccessCertTenant(ctx.role, ctx.userId, enrollment.tenantId))) {
    return certScopeDeniedResponse()
  }

  // Somente o SUPER_ADMIN pode forcar emissao sem conclusao do curso.
  // Demais papeis da equipe PMB recebem a mensagem de bloqueio.
  const canForce = ctx.role === "SUPER_ADMIN"

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
