import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { resolveVitrinePlans } from "@/lib/subscriptions/plans"
import { StudentSubscribeClient } from "@/components/aluno/student-subscribe-client"

export const dynamic = "force-dynamic"

/**
 * Contratacao de assinatura por aluno JA LOGADO.
 *
 * Existe porque o checkout anonimo (`/assinaturas`) recusa quem ja tem senha
 * com "faca login" — sem esta tela, quem logava caia num beco sem saida e a
 * base inteira de alunos existentes ficava fora do produto.
 */
export default async function AlunoAssinarPage() {
  const session = await requireStudentSession()
  if (!session) redirect("/login")

  // Já assina? Não faz sentido oferecer de novo.
  const live = await prisma.studentSubscription.findFirst({
    where: {
      studentId: session.studentId,
      status: { in: ["ACTIVE", "PAST_DUE"] },
    },
    select: { id: true },
  })
  if (live) redirect("/aluno/assinatura")

  const plans = await resolveVitrinePlans(session.tenantId ?? null)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-[var(--color-pmb-green-900)]">
          Assinar
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Estude quantos cursos quiser pagando uma mensalidade. Sem fidelidade.
        </p>
      </header>

      {plans.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Nenhum plano disponível para a sua loja no momento.
        </p>
      ) : (
        <StudentSubscribeClient plans={plans} />
      )}
    </div>
  )
}
