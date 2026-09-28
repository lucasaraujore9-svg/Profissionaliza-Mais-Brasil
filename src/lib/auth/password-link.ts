import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { generateResetToken } from "@/lib/auth/reset-token"
import {
  PMB_EMAIL_BRAND,
  emailFromForBrand,
  tenantEmailBrand,
} from "@/lib/email/brand"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

/** Validade do link pedido em /esqueci-a-senha: a pessoa está com a tela aberta. */
export const RESET_EXPIRATION_MINUTES = 5

export interface PasswordLinkOptions {
  expirationMinutes?: number
  /** Link enviado sem pedido (recuperação de e-mail de acesso perdido). */
  recovery?: boolean
  /** Aluno com o mesmo e-mail em mais de uma loja: escolhe a da unidade certa. */
  tenantId?: string | null
}

/**
 * Gera um token de redefinição e manda o link por e-mail. Nunca troca a senha:
 * quem não usar o link continua entrando com a senha que já tinha.
 *
 * Procura primeiro um usuário da equipe (User) e, sem ele, um aluno. Devolve
 * `false` quando o e-mail não pertence a ninguém — quem chama pela rota pública
 * ignora o retorno (resposta igual nos dois casos, contra enumeração).
 */
export async function sendPasswordLink(
  email: string,
  options: PasswordLinkOptions = {},
): Promise<boolean> {
  const expirationMinutes = options.expirationMinutes ?? RESET_EXPIRATION_MINUTES
  const recovery = options.recovery ?? false

  // Match case-insensitive: o input já vem em minúsculas (schema), mas o email
  // gravado pode ter capitalização diferente (Postgres `=` é case-sensitive),
  // o que faria o reset falhar silenciosamente. Alinha com o login.
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  })

  const { plain: token, hash: tokenHash } = generateResetToken()
  const expires = new Date(Date.now() + expirationMinutes * 60 * 1000)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://profissionalizamaisbrasil.com.br"
  const resetUrl = `${appUrl}/reset-password?token=${token}`

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: tokenHash, resetTokenExpires: expires },
    })

    await sendEmail({
      to: user.email,
      subject: "Redefinir sua senha",
      template: {
        type: "reset-password",
        props: {
          userName: user.name,
          resetUrl,
          expirationMinutes,
          recovery,
        },
      },
    })
    return true
  }

  // Fallback: tenta como aluno (mesmo match case-insensitive)
  const student = await prisma.student.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    },
    select: {
      id: true,
      nome: true,
      email: true,
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
  if (!student?.email) return false

  await prisma.student.update({
    where: { id: student.id },
    data: { resetToken: tokenHash, resetTokenExpires: expires },
  })

  // Aluno de revenda recebe o email com a marca da loja e o link no domínio
  // dela — nunca com os dados da PMB.
  const isPmbStudent =
    !student.tenant || student.tenant.slug === PMB_TENANT_SLUG
  const brand = isPmbStudent
    ? PMB_EMAIL_BRAND
    : tenantEmailBrand(student.tenant!)
  const studentResetBase = (brand.siteUrl ?? appUrl).replace(/\/$/, "")
  const studentResetUrl = `${studentResetBase}/reset-password?token=${token}`

  await sendEmail({
    to: student.email,
    from: emailFromForBrand(brand),
    replyTo: brand.replyTo ?? undefined,
    subject: recovery
      ? "Crie sua senha de acesso à área do aluno"
      : "Definir senha de acesso à área do aluno",
    template: {
      type: "reset-password",
      props: {
        userName: student.nome,
        resetUrl: studentResetUrl,
        expirationMinutes,
        brand,
        recovery,
      },
    },
  })
  return true
}
