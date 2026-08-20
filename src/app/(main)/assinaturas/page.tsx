import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import Link from "next/link"
import { resolveVitrinePlans } from "@/lib/subscriptions/plans"
import { Check, Sparkles } from "lucide-react"

export const metadata: Metadata = {
  title: "Assinaturas — Profissionaliza Mais Brasil",
  description:
    "Estude quantos cursos quiser pagando uma mensalidade. Escolha o plano ideal para você.",
  alternates: { canonical: "/assinaturas" },
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default async function AssinaturasPage() {
  // Assinatura é produto da vitrine PMB. Num subdomínio de revenda o layout
  // (main) é tenant-aware e pintaria a marca da unidade em volta de planos com
  // PREÇO DA PMB — e o "Assinar" cairia num checkout que só aceita o host PMB
  // (404). Enquanto a venda por revenda não existe, a página não existe lá.
  if (await getCurrentTenant()) notFound()

  const plans = await resolveVitrinePlans(null)

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-10 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-pmb-green)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-pmb-green-900)]">
          <Sparkles className="h-3.5 w-3.5" />
          Assinaturas
        </p>
        <h1 className="mt-3 text-2xl font-bold text-[var(--color-pmb-green-900)] sm:text-3xl">
          Estude quantos cursos quiser
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">
          Uma mensalidade, acesso ao conjunto de cursos do plano. Sem
          fidelidade — cancele quando quiser.
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
                  ? "border-[var(--color-pmb-green)] ring-1 ring-[var(--color-pmb-green)]"
                  : "border-gray-200"
              }`}
            >
              {plan.featured && (
                <span className="mb-3 self-start rounded-full bg-[var(--color-pmb-green)] px-2.5 py-1 text-[11px] font-semibold text-white">
                  Mais popular
                </span>
              )}
              <h2 className="text-lg font-semibold text-[var(--color-pmb-green-900)]">
                {plan.name}
              </h2>
              {plan.description && (
                <p className="mt-1.5 text-sm text-gray-600">{plan.description}</p>
              )}
              <p className="mt-4">
                <span className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
                  {formatMoney(plan.price)}
                </span>
                <span className="text-sm text-gray-500"> /mês</span>
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-700">
                <Check className="h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" />
                Acesso a <strong>{plan.courseCount}</strong>{" "}
                {plan.courseCount === 1 ? "curso" : "cursos"}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-700">
                <Check className="h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" />
                Certificado a cada curso concluído
              </p>
              <Link
                href={`/assinaturas/${plan.slug}`}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--color-pmb-green)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
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
