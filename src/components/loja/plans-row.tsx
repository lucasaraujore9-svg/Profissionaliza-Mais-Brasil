import Link from "next/link"
import Image from "next/image"
import { Sparkles, ArrowRight, Check } from "lucide-react"
import type { PlanCard } from "@/lib/subscriptions/plans"
import {
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
} from "@/lib/subscriptions/interval"

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

interface PlansRowProps {
  titulo: string
  subtitulo?: string
  plans: PlanCard[]
  /** Base do link de detalhe: "/assinatura" (revenda) ou "/assinaturas" (PMB). */
  hrefBase: string
}

/**
 * Linha de cards de planos de assinatura na home (vitrine PMB e revendas).
 * Mesmo "DNA" visual do PackagesRow. Renderiza no máximo 8 cards.
 */
export function PlansRow({ titulo, subtitulo, plans, hrefBase }: PlansRowProps) {
  if (plans.length === 0) return null
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6 md:py-10">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[26px]">
              {titulo}
            </h2>
            {subtitulo && (
              <p className="mt-1 text-[13px] text-[rgba(2,89,24,0.65)] md:text-[14px]">
                {subtitulo}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {plans.slice(0, 8).map((plan) => (
            <PlanRowCard key={plan.id} plan={plan} hrefBase={hrefBase} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PlanRowCard({ plan, hrefBase }: { plan: PlanCard; hrefBase: string }) {
  return (
    <Link
      href={`${hrefBase}/${plan.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.10)] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[var(--color-pmb-lime-50)] to-[var(--color-pmb-mist)]">
        {/* Spacer em fluxo reserva a altura 16:9 a partir da largura mesmo em
            engines antigos (iOS Safari <=14) onde aspect-ratio colapsa para 0
            quando todo o conteudo e position:absolute. */}
        <div aria-hidden className="pt-[56.25%]" />
        {plan.coverImageUrl ? (
          <Image
            src={plan.coverImageUrl}
            alt={plan.name}
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--color-pmb-green)]">
            <Sparkles className="h-10 w-10" aria-hidden />
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-green)] px-2.5 py-1 text-[11px] font-bold text-white shadow">
          <Sparkles className="h-3 w-3" aria-hidden /> Assinatura
        </span>
        {plan.featured && (
          <span className="absolute right-2 top-2 rounded-full bg-[var(--color-pmb-gold,#F2B705)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-pmb-green-900)] shadow">
            Mais popular
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--color-pmb-green-900)]">
          {plan.name}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-[12px] text-[rgba(2,89,24,0.65)]">
          <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-green)]" aria-hidden />
          Acesso a {plan.courseCount}{" "}
          {plan.courseCount === 1 ? "curso" : "cursos"}
        </p>
        <div className="mt-auto pt-3">
          <div className="font-mono text-lg font-extrabold text-[var(--color-pmb-green-900)]">
            {formatBRL(plan.price)}
            {/* Sufixo por PERIODICIDADE: "/mes" fixo num plano anual anunciaria
                12x o preco real; no vitalicio nao ha sufixo. */}
            <span className="ml-1 font-sans text-[12px] font-semibold text-[rgba(2,89,24,0.65)]">
              {INTERVAL_PRICE_SUFFIX[plan.interval]}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[rgba(2,89,24,0.55)]">
            {INTERVAL_CHARGE_LABEL[plan.interval]}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-pmb-cyan)] group-hover:underline">
            Assinar <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  )
}
