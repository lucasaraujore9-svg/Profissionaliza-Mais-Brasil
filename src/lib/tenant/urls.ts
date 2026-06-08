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

// Base canonica para webhooks de gateways (Mercado Pago).
//
// O apex (profissionalizamaisbrasil.com.br) responde 307 -> www e o Mercado
// Pago NAO segue redirect ao entregar webhook — a notificacao se perde. Por
// isso forcamos o host canonico `www.` quando o host configurado for exatamente
// o apex. Nao mexe em previews (*.vercel.app), localhost ou hosts ja com www.
export function webhookBaseUrl(): string {
  const u = new URL(appUrl())
  if (u.host === appDomain()) {
    u.host = `www.${appDomain()}`
  }
  return u.origin
}

// URL de notificacao do Mercado Pago. `slug` define o tenant na query —
// null/omitido = vitrine PMB (sem ?tenant). E exatamente o valor que enviamos
// em `notification_url` ao criar a preference/preapproval, e o mesmo que a
// unidade cola no painel MP (Webhooks) para gerar a chave secreta.
export function mpWebhookUrl(slug?: string | null): string {
  const base = `${webhookBaseUrl()}/api/webhooks/mercadopago`
  return slug ? `${base}?tenant=${slug}` : base
}

// URL de notificacao do Asaas (gateway da vitrine PMB e mensalidades dos
// revendedores). Mesmo host canonico do MP — evita o 307 do apex.
export function asaasWebhookUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/asaas`
}
