// Builders de JSON-LD (schema.org) para SEO + GEO (Generative Engine
// Optimization). Dados estruturados ajudam tanto buscadores tradicionais
// (rich results) quanto motores generativos (ChatGPT, Gemini, Perplexity) a
// extrair fatos confiáveis sobre a plataforma, as revendas e os cursos.

import {
  SITE_NAME,
  SITE_DESCRIPTION,
  SOCIAL_PROFILES,
  GEO,
  siteUrl,
  siteLogo,
} from "@/lib/seo/site"

type JsonLd = Record<string, unknown>

/** Organização educacional do sistema mãe (PMB). Inclui sinais geográficos. */
export function organizationJsonLd(): JsonLd {
  const url = siteUrl()
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "@id": `${url}/#organization`,
    name: SITE_NAME,
    alternateName: "PMB",
    url,
    logo: siteLogo(),
    image: siteLogo(),
    description: SITE_DESCRIPTION,
    inLanguage: GEO.language,
    areaServed: { "@type": "Country", name: GEO.countryName },
    address: {
      "@type": "PostalAddress",
      addressCountry: GEO.country,
    },
    sameAs: SOCIAL_PROFILES,
  }
}

/** WebSite + SearchAction (sitelinks searchbox). */
export function webSiteJsonLd(opts?: {
  name?: string
  url?: string
  searchPath?: string
}): JsonLd {
  const url = (opts?.url ?? siteUrl()).replace(/\/$/, "")
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}/#website`,
    name: opts?.name ?? SITE_NAME,
    url,
    inLanguage: GEO.language,
  }
  if (opts?.searchPath) {
    node.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${url}${opts.searchPath}{search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    }
  }
  return node
}

/** Vitrine de revenda como Store/Organization (sistema de unidades). */
export function storeJsonLd(opts: {
  name: string
  url: string
  logo?: string | null
  description?: string | null
  sameAs?: string[]
}): JsonLd {
  const url = opts.url.replace(/\/$/, "")
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${url}/#store`,
    name: opts.name,
    url,
    inLanguage: GEO.language,
    areaServed: { "@type": "Country", name: GEO.countryName },
    description:
      opts.description ??
      `${opts.name} — cursos profissionalizantes online com certificado, em parceria com a ${SITE_NAME}.`,
  }
  if (opts.logo) {
    node.logo = opts.logo
    node.image = opts.logo
  }
  if (opts.sameAs && opts.sameAs.length > 0) node.sameAs = opts.sameAs
  return node
}

/** Curso individual (Course schema). */
export function courseJsonLd(opts: {
  name: string
  url: string
  description?: string | null
  image?: string | null
  providerName: string
  providerUrl: string
  price?: number | null
  hours?: string | null
}): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: opts.name,
    url: opts.url,
    description:
      (opts.description ?? "").trim() ||
      `Curso ${opts.name} com certificado válido em todo o Brasil.`,
    inLanguage: GEO.language,
    provider: {
      "@type": "Organization",
      name: opts.providerName,
      url: opts.providerUrl.replace(/\/$/, ""),
    },
    // hasCourseInstance descreve a oferta EAD nacional (sinal GEO + rich result).
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: opts.hours ?? undefined,
      location: {
        "@type": "VirtualLocation",
        url: opts.url,
      },
    },
  }
  if (opts.image) node.image = opts.image
  if (typeof opts.price === "number" && opts.price > 0) {
    node.offers = {
      "@type": "Offer",
      price: opts.price.toFixed(2),
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      category: "Paid",
      url: opts.url,
    }
  }
  return node
}

/** Trilha de navegação (BreadcrumbList). */
export function breadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }
}

/** Perguntas frequentes (FAQPage) — forte sinal para motores generativos. */
export function faqJsonLd(
  items: Array<{ question: string; answer: string }>,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  }
}
