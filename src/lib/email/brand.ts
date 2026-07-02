// Identidade de marca usada nos emails (header, rodapé e remetente).
//
// Regra de ouro: emails disparados no contexto de uma revenda (unidade) NUNCA
// devem exibir a marca/dados da Profissionaliza Mais Brasil — logo, domínio,
// nome ou "via PMB". Use `tenantEmailBrand()` para montar a marca da unidade e
// passe o `EmailBrand` resultante para o template/layout.
//
// Este módulo é "puro" (sem Prisma) de propósito: ele é importado pelos
// templates React Email e precisa rodar no preview (`email dev`). O carregamento
// a partir do banco fica em `./tenant-brand` (importa Prisma, só no servidor).

import {
  activeCustomDomain,
  appDomain,
  appUrl,
  vitrineHost,
  vitrineUrl,
} from "@/lib/tenant/urls"

export interface EmailBrand {
  /** Nome exibido no header (wordmark) e no rodapé. */
  name: string
  /**
   * URL da logo. Quando ausente (`null`), o header mostra o nome da loja como
   * wordmark textual — nunca caímos na logo da PMB para uma revenda.
   */
  logoUrl: string | null
  /** URL do site da loja (link do rodapé). `null` esconde o link. */
  siteUrl: string | null
  /** Host exibido no rodapé (sem protocolo). `null` esconde o link. */
  siteLabel: string | null
  /** Email para onde as respostas devem ir (reply-to). */
  replyTo: string | null
  /** `true` apenas para a marca institucional PMB. */
  isPmb: boolean
}

/** Marca institucional da Profissionaliza Mais Brasil (default/fallback). */
export const PMB_EMAIL_BRAND: EmailBrand = {
  name: "Profissionaliza Mais Brasil",
  logoUrl: `${appUrl()}/images/logo.png`,
  siteUrl: appUrl(),
  siteLabel: appDomain(),
  replyTo: null,
  isPmb: true,
}

export interface TenantBrandRow {
  slug: string
  name?: string | null
  logoUrl?: string | null
  customDomain?: string | null
  // O dominio proprio so entra nos links do email quando ja verificado
  // (apontado). Sem esta flag (ou false), o email usa o subdominio oficial.
  domainVerified?: boolean | null
  supportEmail?: string | null
}

/** Monta a identidade de marca de uma unidade (revenda) para emails. */
export function tenantEmailBrand(tenant: TenantBrandRow): EmailBrand {
  // Usa o dominio proprio APENAS quando aplicado (DNS apontado + verificado);
  // enquanto pendente, os links do email apontam para o subdominio oficial.
  const domain = activeCustomDomain(tenant)
  const siteUrl = domain ? `https://${domain}` : vitrineUrl(tenant.slug)
  const siteLabel = domain ?? vitrineHost(tenant.slug)
  return {
    name: tenant.name?.trim() || `Loja ${tenant.slug}`,
    logoUrl: tenant.logoUrl?.trim() || null,
    siteUrl,
    siteLabel,
    replyTo: tenant.supportEmail?.trim() || null,
    isPmb: false,
  }
}

/**
 * Marca a partir de uma linha de tenant possivelmente nula. `null` (vitrine
 * PMB / matrícula sem tenant) → marca institucional PMB.
 */
export function emailBrandFromTenantRow(
  tenant: TenantBrandRow | null | undefined,
): EmailBrand {
  return tenant ? tenantEmailBrand(tenant) : PMB_EMAIL_BRAND
}

/**
 * Endereço de envio "base" (sem nome de exibição), lido do SMTP_FROM/SMTP_USER.
 * Mantém o domínio verificado da PMB — só o nome de exibição muda por unidade.
 */
function baseSendingAddress(): string | null {
  const raw = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? null
  if (!raw) return null
  const match = raw.match(/<([^>]+)>/)
  return (match ? match[1] : raw).trim()
}

/**
 * Header `From` personalizado com o nome da loja, preservando o endereço
 * (caixa SMTP) verificado da PMB. Retorna `undefined` para a marca PMB ou
 * quando não há endereço base — nesses casos o envio usa o default.
 */
export function emailFromForBrand(brand: EmailBrand): string | undefined {
  if (brand.isPmb) return undefined
  const address = baseSendingAddress()
  if (!address) return undefined
  // Sanitiza o nome de exibição: aspas/quebras quebrariam o header.
  const displayName = brand.name.replace(/["\r\n]/g, " ").trim()
  return `${displayName} <${address}>`
}
