import type { Metadata } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"
import { loadCategorias } from "@/lib/catalog/home"
import { getCurrentTenant } from "@/lib/tenant/current"

export const metadata: Metadata = {
  title: "Cursos Online",
  description: "Encontre os melhores cursos profissionalizantes online",
}

const PMB_GREEN_DEFAULT = "#025918"
const PMB_GOLD_DEFAULT = "#F2B705"

function isCustomColor(value: string | null | undefined, fallback: string): boolean {
  if (!value) return false
  return value.toLowerCase() !== fallback.toLowerCase()
}

export default async function LojaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [categorias, tenant] = await Promise.all([
    loadCategorias(),
    getCurrentTenant(),
  ])

  const primary = tenant?.primaryColor ?? PMB_GREEN_DEFAULT
  const secondary = tenant?.secondaryColor ?? PMB_GOLD_DEFAULT

  // Só sobrescreve quando o tenant configurou cor custom
  // (evita injetar style desnecessário quando usa o default PMB)
  const customStyle: React.CSSProperties = {}
  if (isCustomColor(tenant?.primaryColor, PMB_GREEN_DEFAULT)) {
    Object.assign(customStyle, {
      "--color-pmb-green": primary,
      "--color-pmb-green-700": primary,
      "--color-pmb-green-900": primary,
    })
  }
  if (isCustomColor(tenant?.secondaryColor, PMB_GOLD_DEFAULT)) {
    Object.assign(customStyle, {
      "--color-pmb-gold": secondary,
      "--color-pmb-gold-600": secondary,
    })
  }

  return (
    <div style={customStyle} className="contents">
      <NavbarMain
        categorias={categorias}
        tenantLogoUrl={tenant?.logoUrl ?? null}
        tenantName={tenant?.name ?? null}
      />
      <main className="flex-1">{children}</main>
      <FooterMain categorias={categorias} />
    </div>
  )
}
