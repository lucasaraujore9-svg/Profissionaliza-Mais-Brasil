import Link from "next/link"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div>
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-[#1A1A2E] md:text-3xl">
            Link inválido
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            O link de redefinição é inválido ou expirou.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Solicitar novo link
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-[#1A1A2E] md:text-3xl">
          Redefinir senha
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Defina uma nova senha para acessar sua conta.
        </p>
      </div>

      <ResetPasswordForm token={token} />
    </div>
  )
}
