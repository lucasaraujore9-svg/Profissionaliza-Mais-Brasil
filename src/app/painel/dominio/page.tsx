import { PageHeader } from "@/components/painel/page-header"
import { DomainConfig } from "@/components/painel/domain-config"

export default function PainelDominioPage() {
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
