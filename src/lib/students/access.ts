import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/mailer"
import { generatePasswordWithHash } from "@/lib/students/generate-password"

export interface ProvisionAccessTenant {
  isPmbVitrine: boolean
  slug: string
  name?: string | null
}

/**
 * Garante credenciais do painel /aluno e dispara o email de boas-vindas.
 * Idempotente: se o aluno já tem senha, não regera nem reenvia.
 * Chamado nos checkouts (PMB, revenda, venda direta admin) para que o aluno
 * já consiga acessar o painel e acompanhar a cobrança antes do webhook
 * confirmar o pagamento.
 */
export async function provisionStudentAccess(
  studentId: string,
  tenant: ProvisionAccessTenant,
): Promise<{ created: boolean }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, nome: true, email: true, passwordHash: true },
  })

  if (!student || !student.email || student.passwordHash) {
    return { created: false }
  }

  const { plain, hash } = await generatePasswordWithHash()

  await prisma.student.update({
    where: { id: student.id },
    data: { passwordHash: hash, passwordSetAt: new Date() },
  })

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.profissionalizamaisbrasil.com.br"

  let loginUrl: string
  let storeName: string
  if (tenant.isPmbVitrine) {
    loginUrl = `${appUrl}/login`
    storeName = "Profissionaliza Mais Brasil"
  } else {
    const host = new URL(appUrl).host.replace(/^www\./, "")
    loginUrl = `https://${tenant.slug}.${host}/login`
    storeName = tenant.name ?? `Loja ${tenant.slug}`
  }

  await sendEmail({
    to: student.email,
    subject: `Bem-vindo! Seu acesso ao painel ${storeName}`,
    template: {
      type: "student-welcome",
      props: {
        studentName: student.nome,
        studentEmail: student.email,
        temporaryPassword: plain,
        loginUrl,
        storeName,
      },
    },
  }).catch((err) => {
    console.error("[provision] student-welcome email falhou:", err)
  })

  return { created: true }
}
