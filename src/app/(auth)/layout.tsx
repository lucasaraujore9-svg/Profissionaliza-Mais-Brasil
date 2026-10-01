import type { Metadata } from "next"
import { BrandPanel } from "@/components/auth/brand-panel"
import { getCurrentTenant } from "@/lib/tenant/current"
import { TenantThemeStyle } from "@/components/shared/tenant-theme-style"
import { logoForTone } from "@/lib/tenant/theme"

// Título por contexto: no domínio do revendedor usa o nome da unidade.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const name = tenant?.name ?? "Profissionaliza Mais Brasil"
  // Favicon dedicada da unidade quando existir; sem ela, cai na logo.
  const iconUrl = tenant?.faviconUrl ?? tenant?.logoUrl ?? null
  // É desta tela que o aluno costuma instalar o app: no iOS o atalho sai do
  // apple-touch-icon, então ele prefere o ícone do app quando há um.
  const appleUrl = tenant?.appIconUrl ?? iconUrl
  return {
    title: `Acessar conta | ${name}`,
    description: "Faça login na sua conta — alunos, revendedores e equipe.",
    ...(iconUrl || appleUrl
      ? {
          icons: {
            ...(iconUrl ? { icon: [{ url: iconUrl }] } : {}),
            ...(appleUrl ? { apple: [{ url: appleUrl }] } : {}),
          },
        }
      : {}),
  }
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenant = await getCurrentTenant()

  // O painel da marca é uma área escura: usa a logo para fundo escuro.
  const logo = logoForTone("dark", tenant ?? {})

  return (
    <div className="flex min-h-screen bg-[var(--color-pmb-mist)]">
      <TenantThemeStyle tenant={tenant} />
      <BrandPanel
        tenantName={tenant?.name ?? null}
        tenantLogoUrl={logo.url}
        logoPlate={logo.plate}
      />

      <div className="flex w-full items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
