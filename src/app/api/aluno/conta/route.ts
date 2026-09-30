import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { anonymizeStudentAccount } from "@/lib/lgpd/anonymize-student"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Exclusão/anonimização de conta do titular (LGPD art. 18, R13 / issue 116).
// Default: ANONIMIZAÇÃO (não hard-delete) — preserva integridade contábil
// (Enrollment/Payment continuam existindo, sem PII vinculada). Bloqueia o
// acesso na plataforma de aulas e impede login futuro (passwordHash/email nulos).
const bodySchema = z.object({
  confirm: z.literal("EXCLUIR MINHA CONTA"),
})

export const DELETE = withRequestContext(
  { action: "aluno.conta.delete", route: "/api/aluno/conta" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.authReset)
    if (!rl.ok) return rateLimitResponse(rl)

    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Confirmação inválida. Envie confirm: \"EXCLUIR MINHA CONTA\"." },
        { status: 400 },
      )
    }

    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: { id: true, tenantId: true, status: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 })
    }

    // Revoga acesso na plataforma de aulas (best-effort — não bloqueia a exclusão).
    await anonymizeStudentAccount(student.id, { role: "STUDENT" })

    contextLogger().info(
      { event: "aluno.conta.anonymized", studentId: student.id },
      "conta de aluno anonimizada a pedido do titular (LGPD)",
    )

    return NextResponse.json({
      data: {
        ok: true,
        message:
          "Sua conta foi anonimizada. Seus dados pessoais foram removidos; registros financeiros são mantidos por obrigação legal.",
      },
    })
  },
)
