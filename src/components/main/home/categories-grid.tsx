import Link from "next/link"
import {
  Briefcase,
  Monitor,
  GraduationCap,
  Languages,
  Sparkles,
  Layers,
  Building2,
  ExternalLink,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { CategoriaInfo } from "@/lib/catalog/home"

interface IconConfig {
  icon: LucideIcon
  cor: string
}

const ICON_BY_SLUG: Record<string, IconConfig> = {
  informatica: { icon: Monitor, cor: "var(--color-pmb-cyan)" },
  diversas: { icon: Layers, cor: "var(--color-pmb-gold)" },
  administrativo: { icon: Briefcase, cor: "var(--color-pmb-green)" },
  preparatorios: { icon: GraduationCap, cor: "var(--color-pmb-terracotta)" },
  idiomas: { icon: Languages, cor: "var(--color-pmb-lime)" },
}

function getIconConfig(slug: string): IconConfig {
  return ICON_BY_SLUG[slug] ?? { icon: Sparkles, cor: "var(--color-pmb-green)" }
}

interface CategoriesGridProps {
  categorias: CategoriaInfo[]
  tecnicaEnabled?: boolean
  tecnicaLabel?: string
}

export function CategoriesGrid({
  categorias,
  tecnicaEnabled = false,
  tecnicaLabel = "Cursos Técnicos",
}: CategoriesGridProps) {
  if (categorias.length === 0 && !tecnicaEnabled) return null

  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        <div className="mb-7 text-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
            Escolha sua área
          </p>
          <h2 className="mt-1 text-[24px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[30px]">
            Qual profissão você quer aprender?
          </h2>
        </div>

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {categorias.map((cat) => {
            const cfg = getIconConfig(cat.slug)
            const Icon = cfg.icon
            return (
              <li key={cat.slug}>
                <Link
                  href={`/cursos?categoria=${cat.slug}`}
                  className="group flex items-center gap-3 rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[rgba(2,89,24,0.22)] hover:shadow-[0_10px_24px_-12px_rgba(2,89,24,0.2)]"
                >
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
                    style={{
                      background: `color-mix(in srgb, ${cfg.cor} 16%, white)`,
                    }}
                  >
                    <Icon
                      className="h-5 w-5"
                      strokeWidth={2.25}
                      style={{ color: cfg.cor }}
                      aria-hidden
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-[var(--color-pmb-green)] group-hover:underline">
                      {cat.nome}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
          {tecnicaEnabled && (
            <li>
              <Link
                href="/cursos-tecnicos"
                className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-[rgba(2,89,24,0.18)] bg-[var(--color-pmb-green)] p-4 text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-12px_rgba(2,89,24,0.45)]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--color-pmb-gold)]">
                  <Building2
                    className="h-5 w-5 text-[var(--color-pmb-green)]"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold group-hover:underline">
                    {tecnicaLabel}
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-pmb-lime)]">
                    Unidade técnica
                  </p>
                </div>
                <ExternalLink
                  className="h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-lime)]"
                  aria-hidden
                />
              </Link>
            </li>
          )}
        </ul>
      </div>
    </section>
  )
}
