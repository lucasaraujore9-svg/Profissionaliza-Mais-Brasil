import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { resyncStudentPlatformPassword } from "@/lib/students/plataforma-actions"
import { getStudentPlatformLoginUrl } from "@/lib/students/platform-credentials"
import { sendEmail, isEmailConfigured } from "@/lib/email/resend"
import {
  PMB_EMAIL_BRAND,
  emailFromForBrand,
  tenantEmailBrand,
} from "@/lib/email/brand"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { appUrl } from "@/lib/tenant/urls"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Reenvia ao próprio aluno os dados de acesso à plataforma de aulas.
 *
 * Existe porque a plataforma de aulas (Escola Avançada) não tem recuperação de
 * senha automatizada: o "Esqueci minha senha" da tela de login dela abre um
 * atendimento por WhatsApp do fornecedor, e a API v2 não expõe troca de senha
 * de aluno. A recuperação self-service é nossa.
 *
 * O que faz:
 *  1. Ressincroniza o snapshot cifrado com a senha que REALMENTE vale na EA —
 *     conserta na hora retratos defasados/corrompidos, inclusive os que a antiga
 *     "troca de senha" (que a EA ignorava) deixou para trás.
 *  2. Dispara e-mail pelo NOSSO provedor, sem depender do SMTP da EA.
 *
 * LGPD-012: o e-mail leva o usuário e o caminho até a senha (área do aluno),
 * nunca a senha em si.
 */
export const POST = withRequestContext(
  {
    action: "aluno.credenciais_plataforma.resend",
    route: "/api/aluno/credenciais-plataforma",
  },
  async () => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Chaveado pelo aluno (não pelo IP): o custo é 1 leitura na EA + 1 e-mail
    // na caixa dele, então quem precisa ser contido é a conta, não a rede.
    const rl = await rateLimitByKey(
      session.studentId,
      RATE_LIMITS.alunoCredenciaisPlataforma,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: {
        id: true,
        nome: true,
        email: true,
        plataformaAlunoId: true,
        tenantId: true,
        tenant: {
          select: {
            slug: true,
            name: true,
            logoUrl: true,
            customDomain: true,
            domainVerified: true,
            supportEmail: true,
          },
        },
      },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    if (!student.email) {
      return NextResponse.json(
        {
          error:
            "Sua conta não tem e-mail cadastrado. Atualize o e-mail no seu perfil para receber os dados de acesso.",
        },
        { status: 400 },
      )
    }

    // Ressincroniza antes de avisar o aluno: o card da área do aluno precisa
    // mostrar a senha correta quando ele chegar lá pelo link do e-mail.
    const { onPlatform } = await resyncStudentPlatformPassword(student.id)
    if (!onPlatform) {
      return NextResponse.json(
        {
          error:
            "Você ainda não tem acesso à plataforma de aulas. Conclua uma compra para liberar o acesso.",
        },
        { status: 409 },
      )
    }

    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            "O envio de e-mails está indisponível no momento. Sua senha continua visível na sua área do aluno.",
        },
        { status: 503 },
      )
    }

    const isPmb = student.tenant?.slug === PMB_TENANT_SLUG
    const brand =
      isPmb || !student.tenant
        ? PMB_EMAIL_BRAND
        : tenantEmailBrand(student.tenant)
    const storeBase = (brand.siteUrl ?? appUrl()).replace(/\/$/, "")

    try {
      await sendEmail({
        to: student.email,
        from: emailFromForBrand(brand),
        tenantId: isPmb ? null : student.tenantId,
        subject: "Seus dados de acesso à plataforma de aulas",
        template: {
          type: "platform-access",
          props: {
            brand,
            studentName: student.nome,
            login: student.plataformaAlunoId,
            studentPanelUrl: `${storeBase}/aluno`,
            loginUrl: getStudentPlatformLoginUrl(),
          },
        },
      })
    } catch (err) {
      contextLogger().error(
        {
          err,
          event: "aluno.credenciais_plataforma.email_failed",
          studentId: student.id,
        },
        "falha ao reenviar dados de acesso da plataforma de aulas",
      )
      return NextResponse.json(
        {
          error:
            "Não conseguimos enviar o e-mail agora. Sua senha continua visível na sua área do aluno.",
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ data: { ok: true, email: student.email } })
  },
)
