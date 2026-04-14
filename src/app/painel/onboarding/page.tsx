import { PageHeader } from "@/components/painel/page-header"
import { OnboardingWizard } from "@/components/painel/onboarding-wizard"

export default function PainelOnboardingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Vamos começar"
        description="Prepare sua vitrine em 5 passos rápidos."
      />
      <OnboardingWizard />
    </div>
  )
}
