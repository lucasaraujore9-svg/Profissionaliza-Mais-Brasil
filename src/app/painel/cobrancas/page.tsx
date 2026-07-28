import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { TenantChargesList } from "@/components/painel/tenant-charges-list"
import { getTenantBillingSummary } from "@/lib/tenant-billing/charges"
import { syncTenantChargesFromAsaas } from "@/lib/tenant-billing/sync"

export const metadata = {
  title: "Minhas cobranças | Painel",
}

export const dynamic = "force-dynamic"

export default async function PainelCobrancasPage() {
  const session = await auth()
  if (
    !session?.user ||
    session.user.role !== "RESELLER" ||
    !session.user.tenantId
  ) {
    redirect("/login?callbackUrl=/painel/cobrancas")
  }
  const tenantId = session.user.tenantId

  // Owner-only: é o financeiro da própria unidade. Consultor também carrega
  // `tenantId` na sessão, então a checagem de dono direto (User.tenantId, que é
  // @unique e só existe no dono) é obrigatória.
  const owner = await prisma.user.findFirst({
    where: { id: session.user.id as string, tenantId },
    select: { id: true },
  })
  if (!owner) redirect("/painel")

  // Espelha o Asaas antes de renderizar (throttled, best-effort): a unidade
  // precisa ver o boleto mesmo quando o webhook não criou a linha aqui.
  await syncTenantChargesFromAsaas(tenantId)

  const summary = await getTenantBillingSummary(tenantId, { historyLimit: 24 })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minhas cobranças"
        description="Mensalidades da sua unidade com a Profissionaliza Mais Brasil. Avisamos por aqui e por email 5 dias antes, 2 dias antes e no dia do vencimento."
      />
      <TenantChargesList summary={summary} />
    </div>
  )
}
