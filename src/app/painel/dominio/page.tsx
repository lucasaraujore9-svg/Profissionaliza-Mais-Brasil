import { PageHeader } from "@/components/painel/page-header"
import { DomainConfig } from "@/components/painel/domain-config"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export default async function PainelDominioPage() {
  await requirePainelPage("dominio.view")

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Domínio"
        description="Configure o endereço onde seus alunos encontram sua vitrine."
      />
      <WriteGate
        perm="dominio.manage"
        notice="Você está vendo o domínio em modo somente leitura. Para alterá-lo, peça a permissão “Configurar o domínio”."
      >
        <DomainConfig />
      </WriteGate>
    </div>
  )
}
