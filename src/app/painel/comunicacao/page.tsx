import { redirect } from "next/navigation"
import { PageHeader } from "@/components/painel/page-header"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { ComunicacaoPainelClient } from "@/components/painel/comunicacao-painel-client"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export default async function PainelComunicacaoPage() {
  await requirePainelPage("comunicacao.manage")
  const ctx = await requireResellerSession()
  if (!ctx) redirect("/login")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunicação"
        description="Notificações push: dispositivo, envio para alunos e push automáticos."
      />
      <ComunicacaoPainelClient />
    </div>
  )
}
