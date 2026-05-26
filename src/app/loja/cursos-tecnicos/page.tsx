import { notFound } from "next/navigation"
import { TecnicaRedirect } from "@/components/main/tecnica-redirect"
import { getCurrentTenant } from "@/lib/tenant/current"
import { tecnicaFromTenant } from "@/lib/catalog/tecnica"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Cursos Técnicos",
}

export default async function LojaCursosTecnicosPage() {
  const tenant = await getCurrentTenant()
  const tecnica = tecnicaFromTenant(tenant)
  if (!tecnica.enabled || !tecnica.url) {
    notFound()
  }
  return (
    <TecnicaRedirect
      url={tecnica.url}
      label={tecnica.label}
      tenantName={tenant?.name ?? null}
    />
  )
}
