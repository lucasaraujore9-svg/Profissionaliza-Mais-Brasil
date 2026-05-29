import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { createNotification } from "@/lib/notifications"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { sendEmail, isEmailConfigured } from "@/lib/email/resend"
import { appUrl } from "@/lib/tenant/urls"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

const schema = z.object({
  assunto: z.string().trim().min(3).max(120),
  mensagem: z.string().trim().min(10).max(2000),
})

const PMB_SUPPORT_EMAIL =
  process.env.PMB_SUPPORT_EMAIL?.trim() || "suporte@profissionalizamaisbrasil.com.br"

export const POST = withRequestContext(
  { action: "aluno.suporte.create", route: "/api/aluno/suporte" },
  async (request: Request) => {
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

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: {
        id: true,
        nome: true,
        email: true,
        fone: true,
        tenantId: true,
        tenant: {
          select: {
            slug: true,
            name: true,
            owner: { select: { email: true, name: true } },
          },
        },
      },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const { assunto, mensagem } = parsed.data
    const title = `Suporte: ${assunto}`
    const notifBody = `${student.nome} (${student.email ?? "sem email"}) enviou:\n\n${mensagem}`

    // 1) Notificacao in-app (mesma logica do passo anterior).
    const isPmb = student.tenant?.slug === PMB_TENANT_SLUG
    if (isPmb) {
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        title,
        body: notifBody,
        category: "support",
        level: "INFO",
        href: `/admin/alunos/${student.id}`,
      })
    } else if (student.tenantId) {
      await createNotification({
        audience: "TENANT",
        tenantId: student.tenantId,
        title,
        body: notifBody,
        category: "support",
        level: "INFO",
        href: `/painel/alunos/${student.id}`,
      })
    }

    // 2) Email (best-effort — nao bloqueia o request se falhar).
    // Destinatario: dono do tenant (revendedor) ou time PMB (vitrine institucional).
    const recipientEmail = isPmb
      ? PMB_SUPPORT_EMAIL
      : student.tenant?.owner?.email ?? null

    if (recipientEmail && isEmailConfigured() && student.email) {
      const storeName = isPmb
        ? "Profissionaliza Mais Brasil"
        : student.tenant?.name ?? "Profissionaliza Mais Brasil"
      const studentPanelUrl = isPmb
        ? `${appUrl()}/admin/alunos/${student.id}`
        : `${appUrl()}/painel/alunos/${student.id}`

      try {
        await sendEmail({
          to: recipientEmail,
          // reply-to leva direto ao aluno — owner responde sem precisar entrar no painel
          replyTo: student.email,
          subject: `[Suporte] ${assunto} — ${student.nome}`,
          template: {
            type: "student-support",
            props: {
              storeName,
              studentName: student.nome,
              studentEmail: student.email,
              studentPhone: student.fone ?? undefined,
              subject: assunto,
              message: mensagem,
              studentPanelUrl,
            },
          },
        })
      } catch (err) {
        contextLogger().warn(
          { err, event: "aluno.suporte.email_failed", studentId: student.id },
          "Falha ao enviar email de suporte — notificacao in-app continua valida",
        )
      }
    }

    return NextResponse.json({ ok: true })
  },
)
