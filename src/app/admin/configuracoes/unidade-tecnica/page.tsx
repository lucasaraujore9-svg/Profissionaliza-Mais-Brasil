import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/admin-guard"
import { PageHeader } from "@/components/painel/page-header"
import { AdminTecnicaSettingsForm } from "@/components/admin/admin-tecnica-settings-form"
import { parseTecnicaCourses } from "@/lib/catalog/tecnica"

export const dynamic = "force-dynamic"

export default async function AdminTecnicaSettingsPage() {
  await requireAdminPage("vitrine.manage")

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    select: {
      tecnicaEnabled: true,
      tecnicaUrl: true,
      tecnicaLabel: true,
      tecnicaCourses: true,
    },
  })

  const coursesNormalized = parseTecnicaCourses(
    settings.tecnicaCourses,
    settings.tecnicaUrl,
  )

  return (
    <div className="space-y-6">
      <Link
        href="/admin/configuracoes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para configurações
      </Link>

      <PageHeader
        title="Unidade Técnica — site PMB"
        description="Habilita a categoria, item de menu e seção “Cursos Técnicos” no site institucional profissionalizamaisbrasil.com.br. Para vitrines de revendedor, configure individualmente em cada revendedor."
      />

      <AdminTecnicaSettingsForm
        initial={{
          enabled: settings.tecnicaEnabled,
          url: settings.tecnicaUrl,
          label: settings.tecnicaLabel,
          courses: coursesNormalized.map((c) => ({
            name: c.name,
            // Esconde a URL no editor quando ela coincide com a base — assim
            // o admin nao precisa repetir manualmente a URL em todo curso.
            url: c.url === settings.tecnicaUrl ? "" : c.url,
          })),
        }}
      />
    </div>
  )
}
