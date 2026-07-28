import { PageHeader } from "@/components/painel/page-header"
import { DomainConfig } from "@/components/painel/domain-config"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelDominioPage() {
  await requirePainelPage("dominio.manage")

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Domínio"
        description="Configure o endereço onde seus alunos encontram sua vitrine."
      />
      <DomainConfig />
    </div>
  )
}
