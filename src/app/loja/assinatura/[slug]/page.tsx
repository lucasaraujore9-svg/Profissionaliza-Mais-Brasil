import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import { prisma } from "@/lib/prisma"
import { getVitrinePlanBySlug } from "@/lib/subscriptions/plans"
import {
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
} from "@/lib/subscriptions/interval"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { SubscriptionCheckout } from "@/components/loja/subscription-checkout"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const { slug } = await params
  if (!tenant) return { title: "Assinatura" }
  const plan = await getVitrinePlanBySlug(tenant.id, slug)
  if (!plan) return { title: "Plano não encontrado" }
  return {
    title: `${plan.name} — ${tenant.name}`,
    description:
      (plan.description ?? "").slice(0, 160) ||
      `Assinatura com acesso a ${plan.courseCount} cursos.`,
  }
}

export default async function LojaPlanoPage({ params }: Props) {
  const tenant = await getCurrentTenant()
  if (!tenant) notFound()

  const { slug } = await params
  const plan = await getVitrinePlanBySlug(tenant.id, slug)
  if (!plan) notFound()

  // Qual gateway a unidade usa decide os MEIOS oferecidos: a recorrência do
  // Mercado Pago exige cartão tokenizado e não emite fatura de PIX/boleto por
  // ciclo. Oferecer PIX numa loja de MP levaria a um 400 depois do preenchimento
  // — o mesmo erro do incidente "revenda sem PIX" já registrado.
  const row = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      salesGateway: true,
      asaasApiKey: true,
      asaasWebhookToken: true,
      mpAccessToken: true,
      mpPublicKey: true,
    },
  })
  const gateway = tenantCheckoutMode({
    salesGateway: row?.salesGateway,
    asaasConnected: Boolean(row?.asaasApiKey && row?.asaasWebhookToken),
    mpAccessToken: row?.mpAccessToken,
    mpPublicKey: row?.mpPublicKey,
  })

  if (gateway === "NONE") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-[var(--brand-primary,var(--color-pmb-green-900))]">
          {plan.name}
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Esta loja ainda não está pronta para receber pagamentos online. Entre
          em contato para assinar.
        </p>
        <a
          href="/contato"
          className="mt-6 inline-flex rounded-xl bg-[var(--brand-primary,var(--color-pmb-green))] px-5 py-3 text-sm font-semibold text-white"
        >
          Falar com a equipe
        </a>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--brand-primary,var(--color-pmb-green-900))]">
          {plan.name}
        </h1>
        {plan.description && (
          <p className="mt-2 text-sm text-gray-600">{plan.description}</p>
        )}
        <p className="mt-4 text-lg">
          <strong className="text-2xl text-[var(--brand-primary,var(--color-pmb-green-900))]">
            {plan.price.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </strong>
          <span className="text-sm text-gray-500">
            {" "}
            {INTERVAL_PRICE_SUFFIX[plan.interval]} · {plan.courseCount} cursos
          </span>
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {INTERVAL_CHARGE_LABEL[plan.interval]}
        </p>
      </header>

      <SubscriptionCheckout
        planId={plan.id}
        planName={plan.name}
        price={plan.price}
        interval={plan.interval}
        endpoint="/api/loja/checkout/assinatura"
        gateway={gateway}
        mpPublicKey={row?.mpPublicKey ?? null}
      />
    </main>
  )
}
