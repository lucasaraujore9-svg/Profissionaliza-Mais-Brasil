// Helpers de host/origem para SEO multi-tenant.
//
// Em vitrines o request chega no domínio do tenant (subdomínio de
// livrecursos.com.br ou domínio próprio). Para canonical/OG/sitemap corretos
// derivamos a origem direto do header `host` do request, evitando depender de
// dados possivelmente desatualizados no banco.

import { headers } from "next/headers"
import { appDomain, vitrineDomain } from "@/lib/tenant/urls"

const RESERVED_VITRINE_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "painel",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "staging",
  "dev",
  "test",
])

function stripPort(host: string): string {
  return host.split(":")[0]
}

/** Origem (https://host) do request atual, a partir do header `host`. */
export async function getRequestOrigin(): Promise<string | null> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  if (!host) return null
  const proto =
    h.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

export interface HostClassification {
  /** "app" = PMB; "vitrine_apex" = landing livrecursos; "tenant" = vitrine. */
  kind: "app" | "vitrine_apex" | "tenant" | "unknown"
  /** slug do tenant quando kind === "tenant" e for subdomínio de vitrine. */
  slug: string | null
  host: string
}

/** Classifica o host do request (espelha src/proxy.ts, sem acesso ao DB). */
export async function classifyRequestHost(): Promise<HostClassification> {
  const h = await headers()
  const raw = h.get("x-forwarded-host") ?? h.get("host") ?? ""
  const host = stripPort(raw)
  const app = appDomain()
  const vitrine = vitrineDomain()

  if (host === app || host === `www.${app}` || host.endsWith(`.${app}`)) {
    return { kind: "app", slug: null, host: raw }
  }
  if (host === vitrine || host === `www.${vitrine}`) {
    return { kind: "vitrine_apex", slug: null, host: raw }
  }
  if (host.endsWith(`.${vitrine}`)) {
    const sub = host.slice(0, -1 * (vitrine.length + 1))
    if (RESERVED_VITRINE_SUBDOMAINS.has(sub)) {
      return { kind: "vitrine_apex", slug: null, host: raw }
    }
    return { kind: "tenant", slug: sub, host: raw }
  }
  // Domínio desconhecido → provável domínio próprio de tenant.
  return { kind: "unknown", slug: null, host: raw }
}
