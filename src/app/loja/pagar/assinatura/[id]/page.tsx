import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { SubscriptionPaymentPage } from "@/components/loja/subscription-payment-page"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

/**
 * `/pagar/assinatura/<id>` na loja da unidade. O tenant vem do PROXY (host
 * verificado), nunca da URL — uma loja nunca abre a assinatura de outra.
 */
export default async function PagarAssinaturaLojaPage({ params }: Props) {
  const { id } = await params
  const h = await headers()
  const tenantIdHeader = h.get("x-tenant-id")
  const tenantSlug = h.get("x-tenant-slug")

  const tenantId =
    tenantIdHeader ??
    (tenantSlug
      ? (await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } }))?.id
      : undefined)

  return (
    <SubscriptionPaymentPage
      subscriptionId={id}
      // Sem loja identificada, um id que não casa com nada: nunca `null`, que
      // abriria as assinaturas da vitrine PMB neste host.
      tenantId={tenantId ?? "__sem_loja__"}
      payEndpoint="/api/loja/checkout/assinatura/pagar"
    />
  )
}
