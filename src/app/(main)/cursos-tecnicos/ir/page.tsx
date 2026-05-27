import { redirect } from "next/navigation"
import { TecnicaRedirect } from "@/components/main/tecnica-redirect"
import { loadPmbTecnicaConfig } from "@/lib/catalog/tecnica"
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
 * Página intermediária `/cursos-tecnicos/ir?n=<nome>&u=<urlExterna>`.
 *
 * Valida que a URL externa pertence ao domínio cadastrado em
 * `tecnica.url` ou aos URLs dos `tecnica.courses` (defense-in-depth
 * contra open redirect). Se inválido, redireciona para a listagem
 * interna `/cursos-tecnicos`.
 */
export default async function CursosTecnicosRedirectPage({
  searchParams,
}: PageProps) {
  const { n, u } = await searchParams
  const tecnica = await loadPmbTecnicaConfig()

  if (!tecnica.enabled || !tecnica.url || !u) {
    redirect("/cursos-tecnicos")
  }

  const allowed = [tecnica.url, ...tecnica.courses.map((c) => c.url)]
  if (!isAllowedTecnicaUrl(u, allowed)) {
    redirect("/cursos-tecnicos")
  }

  return <TecnicaRedirect url={u} courseName={n?.trim() || null} />
}
