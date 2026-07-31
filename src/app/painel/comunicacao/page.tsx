import { redirect } from "next/navigation"
import { PageHeader } from "@/components/painel/page-header"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { ComunicacaoPainelClient } from "@/components/painel/comunicacao-painel-client"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { WriteGate } from "@/components/shared/permissions/permission-context"

export default async function PainelComunicacaoPage() {
  await requirePainelPage("comunicacao.view")
  const ctx = await requireResellerSession()
  if (!ctx) redirect("/login")

  return (
    <WriteGate
      perm="comunicacao.manage"
      notice="Você está vendo a comunicação em modo somente leitura. Para enviar comunicados, peça a permissão “Enviar comunicados”."
    >
      <div className="space-y-6">
        <PageHeader
          title="Comunicação"
          description="Notificações push: dispositivo, envio para alunos e push automáticos."
        />
        <ComunicacaoPainelClient />
      </div>
    </WriteGate>
  )
}
