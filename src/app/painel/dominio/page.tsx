import { PageHeader } from "@/components/painel/page-header"
import { SubdomainDisplay } from "@/components/painel/subdomain-display"
import { CustomDomainForm } from "@/components/painel/custom-domain-form"

export default function PainelDominioPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Domínio"
        description="Configure o endereço onde seus alunos encontram sua vitrine."
      />

      <SubdomainDisplay />
      <CustomDomainForm />
    </div>
  )
}
