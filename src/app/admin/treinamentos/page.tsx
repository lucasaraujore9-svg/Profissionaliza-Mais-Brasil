import Link from "next/link"
import { redirect } from "next/navigation"
import { PlayCircle } from "lucide-react"
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
        actions={
          <Link
            href="/admin/treinamentos/assistir"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)] px-3 py-2 text-sm font-semibold text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-green)]/5"
          >
            <PlayCircle className="h-4 w-4" /> Assistir treinamentos
          </Link>
        }
      />
      <TrainingsAdminClient />
    </div>
  )
}
