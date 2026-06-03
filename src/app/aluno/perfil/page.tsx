import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { StudentProfileForm } from "@/components/aluno/student-profile-form"
import { StudentPasswordForm } from "@/components/aluno/student-password-form"
import { PlatformPasswordForm } from "@/components/aluno/platform-password-form"
import { DeleteAccountSection } from "@/components/aluno/delete-account-section"
import { getStudentPlatformCredentials } from "@/lib/students/platform-credentials"

export default async function StudentProfilePage() {
  const session = await requireStudentSession()
  if (!session) return null

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: {
      nome: true,
      email: true,
      fone: true,
      cpf: true,
      cidade: true,
      estado: true,
      cep: true,
      rua: true,
      numero: true,
      bairro: true,
      passwordSetAt: true,
    },
  })

  if (!student) return null

  // So oferece a troca de senha da plataforma de aulas quando o aluno ja foi
  // cadastrado la (matricula paga) — caso contrario nao ha senha a redefinir.
  const platformCredentials = await getStudentPlatformCredentials(
    session.studentId,
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          Meu perfil
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Mantenha seus dados de contato atualizados e gerencie sua senha de
          acesso.
        </p>
      </header>

      <StudentProfileForm
        initial={{
          nome: student.nome,
          email: student.email ?? "",
          fone: student.fone ?? "",
          cpf: student.cpf ?? "",
          cidade: student.cidade ?? "",
          estado: student.estado ?? "",
          cep: student.cep ?? "",
          rua: student.rua ?? "",
          numero: student.numero ?? "",
          bairro: student.bairro ?? "",
        }}
      />

      <StudentPasswordForm passwordSetAt={student.passwordSetAt?.toISOString() ?? null} />

      {platformCredentials && <PlatformPasswordForm />}

      <DeleteAccountSection />
    </div>
  )
}
