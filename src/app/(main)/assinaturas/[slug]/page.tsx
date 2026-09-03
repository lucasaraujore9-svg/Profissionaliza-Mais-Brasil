import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import { getVitrinePlanBySlug } from "@/lib/subscriptions/plans"
import {
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
} from "@/lib/subscriptions/interval"
import { SubscriptionCheckout } from "@/components/loja/subscription-checkout"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const plan = await getVitrinePlanBySlug(null, slug)
  if (!plan) return { title: "Plano não encontrado" }
  return {
    title: `${plan.name} — Profissionaliza Mais Brasil`,
    description:
      (plan.description ?? "").slice(0, 160) ||
      `Assinatura com acesso a ${plan.courseCount} cursos profissionalizantes.`,
    alternates: { canonical: `/assinaturas/${plan.slug}` },
  }
}

export default async function PlanoPage({ params }: Props) {
  // Mesmo motivo da listagem: o plano é da PMB e o checkout só aceita o host
  // PMB. Ver o comentário em ../page.tsx.
  if (await getCurrentTenant()) notFound()

  const { slug } = await params
  const plan = await getVitrinePlanBySlug(null, slug)
  if (!plan) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          {plan.name}
        </h1>
        {plan.description && (
          <p className="mt-2 text-sm text-gray-600">{plan.description}</p>
        )}
        <p className="mt-4 text-lg">
          <strong className="text-2xl text-[var(--color-pmb-green-900)]">
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
      />
    </main>
  )
}
