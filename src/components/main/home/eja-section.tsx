import Link from "next/link"

interface EjaSectionProps {
  /** Usado como texto alternativo da imagem (acessibilidade). */
  label: string
  /** Link de destino (página personalizada de EJA). Sem URL, a seção é omitida. */
  url?: string | null
  /** Imagem do banner (desktop), padronizada pela PMB. Sem imagem, a seção é omitida. */
  bannerImageUrl?: string | null
  /** Imagem do banner para mobile. Cai no desktop quando vazia. */
  bannerImageUrlMobile?: string | null
}

/**
 * Seção "EJA" da home — apenas a imagem do banner, clicável, sem textos por
 * cima nem overlay/escurecimento. A imagem é exibida inteira (largura total,
 * altura automática) para não cortar. Versões separadas para desktop e mobile
 * (padronizadas pela PMB); o link de destino é o do escopo (PMB ou unidade).
 *
 * Abre em nova guia. Como a URL é definida pelo admin/unidade (origem confiável),
 * o link aponta direto para o destino.
 */
export function EjaSection({
  label,
  url,
  bannerImageUrl,
  bannerImageUrlMobile,
}: EjaSectionProps) {
  const desktop = bannerImageUrl?.trim() || null
  const mobile = bannerImageUrlMobile?.trim() || desktop
  // Banner é só imagem: sem imagem ou sem link, não há o que mostrar.
  if (!url || !desktop) return null

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 md:py-8">
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-2xl transition hover:opacity-95"
        >
          {/* Mobile (cai no desktop quando não há imagem mobile). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mobile ?? desktop}
            alt={label}
            loading="lazy"
            className="block h-auto w-full md:hidden"
          />
          {/* Desktop. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={desktop}
            alt={label}
            loading="lazy"
            className="hidden h-auto w-full md:block"
          />
        </Link>
      </div>
    </section>
  )
}
