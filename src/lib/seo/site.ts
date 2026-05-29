// Constantes de SEO/GEO do sistema mãe (PMB) e da landing de revendas.
// Centraliza identidade, descrição, sinais geográficos (Brasil) e dados da
// organização usados tanto em <meta> quanto em JSON-LD (schema.org).
//
// "GEO" aqui cobre os dois sentidos pedidos:
//   - Generative Engine Optimization (IA): dados factuais estruturados,
//     JSON-LD rico e liberação de crawlers de IA (ver robots.ts / llms.txt).
//   - SEO geográfico/local: areaServed = Brasil, inLanguage pt-BR e
//     meta tags geo.* para reforçar o alcance nacional.

import { appUrl, appDomain, vitrineDomain } from "@/lib/tenant/urls"

export const SITE_NAME = "Profissionaliza Mais Brasil"
export const SITE_SHORT_NAME = "PMB"

export const SITE_DESCRIPTION =
  "Cursos profissionalizantes online com certificado reconhecido nacionalmente. Estude pelo celular, pague no Pix e ganhe uma profissão no seu ritmo."

export const SITE_KEYWORDS = [
  "cursos profissionalizantes",
  "cursos online",
  "cursos com certificado",
  "curso profissionalizante online",
  "certificado reconhecido",
  "educação a distância",
  "cursos EAD",
  "qualificação profissional",
  "cursos online Brasil",
]

// Sinais geográficos (SEO local/nacional).
export const GEO = {
  country: "BR",
  countryName: "Brasil",
  region: "BR",
  placename: "Brasil",
  language: "pt-BR",
  ogLocale: "pt_BR",
} as const

// Redes sociais oficiais (entram em sameAs do JSON-LD). Ajuste conforme os
// perfis reais forem confirmados.
export const SOCIAL_PROFILES: string[] = [
  "https://www.instagram.com/profissionalizamaisbrasil",
  "https://www.facebook.com/profissionalizamaisbrasil",
]

export function siteUrl(): string {
  return appUrl().replace(/\/$/, "")
}

export function siteOgImage(): string {
  return `${siteUrl()}/icons/icon-512.png`
}

// Logo absoluto (usado em JSON-LD; logos relativos não são aceitos por alguns
// validadores de schema).
export function siteLogo(): string {
  return `${siteUrl()}/icons/icon-512.png`
}

export { appDomain, vitrineDomain }
