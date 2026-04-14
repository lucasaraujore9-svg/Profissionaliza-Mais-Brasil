import { ForgotForm } from "@/components/auth/forgot-form"
import { ConfirmationState } from "@/components/auth/confirmation-state"

interface ForgotPasswordPageProps {
  searchParams: Promise<{ success?: string }>
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams
  const isSuccess = params.success === "true"

  if (isSuccess) {
    return <ConfirmationState />
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-[#1A1A2E] md:text-3xl">
          Redefinir senha
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Informe o email cadastrado e enviaremos um link para criar uma nova
          senha.
        </p>
      </div>

      <ForgotForm />
    </div>
  )
}
