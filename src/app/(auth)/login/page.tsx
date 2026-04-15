import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
          Bem-vindo de volta
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Entre com sua conta para acessar seu painel de revendedor.
        </p>
      </div>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
