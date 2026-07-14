// Garantia de certificado TLS para dominios proprios de revenda.
//
// Contexto (incidente vanguardacursos, 2026-07): o dominio foi anexado ao
// projeto antes do revendedor apontar o DNS. A Vercel so emite o certificado
// automaticamente quando o DNS ja aponta no momento do anexo — apontou depois,
// a emissao pode nunca acontecer. Sem cert o https nao abre (handshake
// resetado) e o navegador cai no http. Ate o fix do proxy (self-fetch via host
// canonico) isso ainda fazia o site PMB inteiro ser servido sob o dominio da
// revenda.
//
// Este modulo reconcilia: para cada variante (apex + www) do dominio, se nao
// existe cert e o DNS aponta, emite um cert single-CN. Single-CN de proposito:
// emitir um multi-SAN [apex, www] falharia por inteiro se apenas UMA variante
// estivesse apontada (http-01 exige cada CN resolvendo).

import { getDomainConfig, issueCert, listCertsForDomain } from "./client"
import { customDomainVariants } from "@/lib/tenant/urls"

export type EnsureCertOutcome =
  // Todas as variantes ja tinham cert — nada a fazer.
  | "ok"
  // Pelo menos uma variante estava sem cert e a emissao foi disparada.
  | "issued"
  // Variante(s) sem cert mas com DNS ainda nao apontado — emissao adiada
  // (o cron diario tenta de novo; o botao "verificar" do painel tambem).
  | "dns_pending"
  // Erro na Vercel (consulta ou emissao) em alguma variante.
  | "failed"

export interface EnsureCertResult {
  domain: string
  outcome: EnsureCertOutcome
  // Por variante: o que aconteceu (para o retorno do cron ser auditavel).
  variants: Array<{
    host: string
    action: "has_cert" | "issued" | "dns_pending" | "failed"
    detail?: string
  }>
}

export async function ensureCustomDomainCert(
  customDomain: string,
): Promise<EnsureCertResult> {
  const variants = customDomainVariants(customDomain)

  const results = await Promise.all(
    variants.map(async (host): Promise<EnsureCertResult["variants"][number]> => {
      try {
        const certs = await listCertsForDomain(host)
        if (certs.length > 0) return { host, action: "has_cert" }

        const config = await getDomainConfig(host)
        if (config.misconfigured) return { host, action: "dns_pending" }

        await issueCert([host])
        return { host, action: "issued" }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return { host, action: "failed", detail }
      }
    }),
  )

  const outcome: EnsureCertOutcome = results.some((r) => r.action === "failed")
    ? "failed"
    : results.some((r) => r.action === "issued")
      ? "issued"
      : results.some((r) => r.action === "dns_pending")
        ? "dns_pending"
        : "ok"

  return { domain: customDomain, outcome, variants: results }
}
