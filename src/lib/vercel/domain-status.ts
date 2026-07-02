// Resolucao do estado "apontado" de um dominio proprio.
//
// Um dominio so e considerado APLICAVEL (Tenant.domainVerified = true, badge
// "Ativo" no painel) quando AS DUAS variantes — apex (registro A) e www
// (registro CNAME) — estao simultaneamente:
//   1. verificadas na Vercel (posse confirmada), E
//   2. com DNS apontado (config.misconfigured === false).
//
// Isso e o que o revendedor pede como "os 2 registros apontados". A checagem de
// posse (getProjectDomain.verified) sozinha nao garante que o DNS resolve; por
// isso cruzamos com getDomainConfig.misconfigured.

import {
  getProjectDomain,
  getDomainConfig,
  type VercelDomainStatus,
} from "./client"
import { customDomainVariants } from "@/lib/tenant/urls"

export type CustomDomainStatus = "PENDING" | "ACTIVE"

export interface DomainVerificationRecord {
  type: string
  domain: string
  value: string
  reason: string
}

export interface ResolvedCustomDomainStatus {
  // "ACTIVE" apenas quando ambas as variantes estao apontadas E verificadas.
  status: CustomDomainStatus
  // true == pronto para aplicar (equivale a status === "ACTIVE").
  pointed: boolean
  // Registros de verificacao ainda pendentes (agregados das duas variantes),
  // ou null quando nada esta pendente.
  verification: DomainVerificationRecord[] | null
}

async function variantPointed(
  domain: string,
): Promise<{ info: VercelDomainStatus; pointed: boolean }> {
  // As duas chamadas sao independentes — dispara em paralelo.
  const [info, config] = await Promise.all([
    getProjectDomain(domain),
    getDomainConfig(domain),
  ])
  return { info, pointed: info.verified && config.misconfigured === false }
}

// Consulta a Vercel e decide se o dominio proprio esta pronto para ser aplicado.
// LANCA se a Vercel falhar (o chamador trata como status "ERROR" e NAO altera a
// flag persistida).
export async function resolveCustomDomainStatus(
  customDomain: string,
): Promise<ResolvedCustomDomainStatus> {
  const variants = customDomainVariants(customDomain)
  const results = await Promise.all(variants.map((d) => variantPointed(d)))

  const pointed = results.every((r) => r.pointed)
  const verification = results.flatMap((r) =>
    r.pointed ? [] : r.info.verification ?? [],
  )

  return {
    status: pointed ? "ACTIVE" : "PENDING",
    pointed,
    verification: verification.length ? verification : null,
  }
}
