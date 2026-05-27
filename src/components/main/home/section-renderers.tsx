import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  Award,
  Banknote,
  ShieldCheck,
  Smartphone,
  MessageCircle,
  Clock,
  Infinity as InfinityIcon,
  Quote,
  type LucideIcon,
} from "lucide-react"
import type {
  CategoriesGridConfig,
  InstitutionalConfig,
  InstitutionalItem,
} from "@/lib/home/sections"

// Mapa de ícones lucide permitidos. Adicionamos os mais usados nos blocos
// institucionais. Nome desconhecido => sem ícone.
const ICON_MAP: Record<string, LucideIcon> = {
  Award,
  Banknote,
  ShieldCheck,
  Smartphone,
  MessageCircle,
  Clock,
  Infinity: InfinityIcon,
  Quote,
}

function iconFor(name: string | null | undefined): LucideIcon | null {
  if (!name) return null
  return ICON_MAP[name] ?? null
}

// Helper que renderiza um ícone lucide pelo nome retornando JSX já pronto.
// Mantemos a seleção em escopo de função (sem armazenar o componente em uma
// `const` PascalCase dentro do render), o que satisfaz a regra
// `react-hooks/static-components` do React 19.
function renderIconByName(
  name: string | null | undefined,
  props: { className?: string; strokeWidth?: number },
  fallback: LucideIcon | null = null,
): React.ReactNode {
  const Cmp = iconFor(name) ?? fallback
  if (!Cmp) return null
  return <Cmp {...props} aria-hidden />
}

// ---------------------------------------------------------------------------
// categories_grid
// ---------------------------------------------------------------------------

interface CategoryItem {
  id: string
  nome: string
  slug: string
}

export function CategoriesGridSection({
  config,
  categories,
  tecnicaEnabled = false,
  tecnicaLabel,
}: {
  config: CategoriesGridConfig
  categories: CategoryItem[]
  tecnicaEnabled?: boolean
  tecnicaLabel?: string
}) {
  if (categories.length === 0 && !tecnicaEnabled) return null
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        <div className="mb-6 text-center">
          <h2 className="text-[24px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[30px]">
            {config.title || "Qual profissão você quer aprender?"}
          </h2>
          {config.subtitle && (
            <p className="mt-2 text-[14px] text-[rgba(2,89,24,0.65)]">
              {config.subtitle}
            </p>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cursos?categoria=${c.slug}`}
                className="flex h-full items-center justify-center rounded-xl border border-[rgba(2,89,24,0.08)] bg-white px-3 py-4 text-center text-[13px] font-bold text-[var(--color-pmb-green-900)] transition hover:-translate-y-0.5 hover:border-[var(--color-pmb-green)] hover:shadow-md"
              >
                {c.nome}
              </Link>
            </li>
          ))}
          {tecnicaEnabled && (
            <li>
              <Link
                href="/cursos-tecnicos"
                className="flex h-full items-center justify-center rounded-xl border border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] px-3 py-4 text-center text-[13px] font-bold text-white transition hover:-translate-y-0.5"
              >
                {tecnicaLabel ?? "Cursos Técnicos"}
              </Link>
            </li>
          )}
        </ul>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// institutional renderers
// ---------------------------------------------------------------------------

export function InstitutionalSection({ config }: { config: InstitutionalConfig }) {
  switch (config.variant) {
    case "trust_bar":
      return <TrustBarVariant config={config} />
    case "learn_anywhere":
      return <LearnAnywhereVariant config={config} />
    case "testimonials":
      return <TestimonialsVariant config={config} />
    case "final_cta":
      return <FinalCtaVariant config={config} />
    case "benefits":
      return <BenefitsVariant config={config} />
    case "custom":
    default:
      return <CustomVariant config={config} />
  }
}

function TrustBarVariant({ config }: { config: InstitutionalConfig }) {
  if (config.items.length === 0) return null
  return (
    <section
      aria-label={config.title || "Benefícios"}
      className="border-b border-[rgba(2,89,24,0.08)] bg-white"
    >
      <div className="mx-auto max-w-[1280px] px-4 md:px-6">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-5 py-6 md:grid-cols-3 md:py-7 lg:grid-cols-5 lg:gap-x-6">
          {config.items.map((it, i) => (
            <TrustItem key={i} item={it} />
          ))}
        </ul>
      </div>
    </section>
  )
}

function TrustItem({ item }: { item: InstitutionalItem }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-pmb-lime-50)]">
        {renderIconByName(
          item.iconName,
          { className: "h-5 w-5 text-[var(--color-pmb-green)]", strokeWidth: 2.25 },
          Award,
        )}
      </span>
      <div className="leading-tight">
        <p className="text-[13px] font-bold text-[var(--color-pmb-green)]">{item.title}</p>
        {item.body && (
          <p className="text-[12px] text-[rgba(2,89,24,0.6)]">{item.body}</p>
        )}
      </div>
    </li>
  )
}

function LearnAnywhereVariant({ config }: { config: InstitutionalConfig }) {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-12 md:grid-cols-[1fr_1fr] md:px-6 md:py-16">
        <div>
          {config.subtitle && (
            <span className="inline-block text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-green)]">
              {config.subtitle}
            </span>
          )}
          <h2 className="mt-2 text-[28px] font-black leading-tight text-[var(--color-pmb-green-900)] md:text-[36px]">
            {config.title}
          </h2>
          {config.body && (
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[rgba(2,89,24,0.75)]">
              {config.body}
            </p>
          )}
          {config.items.length > 0 && (
            <ul className="mt-6 space-y-3">
              {config.items.map((it, i) => {
                const iconNode = renderIconByName(it.iconName, {
                  className: "h-3.5 w-3.5 text-[var(--color-pmb-green)]",
                })
                return (
                  <li key={i} className="flex items-start gap-3">
                    {iconNode && (
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--color-pmb-lime-50)]">
                        {iconNode}
                      </span>
                    )}
                    <div>
                      <p className="text-[14px] font-bold text-[var(--color-pmb-green-900)]">
                        {it.title}
                      </p>
                      {it.body && (
                        <p className="text-[13px] text-[rgba(2,89,24,0.7)]">{it.body}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {config.buttonText && config.buttonHref && (
            <Link
              href={config.buttonHref}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-pmb-green)] px-5 py-3 text-[14px] font-black text-white transition hover:bg-[var(--color-pmb-green-700)]"
            >
              {config.buttonText}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
        <div className="relative hidden md:block">
          {config.imageUrl ? (
            <div className="relative h-full min-h-[280px] overflow-hidden rounded-2xl bg-white shadow-md">
              <Image
                src={config.imageUrl}
                alt=""
                fill
                unoptimized
                sizes="(max-width:768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="grid h-full min-h-[280px] place-items-center rounded-2xl border border-dashed border-[var(--color-pmb-green)]/20 bg-white">
              <Smartphone
                className="h-20 w-20 text-[var(--color-pmb-green)] opacity-30"
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function TestimonialsVariant({ config }: { config: InstitutionalConfig }) {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]">
      <div className="mx-auto max-w-[1280px] px-4 py-14 md:px-6 md:py-18">
        <div className="mb-10 text-center">
          {config.subtitle && (
            <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
              {config.subtitle}
            </p>
          )}
          <h2 className="mt-1 text-[26px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[32px]">
            {config.title}
          </h2>
          {config.body && (
            <p className="mt-2 text-[14px] text-[rgba(2,89,24,0.65)]">{config.body}</p>
          )}
        </div>

        {config.items.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(2,89,24,0.18)] bg-white px-6 py-12 text-center">
            <Quote
              className="h-10 w-10 text-[var(--color-pmb-lime)] opacity-80"
              strokeWidth={2}
              aria-hidden
            />
            <p className="mt-4 text-[15px] font-bold text-[var(--color-pmb-green)]">
              Em breve, depoimentos de quem já faz parte da nossa rede.
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 md:grid-cols-3">
            {config.items.map((it, i) => (
              <li
                key={i}
                className="relative flex flex-col rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white p-6 shadow-[0_10px_30px_-18px_rgba(2,89,24,0.2)]"
              >
                <Quote
                  className="absolute right-5 top-5 h-8 w-8 text-[var(--color-pmb-lime)] opacity-60"
                  strokeWidth={2}
                  aria-hidden
                />
                <p className="mt-3 flex-1 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.82)]">
                  &ldquo;{it.body}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3 border-t border-[rgba(2,89,24,0.08)] pt-4">
                  {it.imageUrl ? (
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full">
                      <Image src={it.imageUrl} alt="" fill unoptimized sizes="44px" className="object-cover" />
                    </span>
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-pmb-lime-50)] text-[13px] font-black text-[var(--color-pmb-green)]">
                      {it.title.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-[var(--color-pmb-green)]">
                      {it.title}
                    </p>
                    {it.meta && (
                      <p className="truncate text-[12px] text-[rgba(2,89,24,0.6)]">{it.meta}</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function FinalCtaVariant({ config }: { config: InstitutionalConfig }) {
  return (
    <section className="relative overflow-hidden bg-[var(--color-pmb-green)]">
      <div className="relative mx-auto max-w-[1280px] px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          {config.subtitle && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-pmb-lime)] px-3 py-1 text-[11.5px] font-black uppercase tracking-wider text-[var(--color-pmb-green)]">
              {config.subtitle}
            </span>
          )}
          <h2 className="mt-4 text-[30px] font-black leading-[1.05] text-white md:text-[44px]">
            {config.title}
          </h2>
          {config.body && (
            <p className="mt-4 text-[15px] leading-relaxed text-white/80 md:text-[17px]">
              {config.body}
            </p>
          )}
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {config.buttonText && config.buttonHref && (
              <Link
                href={config.buttonHref}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-pmb-gold)] px-7 py-3.5 text-[15px] font-black text-[var(--color-pmb-green)] shadow-[0_10px_30px_-10px_rgba(242,183,5,0.6)] transition-transform hover:-translate-y-0.5"
              >
                {config.buttonText}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
            {config.secondaryButtonText && config.secondaryButtonHref && (
              <Link
                href={config.secondaryButtonHref}
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3.5 text-[14px] font-bold text-white transition-colors hover:bg-white/10"
              >
                {config.secondaryButtonText}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function BenefitsVariant({ config }: { config: InstitutionalConfig }) {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        {(config.title || config.subtitle) && (
          <div className="mb-8 text-center">
            {config.subtitle && (
              <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
                {config.subtitle}
              </p>
            )}
            {config.title && (
              <h2 className="mt-1 text-[24px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[30px]">
                {config.title}
              </h2>
            )}
          </div>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {config.items.map((it, i) => {
            return (
              <li
                key={i}
                className="rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white p-5"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-pmb-lime-50)]">
                  {renderIconByName(
                    it.iconName,
                    { className: "h-6 w-6 text-[var(--color-pmb-green)]" },
                    Award,
                  )}
                </span>
                <h3 className="mt-3 text-[15px] font-bold text-[var(--color-pmb-green-900)]">
                  {it.title}
                </h3>
                {it.body && (
                  <p className="mt-1 text-[13px] text-[rgba(2,89,24,0.7)]">{it.body}</p>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function CustomVariant({ config }: { config: InstitutionalConfig }) {
  // Fallback genérico — usado quando o admin escolheu variant=custom.
  if (!config.title && !config.body && !config.imageUrl && config.items.length === 0) {
    return null
  }
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        {config.title && (
          <h2 className="text-[24px] font-black text-[var(--color-pmb-green)] md:text-[30px]">
            {config.title}
          </h2>
        )}
        {config.subtitle && (
          <p className="mt-1 text-[14px] text-[rgba(2,89,24,0.65)]">{config.subtitle}</p>
        )}
        {config.body && (
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-[rgba(2,89,24,0.75)]">
            {config.body}
          </p>
        )}
        {config.buttonText && config.buttonHref && (
          <Link
            href={config.buttonHref}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--color-pmb-green)] px-5 py-3 text-[14px] font-black text-white"
          >
            {config.buttonText}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  )
}
