import { redirect } from "next/navigation"
import { EjaRedirect } from "@/components/main/eja-redirect"
import { loadEjaSectionContent } from "@/lib/catalog/eja"
import { getCurrentTenant } from "@/lib/tenant/current"
import { isAllowedEjaUrl } from "@/lib/catalog/eja-redirect"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Indo para o EJA Mais Brasil…",
  description: "Estamos te redirecionando para o EJA Mais Brasil.",
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<{ u?: string }>
}

/**
 * Tela de loading institucional → redireciona para o destino externo de EJA
 * (PMB ou do tenant, dependendo do domínio acessado).
 *
 * - No domínio principal: usa `SystemSettings.ejaUrl`.
 * - Em subdomínio/domínio custom de tenant: usa `Tenant.ejaUrl`.
 * - Anti-open-redirect: a `u` da query só é aceita se constar no allowlist
 *   (o `ejaUrl` do escopo resolvido).
 */
export default async function EjaRedirectPage({ searchParams }: PageProps) {
  const { u } = await searchParams
  if (!u) redirect("/")

  const tenant = await getCurrentTenant()
  const content = await loadEjaSectionContent(tenant?.id ?? null)

  const allowed = content.url ? [content.url] : []
  if (allowed.length === 0 || !isAllowedEjaUrl(u, allowed)) {
    redirect("/")
  }

  return <EjaRedirect url={u} />
}
