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

// Hosts sob os quais o checkout do SISTEMA MÃE (PMB) pode operar. As vendas de
// uma revenda usam /api/loja/checkout com o gateway (MP/Asaas) da própria
// unidade; o checkout PMB (/api/checkout, conta Asaas/MP da marca master) JAMAIS
// pode rodar sob o domínio de uma revenda — subdomínio {slug}.livrecursos.com.br
// ou domínio próprio. Se isso acontecer (ex.: proxy em fail-open por falha
// transitória ao resolver o custom domain serve o site PMB sob o domínio da
// unidade), a venda do revendedor cai no gateway da PMB. Esta allow-list é a
// defesa em profundidade que fecha esse vazamento de receita.
export function isPmbAppHost(host: string | null | undefined): boolean {
  if (!host) return false
  const h = host.split(":")[0].trim().toLowerCase()
  if (!h) return false

  const allowed = new Set(
    [appDomain(), FALLBACK_APP_DOMAIN].flatMap((d) => {
      const apex = apexDomain(d)
      return [apex, `www.${apex}`]
    }),
  )
  if (allowed.has(h)) return true

  // Dev local e preview deploys (Vercel) — o checkout PMB precisa funcionar lá.
  if (h === "localhost" || h.endsWith(".localhost")) return true
  if (h.endsWith(".vercel.app")) return true

  return false
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

// IP do registro A que revendedores apontam no APEX (@) do dominio proprio.
// CNAME no apex e proibido pela RFC do DNS e o Registro.br nao aceita nome
// vazio/@ em CNAME — por isso o apex usa um registro A para o IP fixo da Vercel.
// O `www` continua via CNAME (cnameTarget), que e valido em subdominio.
//
// Default = 216.198.79.1, o IP apex recomendado atualmente pela Vercel (mesmo
// que o `cname.livrecursos.com.br` resolve hoje). O IP legado 76.76.21.21
// CONTINUA roteando para a Vercel, entao dominios ja apontados nele seguem
// funcionando sem precisar mudar o DNS. Configuravel via VERCEL_APEX_IP.
export function vercelApexIp(): string {
  return process.env.VERCEL_APEX_IP ?? "216.198.79.1"
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
