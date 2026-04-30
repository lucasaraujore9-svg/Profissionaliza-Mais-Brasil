import { Search } from "lucide-react"
import { ShowcaseCards } from "./showcase-cards"
import type { ShowcaseCard } from "@/lib/catalog/home"

interface HeroBannerProps {
  showcase?: ShowcaseCard[]
  tenantBannerUrl?: string | null
}

export function HeroBanner({
  showcase,
  tenantBannerUrl,
}: HeroBannerProps = {}) {
  return (
    <section className="relative overflow-hidden bg-[var(--color-pmb-green)] text-white">
      {tenantBannerUrl ? (
        <>
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${tenantBannerUrl})` }}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-[var(--color-pmb-green)]/85 via-[var(--color-pmb-green)]/70 to-black/55"
          />
        </>
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, #C0D904 0, transparent 38%), radial-gradient(circle at 85% 75%, #F2B705 0, transparent 40%)",
          }}
        />
      )}
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-10 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
        <div className="max-w-[620px]">
          <h1 className="text-[34px] md:text-[44px] lg:text-[52px] font-bold leading-[1.08] tracking-tight">
            Aprenda uma profissão e comece a ganhar seu próprio dinheiro.
          </h1>

          <p className="mt-4 text-[16px] md:text-[18px] leading-relaxed text-white/85">
            Cursos online profissionalizantes com <strong className="font-bold text-white">certificado reconhecido</strong>.
            Estude pelo celular, pague no Pix e comece hoje mesmo —
            <span className="whitespace-nowrap"> a partir de R$ 47,00</span>.
          </p>

          <form
            role="search"
            action="/cursos"
            className="mt-6 flex items-stretch gap-0 rounded-xl bg-white p-1.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] max-w-[560px]"
          >
            <label htmlFor="hero-search" className="sr-only">
              Buscar cursos
            </label>
            <div className="flex items-center pl-3 text-[var(--color-pmb-green)]">
              <Search className="h-5 w-5" aria-hidden />
            </div>
            <input
              id="hero-search"
              name="q"
              type="search"
              placeholder="Qual profissão você quer aprender?"
              className="flex-1 bg-transparent px-3 py-3 text-[15px] text-[var(--color-pmb-green)] placeholder:text-[rgba(2,89,24,0.5)] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[15px] font-bold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-gold-600)] transition-colors whitespace-nowrap"
            >
              Buscar
            </button>
          </form>

          <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/85">
            <li className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green)] text-[10px] font-black">
                ✓
              </span>
              Certificado incluso
            </li>
            <li className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green)] text-[10px] font-black">
                ✓
              </span>
              Pagamento no Pix
            </li>
            <li className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green)] text-[10px] font-black">
                ✓
              </span>
              7 dias de garantia
            </li>
            <li className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green)] text-[10px] font-black">
                ✓
              </span>
              Suporte no WhatsApp
            </li>
          </ul>
        </div>

        <div className="relative hidden lg:block">
          <ShowcaseCards cards={showcase} />
        </div>
      </div>
    </section>
  )
}
