import Image from "next/image"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { homeForRole } from "@/lib/auth/home-for-role"
import { LoginForm } from "@/components/auth/login-form"
import { getCurrentTenant } from "@/lib/tenant/current"

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) {
    const role = (session.user as { role?: string }).role
    redirect(homeForRole(role))
  }

  const tenant = await getCurrentTenant()
  const displayName = tenant?.name ?? "Profissionaliza Mais Brasil"

  return (
    <div>
      {/* Marca compacta no topo do form (visível em mobile, onde o BrandPanel some) */}
      <div className="mb-6 flex items-center gap-3 lg:hidden">
        {tenant?.logoUrl ? (
          <Image
            src={tenant.logoUrl}
            alt={displayName}
            width={400}
            height={120}
            className="h-10 w-auto object-contain"
            unoptimized
          />
        ) : (
          <Image
            src="/images/logo.png"
            alt="Profissionaliza Mais Brasil"
            width={400}
            height={120}
            className="h-10 w-auto"
          />
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
          Acesse sua conta
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Entre com seu email e senha para continuar.
        </p>
      </div>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
