// Helpers para montar URLs no esquema multi-dominio:
//   - App (institucional + admin + painel) → NEXT_PUBLIC_APP_DOMAIN
//   - Vitrines (subdominios de revenda)    → NEXT_PUBLIC_VITRINE_DOMAIN
// Sempre usar esses helpers em vez de concatenar strings com nomes de dominio.

const FALLBACK_APP_DOMAIN = "profissionalizamaisbrasil.com.br"
const FALLBACK_VITRINE_DOMAIN = "livrecursos.com.br"

export function appDomain(): string {
  return process.env.NEXT_PUBLIC_APP_DOMAIN ?? FALLBACK_APP_DOMAIN
}

export function vitrineDomain(): string {
  return process.env.NEXT_PUBLIC_VITRINE_DOMAIN ?? FALLBACK_VITRINE_DOMAIN
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? `https://${appDomain()}`
}

// Host (sem protocolo) da vitrine de um tenant a partir do slug.
// Ex: vitrineHost("joao") → "joao.livrecursos.com.br"
export function vitrineHost(slug: string): string {
  return `${slug}.${vitrineDomain()}`
}

// URL completa (com https) da vitrine.
export function vitrineUrl(slug: string): string {
  return `https://${vitrineHost(slug)}`
}

// Alvo CNAME que revendedores apontam ao usar dominio custom.
// Convencao: o CNAME pertence ao dominio de vitrines.
export function cnameTarget(): string {
  return `cname.${vitrineDomain()}`
}
