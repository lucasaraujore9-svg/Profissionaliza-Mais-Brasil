import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"

export interface StudentPlatformCredentials {
  /** Login (usuário) do aluno na plataforma de aulas. */
  login: string
  /**
   * Senha inicial gerada pela plataforma. `null` quando não temos o valor
   * (aluno antigo cuja senha já foi enviada por email e zerada, ou falha ao
   * descriptografar). Nesse caso o aluno usa a senha recebida por email.
   */
  senha: string | null
}

/**
 * Retorna as credenciais da plataforma de aulas para exibição na área do aluno.
 *
 * Regra de negócio: só expõe as credenciais quando o aluno tem ao menos uma
 * matrícula ACTIVE ou COMPLETED (pagamento confirmado). Antes do pagamento o
 * aluno ainda não foi criado na plataforma de aulas, então retorna `null`.
 *
 * A senha fica criptografada (AES-256-GCM) no banco — descriptografamos aqui.
 */
export async function getStudentPlatformCredentials(
  studentId: string,
): Promise<StudentPlatformCredentials | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      plataformaAlunoId: true,
      plataformaAlunoSenha: true,
      enrollments: {
        where: { status: { in: ["ACTIVE", "COMPLETED"] } },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!student) return null

  // Sem matrícula paga → não revela credenciais (aluno ainda não está na
  // plataforma de aulas).
  if (student.enrollments.length === 0) return null

  const login = student.plataformaAlunoId
  // Placeholder `pending_<timestamp>` significa que o aluno ainda não foi
  // efetivamente criado na plataforma.
  if (!login || login.startsWith("pending")) return null

  let senha: string | null = null
  if (student.plataformaAlunoSenha) {
    try {
      senha = decrypt(student.plataformaAlunoSenha)
    } catch (err) {
      // Valor legado em texto puro ou já zerado/corrompido — degradamos para
      // "senha enviada por email" em vez de quebrar a página.
      contextLogger().warn(
        { err, event: "aluno.platform_credentials.decrypt_failed", studentId },
        "falha ao descriptografar senha da plataforma — exibindo só o login",
      )
      senha = null
    }
  }

  return { login, senha }
}
