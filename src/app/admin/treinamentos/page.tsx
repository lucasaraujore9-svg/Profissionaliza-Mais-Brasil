import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { TrainingsAdminClient } from "@/components/admin/trainings-admin-client"

export default async function AdminTreinamentosPage() {
  // Conteudo de treinamento e global e so o SUPER_ADMIN gerencia (as APIs ja
  // exigem requireSuperAdmin; este guard evita o shell vazio para os demais
  // perfis admin que o layout admite).
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/treinamentos")
  if (session.role !== "SUPER_ADMIN") redirect("/admin")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treinamentos"
        description="Crie módulos e adicione vídeos do YouTube. As unidades consultam tudo que estiver publicado."
      />
      <TrainingsAdminClient />
    </div>
  )
}
