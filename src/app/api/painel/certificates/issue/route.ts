import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { issueCertificateManual } from "@/lib/certificates"
import { withRequestContext } from "@/lib/observability/with-request-context"

const schema = z.object({
  enrollmentId: z.string().min(1),
  force: z.boolean().optional(),
})

export const POST = withRequestContext(
  { action: "painel.certificates.issue", route: "/api/painel/certificates/issue" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
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

    // Garantir que enrollment pertence ao tenant do reseller
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: parsed.data.enrollmentId },
      select: { id: true, tenantId: true },
    })
    if (!enrollment) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }
    if (enrollment.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Matrícula de outro tenant" }, { status: 403 })
    }

    try {
      // Revendedores nunca forcam emissao sem conclusao — exclusivo do
      // SUPER_ADMIN. Ignoramos qualquer `force` vindo do client.
      const certificate = await issueCertificateManual({
        enrollmentId: parsed.data.enrollmentId,
        source: "MANUAL_RESELLER",
        issuedByUserId: ctx.userId,
        force: false,
      })
      return NextResponse.json({ data: { certificate } })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao emitir certificado"
      return NextResponse.json({ error: message }, { status: 400 })
    }
  },
)
