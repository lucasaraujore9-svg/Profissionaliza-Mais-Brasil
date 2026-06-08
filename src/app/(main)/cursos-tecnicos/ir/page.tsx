import { redirect } from "next/navigation"
import { TecnicaRedirect } from "@/components/main/tecnica-redirect"
import { loadTecnicaSectionContent } from "@/lib/catalog/tecnica"
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
  if (!u) redirect("/")

  // Allow-list anti-open-redirect a partir da mesma fonte que renderiza a seção:
  // PMB no domínio principal; link da própria unidade na vitrine do revendedor.
  const tenant = await getCurrentTenant()
  const content = await loadTecnicaSectionContent(tenant?.id ?? null)

  const allowed = [
    ...(content.url ? [content.url] : []),
    ...content.courses.map((c) => c.url),
  ].filter((href): href is string => Boolean(href))

  if (allowed.length === 0 || !isAllowedTecnicaUrl(u, allowed)) {
    redirect("/")
  }

  return <TecnicaRedirect url={u} courseName={n?.trim() || null} />
}
