import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  Award,
  BookOpen,
  Check,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react"
import type { PlanDetail } from "@/lib/subscriptions/plans"
import {
  INTERVAL_CHARGE_LABEL,
  INTERVAL_LABEL,
  INTERVAL_PRICE_SUFFIX,
  isRecurringInterval,
} from "@/lib/subscriptions/interval"
import {
  SUBSCRIPTION_MAX_ACTIVE_COURSES,
  SUBSCRIPTION_SLOTS_RULE_TEXT,
} from "@/lib/subscriptions/slots"

/**
 * Pagina publica de um plano de assinatura. Mesmo "DNA" do
 * `PackageDetailView` — o aluno reconhece a loja em qualquer prateleira —, com
 * o que a assinatura tem e o pacote nao: periodicidade, regra de vagas e a
 * promessa de catalogo que cresce.
 *
 * NAO cobra nada: o botao leva ao checkout transparente da plataforma, o mesmo
 * de curso e pacote. Um formulario de pagamento na pagina de VENDA obrigava a
 * pessoa a decidir o meio de pagamento antes de ler o que estava comprando.
 */

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

interface PlanDetailViewProps {
  plan: PlanDetail
  ctaHref: string
  ctaLabel: string
  backHref: string
  backLabel: string
  /** Link do catalogo completo, mostrado quando a amostra nao cobre tudo. */
  allCoursesHref?: string
  /** Linha abaixo do botao — usada quando a loja nao cobra online. */
  ctaNote?: string
}

export function PlanDetailView({
  plan,
  ctaHref,
  ctaLabel,
  backHref,
  backLabel,
  allCoursesHref,
  ctaNote,
}: PlanDetailViewProps) {
  const recurring = isRecurringInterval(plan.interval)
  const restantes = plan.courseCount - plan.courses.length

  const beneficios = [
    {
      icon: BookOpen,
      title: `${plan.courseCount} ${plan.courseCount === 1 ? "curso liberado" : "cursos liberados"}`,
      text: "Escolha quais quer estudar, sem pagar por curso.",
    },
    {
      icon: Award,
      title: "Certificado a cada curso concluído",
      text: "Emitido no seu nome, com carga horária e validação online.",
    },
    {
      icon: Layers,
      title: `Até ${SUBSCRIPTION_MAX_ACTIVE_COURSES} cursos ao mesmo tempo`,
      text: SUBSCRIPTION_SLOTS_RULE_TEXT,
    },
    recurring
      ? {
          icon: RefreshCw,
          title: "Sem fidelidade",
          text: `${INTERVAL_CHARGE_LABEL[plan.interval]}. Cancele quando quiser, direto na sua área do aluno.`,
        }
      : {
          icon: ShieldCheck,
          title: "Pagamento único",
          text: "Você paga uma vez e o acesso ao conteúdo do plano não expira.",
        },
    {
      icon: Zap,
      title: "Acesso imediato",
      text: "Assim que o pagamento é confirmado, os cursos aparecem na sua área do aluno.",
    },
    {
      icon: Sparkles,
      title: "Catálogo que cresce",
      text: "Curso novo que entrar no plano passa a valer para quem já assina.",
    },
  ]

  return (
    <section className="bg-[#FAFAFA] py-8 md:py-12">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-primary,var(--color-pmb-green-700))] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="relative aspect-[16/7] w-full overflow-hidden bg-gradient-to-br from-[var(--color-pmb-lime-50)] to-[var(--color-pmb-mist)]">
                {/* Spacer em fluxo garante a altura 16:7 da capa em engines
                    antigos (iOS Safari <=14) onde aspect-ratio colapsa sem
                    conteudo em fluxo. */}
                <div aria-hidden className="pt-[43.75%]" />
                {plan.coverImageUrl ? (
                  <Image
                    src={plan.coverImageUrl}
                    alt={plan.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 800px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--color-pmb-green)]">
                    <Sparkles className="h-14 w-14" aria-hidden />
                  </div>
                )}
              </div>
              <div className="p-6 lg:p-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-lime-50)] px-3 py-1 text-xs font-bold text-[var(--color-pmb-green-700)]">
                    <Sparkles className="h-3.5 w-3.5" /> Assinatura{" "}
                    {INTERVAL_LABEL[plan.interval].toLowerCase()}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                    <BookOpen className="h-3.5 w-3.5" /> {plan.courseCount}{" "}
                    {plan.courseCount === 1 ? "curso" : "cursos"}
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-black leading-tight text-[var(--brand-primary,var(--color-pmb-green-900))] md:text-3xl">
                  {plan.name}
                </h1>
                {plan.description && (
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                    {plan.description}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
              <h2 className="text-base font-semibold text-[var(--brand-primary,var(--color-pmb-green-900))]">
                O que está incluso
              </h2>
              <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {beneficios.map((b) => (
                  <li key={b.title} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                      <b.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--brand-primary,var(--color-pmb-green-900))]">
                        {b.title}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                        {b.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {plan.courses.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
                <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--brand-primary,var(--color-pmb-green-900))]">
                  <BookOpen className="h-5 w-5 text-[var(--color-pmb-green)]" />
                  {restantes > 0
                    ? "Alguns dos cursos deste plano"
                    : "Cursos deste plano"}
                </h2>
                <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {plan.courses.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-[#FAFAFA] p-3"
                    >
                      {c.coverImageUrl ? (
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-[rgba(2,89,24,0.08)]">
                          <Image
                            src={c.coverImageUrl}
                            alt={c.nome}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                          <Check className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--brand-primary,var(--color-pmb-green-900))]">
                          {c.nome}
                        </div>
                        <div className="text-xs text-gray-500">
                          {c.cargaHoraria ? `${c.cargaHoraria} • ` : ""}
                          {c.qtdAulas} aulas
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {restantes > 0 && (
                  <p className="mt-5 text-sm text-gray-600">
                    E mais <strong>{restantes}</strong>{" "}
                    {restantes === 1 ? "curso" : "cursos"} liberados por este
                    plano.{" "}
                    {allCoursesHref && (
                      <Link
                        href={allCoursesHref}
                        className="font-semibold text-[var(--brand-primary,var(--color-pmb-green-700))] hover:underline"
                      >
                        Ver o catálogo
                      </Link>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
              <div className="text-xs font-medium text-gray-500">
                {recurring ? "Assinatura" : "Acesso vitalício"}
              </div>
              <div className="mt-1 font-mono text-3xl font-bold text-[var(--brand-primary,var(--color-pmb-green-900))]">
                {formatBRL(plan.price)}
                {/* Sufixo por PERIODICIDADE: "/mes" fixo num plano anual
                    anunciaria 12x o preco real; no vitalicio nao ha sufixo. */}
                <span className="ml-1 font-sans text-sm font-semibold text-gray-500">
                  {INTERVAL_PRICE_SUFFIX[plan.interval]}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {INTERVAL_CHARGE_LABEL[plan.interval]}
              </p>

              <Link
                href={ctaHref}
                className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[var(--brand-primary,var(--color-pmb-green))] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
              >
                {ctaLabel}
              </Link>
              {ctaNote && (
                <p className="mt-3 text-center text-xs text-gray-500">{ctaNote}</p>
              )}

              <ul className="mt-5 space-y-2 border-t border-gray-100 pt-5 text-xs text-gray-600">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-green)]" />
                  Acesso a {plan.courseCount}{" "}
                  {plan.courseCount === 1 ? "curso" : "cursos"}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-green)]" />
                  Certificado a cada curso concluído
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-green)]" />
                  {recurring
                    ? "Sem fidelidade — cancele quando quiser"
                    : "Pagamento único, acesso permanente"}
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-green)]" />
                  Pagamento seguro direto na plataforma
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
