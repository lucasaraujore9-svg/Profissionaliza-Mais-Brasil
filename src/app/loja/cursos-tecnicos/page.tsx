import { notFound } from "next/navigation"
import { TecnicaRedirect } from "@/components/main/tecnica-redirect"
import { TecnicaCoursesList } from "@/components/main/tecnica-courses-list"
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
  if (tecnica.courses.length > 0) {
    return (
      <TecnicaCoursesList
        label={tecnica.label}
        url={tecnica.url}
        courses={tecnica.courses}
        tenantName={tenant?.name}
      />
    )
  }
  return <TecnicaRedirect url={tecnica.url} />
}
