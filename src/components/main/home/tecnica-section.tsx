import Link from "next/link"
import { Building2, ArrowRight, GraduationCap, BadgeCheck } from "lucide-react"

interface TecnicaSectionProps {
  label: string
}

export function TecnicaSection({ label }: TecnicaSectionProps) {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6 md:py-12">
        <div className="relative overflow-hidden rounded-2xl bg-[var(--color-pmb-green)] p-6 text-white md:p-10">
          <div
            className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-[var(--color-pmb-gold)] opacity-25 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--color-pmb-lime)] opacity-25 blur-3xl"
            aria-hidden
          />

          <div className="relative grid items-center gap-6 md:grid-cols-[1.4fr_1fr] md:gap-10">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                Unidade Técnica
              </span>
              <h2 className="mt-3 text-[24px] font-black leading-tight md:text-[32px]">
                {label}
              </h2>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/80 md:text-[15px]">
                Já pensou em seguir uma carreira técnica? Conheça os cursos da
                nossa escola técnica parceira e dê o próximo passo na sua
                jornada profissional.
              </p>

              <ul className="mt-5 grid gap-2 text-[13px] text-white/90 md:grid-cols-2">
                <li className="flex items-center gap-2">
                  <BadgeCheck
                    className="h-4 w-4 text-[var(--color-pmb-gold)]"
                    aria-hidden
                  />
                  Certificação reconhecida
                </li>
                <li className="flex items-center gap-2">
                  <GraduationCap
                    className="h-4 w-4 text-[var(--color-pmb-gold)]"
                    aria-hidden
                  />
                  Mercado de trabalho real
                </li>
              </ul>

              <Link
                href="/cursos-tecnicos"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)] transition hover:bg-[var(--color-pmb-gold-600)]"
              >
                Conhecer cursos técnicos
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="relative hidden md:block">
              <div className="grid h-44 w-full place-items-center rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm">
                <div className="text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--color-pmb-gold)]">
                    <Building2
                      className="h-8 w-8 text-[var(--color-pmb-green)]"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </div>
                  <p className="mt-3 text-[12px] font-bold uppercase tracking-widest text-[var(--color-pmb-lime)]">
                    Escola Técnica
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
