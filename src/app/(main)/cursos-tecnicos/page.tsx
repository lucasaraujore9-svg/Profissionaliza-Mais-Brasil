import { notFound } from "next/navigation"
import { TecnicaRedirect } from "@/components/main/tecnica-redirect"
import { loadPmbTecnicaConfig } from "@/lib/catalog/tecnica"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Cursos Técnicos",
}

export default async function CursosTecnicosPage() {
  const tecnica = await loadPmbTecnicaConfig()
  if (!tecnica.enabled || !tecnica.url) {
    notFound()
  }
  return <TecnicaRedirect url={tecnica.url} label={tecnica.label} />
}
