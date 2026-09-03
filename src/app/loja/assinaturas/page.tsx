import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import { resolveVitrinePlans } from "@/lib/subscriptions/plans"
import {
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
} from "@/lib/subscriptions/interval"
import { Check, Sparkles } from "lucide-react"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  if (!tenant) return { title: "Assinaturas" }
  return {
    title: `Assinaturas — ${tenant.name}`,
    description:
      "Estude quantos cursos quiser com um plano mensal, trimestral, semestral, anual ou vitalício. Escolha o ideal para você.",
  }
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function LojaAssinaturasPage() {
  const tenant = await getCurrentTenant()
  if (!tenant) notFound()

  // Planos da PMB com o override DESTA unidade aplicado (preço próprio,
  // ocultos removidos) e a contagem de cursos no escopo dela — o mesmo plano
  // libera menos cursos numa vitrine que não vende parte do catálogo.
  const plans = await resolveVitrinePlans(tenant.id)

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-10 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary,var(--color-pmb-green))]/10 px-3 py-1 text-xs font-semibold text-[var(--brand-primary,var(--color-pmb-green-900))]">
          <Sparkles className="h-3.5 w-3.5" />
          Assinaturas
        </p>
        <h1 className="mt-3 text-2xl font-bold text-[var(--brand-primary,var(--color-pmb-green-900))] sm:text-3xl">
          Estude quantos cursos quiser
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">
          Um pagamento, acesso ao conjunto de cursos do plano. Escolha a
          periodicidade que preferir — nas recorrentes não há fidelidade,
          cancele quando quiser.
        </p>
      </header>

      {plans.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          Nenhum plano disponível no momento.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                plan.featured
                  ? "border-[var(--brand-primary,var(--color-pmb-green))] ring-1 ring-[var(--brand-primary,var(--color-pmb-green))]"
                  : "border-gray-200"
              }`}
            >
              {plan.featured && (
                <span className="mb-3 self-start rounded-full bg-[var(--brand-primary,var(--color-pmb-green))] px-2.5 py-1 text-[11px] font-semibold text-white">
                  Mais popular
                </span>
              )}
              <h2 className="text-lg font-semibold text-[var(--brand-primary,var(--color-pmb-green-900))]">
                {plan.name}
              </h2>
              {plan.description && (
                <p className="mt-1.5 text-sm text-gray-600">{plan.description}</p>
              )}
              <p className="mt-4">
                <span className="text-2xl font-bold text-[var(--brand-primary,var(--color-pmb-green-900))]">
                  {money(plan.price)}
                </span>
                <span className="text-sm text-gray-500">
                  {" "}
                  {INTERVAL_PRICE_SUFFIX[plan.interval]}
                </span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {INTERVAL_CHARGE_LABEL[plan.interval]}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-700">
                <Check className="h-4 w-4 shrink-0 text-[var(--brand-primary,var(--color-pmb-green))]" />
                Acesso a <strong>{plan.courseCount}</strong>{" "}
                {plan.courseCount === 1 ? "curso" : "cursos"}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-700">
                <Check className="h-4 w-4 shrink-0 text-[var(--brand-primary,var(--color-pmb-green))]" />
                Certificado a cada curso concluído
              </p>
              {/* Singular, como /pacote/:slug — o proxy reescreve para /loja/. */}
              <Link
                href={`/assinatura/${plan.slug}`}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--brand-primary,var(--color-pmb-green))] px-4 py-3 text-sm font-semibold text-white"
              >
                Assinar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
