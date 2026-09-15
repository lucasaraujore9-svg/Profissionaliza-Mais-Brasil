import { headers } from "next/headers"
import Link from "next/link"
import { isPmbAppHost } from "@/lib/tenant/urls"
import { SubscriptionPaymentPage } from "@/components/loja/subscription-payment-page"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

/**
 * `/pagar/assinatura/<id>` no domínio da PMB: assinatura da vitrine PMB
 * (`tenantId` null). Contraparte da página na loja da unidade.
 */
export default async function PagarAssinaturaPmbPage({ params }: Props) {
  const { id } = await params

  // Cobra na conta da PMB: não renderiza sob domínio de revenda.
  if (!isPmbAppHost((await headers()).get("host"))) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Pagamento indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">Não foi possível identificar esta loja.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium underline">
          Voltar
        </Link>
      </div>
    )
  }

  return (
    <SubscriptionPaymentPage
      subscriptionId={id}
      tenantId={null}
      payEndpoint="/api/checkout/assinatura/pagar"
    />
  )
}
