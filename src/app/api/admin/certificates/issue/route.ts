import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { issueCertificateManual } from "@/lib/certificates"

const schema = z.object({
  enrollmentId: z.string().min(1),
  force: z.boolean().optional(),
})

export async function POST(request: Request) {
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
    select: { id: true },
  })
  if (!enrollment) {
    return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
  }

  try {
    const certificate = await issueCertificateManual({
      enrollmentId: parsed.data.enrollmentId,
      source: "MANUAL_ADMIN",
      issuedByUserId: ctx.userId,
      force: parsed.data.force ?? false,
    })
    return NextResponse.json({ data: { certificate } })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao emitir certificado"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
