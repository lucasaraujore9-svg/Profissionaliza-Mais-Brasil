import Link from "next/link"
import { ArrowRight, GraduationCap, ShieldCheck } from "lucide-react"

interface EjaSectionProps {
  label: string
  /** Link de destino (página personalizada de EJA). Sem URL, a seção é omitida. */
  url?: string | null
  /** Imagem do banner padronizada pela PMB. Null => fundo em gradiente. */
  bannerImageUrl?: string | null
}

/**
 * Seção "EJA" da home — banner único com link para a página personalizada de
 * EJA (Ensino para Jovens e Adultos). Diferente da seção "Cursos Técnicos", NÃO
 * tem grade de cursos: é só um banner clicável.
 *
 * A imagem é padronizada pela PMB (herdada por toda a rede); o link de destino é
 * o da própria unidade (Tenant.ejaUrl) ou o do site PMB (SystemSettings.ejaUrl).
 * Sem URL configurada não há para onde redirecionar — a seção é omitida.
 *
 * Abre em nova guia. Como a URL é definida pelo admin/unidade (origem confiável),
 * o link aponta direto para o destino (sem tela intermediária como a Técnica).
 */
export function EjaSection({ label, url, bannerImageUrl }: EjaSectionProps) {
  if (!url) return null

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-3xl bg-gradient-to-br from-[#013d10] via-[var(--color-pmb-green,#025918)] to-[#013d10] shadow-[0_30px_60px_-30px_rgba(2,89,24,0.5)] transition hover:-translate-y-0.5"
        >
          {/* Imagem de fundo padronizada (se houver) + véu escuro p/ legibilidade. */}
          {bannerImageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bannerImageUrl}
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-60 transition duration-500 group-hover:scale-105"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-r from-[#013d10]/90 via-[#013d10]/70 to-transparent"
              />
            </>
          )}
          {/* Glow decorativo dourado (sem imagem o banner não fica chapado). */}
          {!bannerImageUrl && (
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--color-pmb-gold,#F2B705)] opacity-25 blur-3xl"
            />
          )}

          <div className="relative flex flex-col gap-5 p-6 sm:p-8 md:flex-row md:items-center md:justify-between md:p-12">
            <div className="max-w-[640px]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-pmb-gold,#F2B705)] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#013d10]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Certificação reconhecida
              </span>
              <h2 className="mt-4 flex items-center gap-2 text-[26px] font-black leading-[1.08] tracking-tight text-white sm:text-[32px] md:text-[38px]">
                <GraduationCap className="hidden h-8 w-8 shrink-0 text-[var(--color-pmb-gold,#F2B705)] sm:block" aria-hidden />
                {label}
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-white/80 md:text-[15px]">
                Conclua o ensino fundamental ou médio no seu ritmo, com
                certificado válido em todo o Brasil. Conheça as turmas
                disponíveis e dê o próximo passo na sua jornada.
              </p>
            </div>

            <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-[var(--color-pmb-gold,#F2B705)] px-5 py-3 text-[14px] font-black text-[#013d10] transition group-hover:bg-white md:self-center">
              Saiba mais
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </div>
        </Link>
      </div>
    </section>
  )
}
