import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"

/**
 * URL padrão da tela de login da plataforma de aulas. Usada como fallback
 * quando `EA_STUDENT_LOGIN_URL` não está configurada no ambiente — os alunos da
 * venda direta PMB acessam todos a mesma plataforma, então o botão "Acessar
 * aulas" precisa sempre funcionar.
 */
const DEFAULT_STUDENT_LOGIN_URL =
  "https://playcurso.com/bolsamaisbrasil/metodo/login.php"

/**
 * Retorna a URL de login da plataforma de aulas exibida na área do aluno.
 * Prioriza `EA_STUDENT_LOGIN_URL`; cai no padrão acima se não estiver
 * configurada.
 */
export function getStudentPlatformLoginUrl(): string {
  return process.env.EA_STUDENT_LOGIN_URL?.trim() || DEFAULT_STUDENT_LOGIN_URL
}

/**
 * Copy única para quando a plataforma de aulas recusa a troca de senha.
 *
 * A API v2 da fornecedora EA não expõe alteração de senha de aluno (o campo
 * `senha` só existe em `funcionarios/novo`), então `usuarios/editar` descarta o
 * parâmetro e responde "sucesso". Estas mensagens substituem o falso positivo
 * que era mostrado antes.
 */
export const PLATFORM_PASSWORD_UNSUPPORTED_STUDENT =
  "A plataforma de aulas não permite trocar a senha por aqui — quem define a senha é ela. Sua senha atual está no card “acesso à plataforma de aulas”, na sua área do aluno."

/**
 * Duas versões porque o público é diferente. O sistema mãe opera a integração e
 * precisa do detalhe técnico para diagnosticar; a unidade só precisa saber o que
 * fazer agora — e não deve receber o nome da fornecedora nem o endpoint dela.
 */
export const PLATFORM_PASSWORD_UNSUPPORTED_STAFF_ADMIN =
  "A plataforma de aulas (Escola Avançada) não permite alterar a senha do aluno pela API — `usuarios/editar` não aceita o campo `senha`. A senha exibida foi ressincronizada com a que realmente vale lá; repasse-a ao aluno."

export const PLATFORM_PASSWORD_UNSUPPORTED_STAFF_TENANT =
  "A senha das aulas não pode ser alterada por aqui — quem a define é a plataforma de aulas. A senha exibida foi conferida e é a que vale hoje; repasse-a ao aluno."

export const PLATFORM_PASSWORD_UNVERIFIED =
  "A plataforma de aulas não respondeu à conferência da senha. Nada foi alterado — tente novamente em alguns minutos."

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
