import type { Metadata } from "next"
import { BrandPanel } from "@/components/auth/brand-panel"
import { getCurrentTenant } from "@/lib/tenant/current"

// Título por contexto: no domínio do revendedor usa o nome da unidade.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const name = tenant?.name ?? "Profissionaliza Mais Brasil"
  // Favicon dedicada da unidade quando existir; sem ela, cai na logo.
  const iconUrl = tenant?.faviconUrl ?? tenant?.logoUrl ?? null
  return {
    title: `Acessar conta | ${name}`,
    description: "Faça login na sua conta — alunos, revendedores e equipe.",
    ...(iconUrl
      ? { icons: { icon: [{ url: iconUrl }], apple: [{ url: iconUrl }] } }
      : {}),
  }
}

const PMB_GREEN_DEFAULT = "#025918"
const PMB_GOLD_DEFAULT = "#F2B705"

function isCustomColor(value: string | null | undefined, fallback: string): boolean {
  if (!value) return false
  return value.toLowerCase() !== fallback.toLowerCase()
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenant = await getCurrentTenant()

  const customStyle: React.CSSProperties = {}
  if (tenant && isCustomColor(tenant.primaryColor, PMB_GREEN_DEFAULT)) {
    Object.assign(customStyle, {
      "--color-pmb-green": tenant.primaryColor,
      "--color-pmb-green-700": tenant.primaryColor,
      "--color-pmb-green-900": tenant.primaryColor,
    })
  }
  if (tenant && isCustomColor(tenant.secondaryColor, PMB_GOLD_DEFAULT)) {
    Object.assign(customStyle, {
      "--color-pmb-gold": tenant.secondaryColor,
      "--color-pmb-gold-600": tenant.secondaryColor,
    })
  }

  return (
    <div
      style={customStyle}
      className="flex min-h-screen bg-[var(--color-pmb-mist)]"
    >
      <BrandPanel
        tenantName={tenant?.name ?? null}
        tenantLogoUrl={tenant?.logoUrl ?? null}
      />

      <div className="flex w-full items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
