import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getReferralPlacarSnapshot } from "@/lib/placar/snapshot"
import { PlacarClient } from "@/components/placar/placar-client"
import { requirePainelPage } from "@/lib/auth/painel-guard"

// Placar de INDICAÇÕES do revendedor de revenda: scoreboard das revendas que
// ELE indicou, no mesmo estilo do placar de lançamento, com som a cada nova
// ativação. Escopado ao tenant da sessão; gated por canSellResellers (o stream
// SSE reforça o mesmo limite server-side).
export const dynamic = "force-dynamic"

export default async function PainelPlacarPage() {
  await requirePainelPage("revendas.manage")
  const session = await auth()
  const tenantId = session?.user?.tenantId
  if (!tenantId) redirect("/login?callbackUrl=/painel/placar")

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { canSellResellers: true },
  })
  // Sem o módulo de revender revendas, não há placar de indicações.
  if (!tenant?.canSellResellers) redirect("/painel")

  const snapshot = await getReferralPlacarSnapshot(tenantId)

  return (
    <PlacarClient
      initial={snapshot}
      streamUrl="/api/painel/placar/stream"
      title="Placar de Indicações"
      subtitle="Suas revendas indicadas que estão ativas"
      mainLabel="Revendas indicadas ativas"
      celebrationTitle="NOVA REVENDA INDICADA ATIVADA!"
      logoUrl={null}
      showMeta={false}
      variant="panel"
      exitHref="/painel/revendas"
    />
  )
}
