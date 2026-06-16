import Link from "next/link"
import { ejaRedirectHref } from "@/lib/catalog/eja-redirect"

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
 * É propositalmente MAIS LARGA que a grade de cursos (full-bleed, até 2048px),
 * para destacar do restante da home. O clique abre, em nova guia, a tela
 * intermediária `/eja/ir` (loading "EJA Mais Brasil") que valida e redireciona
 * para o destino externo — mesma lógica da seção Cursos Técnicos.
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
    <section className="bg-white py-6 md:py-8">
      {/* Full-bleed: sem padding lateral e limitado à largura natural da arte
          (2048px), centralizado. Fica mais largo que a grade (max 1280px). */}
      <Link
        href={ejaRedirectHref(url)}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-auto block w-full max-w-[2048px] overflow-hidden transition hover:opacity-95"
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
    </section>
  )
}
