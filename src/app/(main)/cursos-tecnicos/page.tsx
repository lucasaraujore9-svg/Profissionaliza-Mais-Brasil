import { notFound } from "next/navigation"
import { TecnicaRedirect } from "@/components/main/tecnica-redirect"
import { TecnicaCoursesList } from "@/components/main/tecnica-courses-list"
import { loadPmbTecnicaConfig } from "@/lib/catalog/tecnica"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Cursos Técnicos",
  description:
    "Cursos técnicos reconhecidos pelo MEC — diploma em até 7 meses pela nossa escola técnica parceira.",
}

export default async function CursosTecnicosPage() {
  const tecnica = await loadPmbTecnicaConfig()
  if (!tecnica.enabled || !tecnica.url) {
    notFound()
  }
  // Se há cursos cadastrados, exibe a lista (sem auto-redirect). Sem cursos,
  // mantém o comportamento antigo de redirect direto pra escola técnica.
  if (tecnica.courses.length > 0) {
    return (
      <TecnicaCoursesList
        label={tecnica.label}
        url={tecnica.url}
        courses={tecnica.courses}
      />
    )
  }
  return <TecnicaRedirect url={tecnica.url} />
}
