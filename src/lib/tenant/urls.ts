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

// ── Dominio custom: variantes apex/www ──────────────────────────────────────
// Suportamos as DUAS variantes de um dominio proprio (com e sem `www.`). Para
// isso armazenamos sempre a forma APEX (sem `www.`) como canonica em
// Tenant.customDomain, registramos AS DUAS na Vercel (para ambas rotearem) e a
// resolucao no proxy/resolve-tenant compara o host com o `www.` removido.

// Remove o prefixo `www.` (forma apex/canonica). Ex: www.x.com → x.com
export function apexDomain(domain: string): string {
  const d = domain.trim().toLowerCase()
  return d.startsWith("www.") ? d.slice(4) : d
}

// Forma com `www.`. Ex: x.com → www.x.com (idempotente: ja-com-www permanece)
export function wwwDomain(domain: string): string {
  return `www.${apexDomain(domain)}`
}

// As duas variantes [apex, www] que devem ser anexadas na Vercel ao cadastrar
// um dominio proprio. Ex: cliente.com.br → ["cliente.com.br", "www.cliente.com.br"]
export function customDomainVariants(domain: string): [string, string] {
  const apex = apexDomain(domain)
  return [apex, `www.${apex}`]
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

// URL de notificacao do Asaas. `slug` define o tenant na query (mesma estrategia
// do MP): null/omitido = conta Asaas da PMB (mensalidades dos revendedores +
// vitrine PMB, validada pela env ASAAS_WEBHOOK_TOKEN). Com slug = conta Asaas
// PROPRIA da unidade `slug` (vendas dos cursos), validada pelo token por-tenant.
// E exatamente a URL que a unidade cola no painel Asaas dela (Webhooks). Mesmo
// host canonico do MP — evita o 307 do apex que dropa a entrega.
export function asaasWebhookUrl(slug?: string | null): string {
  const base = `${webhookBaseUrl()}/api/webhooks/asaas`
  return slug ? `${base}?tenant=${slug}` : base
}
