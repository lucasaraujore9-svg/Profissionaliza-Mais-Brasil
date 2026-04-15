import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { homeForRole } from "@/lib/auth/home-for-role"
import { LoginForm } from "@/components/auth/login-form"

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) {
    const role = (session.user as { role?: string }).role
    redirect(homeForRole(role))
  }

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
