import { redirect } from "next/navigation"
import { TecnicaRedirect } from "@/components/main/tecnica-redirect"
import {
  loadPmbTecnicaConfig,
  tecnicaFromTenant,
  type TecnicaConfig,
} from "@/lib/catalog/tecnica"
import { getCurrentTenant } from "@/lib/tenant/current"
import { isAllowedTecnicaUrl } from "@/lib/catalog/tecnica-redirect"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Indo para a Escola Técnica…",
  description:
    "Estamos te redirecionando para a nossa escola técnica parceira.",
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<{ n?: string; u?: string }>
}

/**
 * Tela de loading institucional → redireciona para o site externo da
 * Escola Técnica parceira (PMB ou do tenant, dependendo do domínio
 * acessado).
 *
 * - No domínio principal: usa config PMB (system_settings).
 * - Em subdomínio/domínio custom de tenant: usa config do tenant
 *   (tenant.tecnicaUrl + tenant.tecnicaCourses).
 * - Anti-open-redirect: a `u` da query string só é aceita se constar
 *   na whitelist do config resolvido.
 */
export default async function CursosTecnicosRedirectPage({
  searchParams,
}: PageProps) {
  const { n, u } = await searchParams

  // Resolve config: tenant primeiro (se request vem de vitrine),
  // fallback para PMB.
  let tecnica: TecnicaConfig
  const tenant = await getCurrentTenant()
  if (tenant) {
    tecnica = tecnicaFromTenant(tenant)
  } else {
    tecnica = await loadPmbTecnicaConfig()
  }

  if (!tecnica.enabled || !tecnica.url || !u) {
    redirect("/")
  }

  const allowed = [tecnica.url, ...tecnica.courses.map((c) => c.url)]
  if (!isAllowedTecnicaUrl(u, allowed)) {
    redirect("/")
  }

  return <TecnicaRedirect url={u} courseName={n?.trim() || null} />
}
