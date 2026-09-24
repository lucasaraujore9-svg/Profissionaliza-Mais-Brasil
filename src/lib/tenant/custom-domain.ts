// Dominio proprio da unidade: RAIZ (msoluti.shop) ou SUBDOMINIO (ead.msoluti.shop).
//
// Os dois pedem DNS diferente, e tratar subdominio como raiz ensinava a unidade
// a apontar o dominio PRINCIPAL dela (A em "@" + CNAME em "www"), derrubando o
// site que ela ja tem ali — e ainda exigia um `www.ead.msoluti.shop` que ninguem
// cria, entao o subdominio nunca chegava a "Ativo".
//
//   raiz       → A "@" → IP da Vercel  +  CNAME "www" → cname.livrecursos.com.br
//   subdominio → CNAME "<prefixo>" → cname.livrecursos.com.br (so ele)
//
// Separado de urls.ts de proposito: a lista de sufixos publicos (tldts) pesa, e
// urls.ts e importado pelo proxy e por componentes client.

import { parse } from "tldts"
import { apexDomain, cnameTarget, vercelApexIp } from "./urls"

export type CustomDomainKind = "apex" | "subdomain"

export interface CustomDomainDnsRecord {
  type: "A" | "CNAME"
  name: string
  value: string
}

// Decide pela lista de sufixos publicos: "x.com.br" e raiz (com.br e sufixo),
// "ead.x.shop" nao. Contar pontos erraria nos dois sentidos.
export function customDomainKind(domain: string): CustomDomainKind {
  const d = apexDomain(domain)
  const { domain: registrable } = parse(d)
  return !registrable || registrable === d ? "apex" : "subdomain"
}

// Hosts que precisam estar anexados e apontados na Vercel. Canonico primeiro.
export function customDomainVariants(domain: string): string[] {
  const d = apexDomain(domain)
  return customDomainKind(d) === "apex" ? [d, `www.${d}`] : [d]
}

// Registros que a unidade cria no provedor de DNS. No subdominio o "Nome" e o
// prefixo relativo a zona (Registro.br, Hostinger, GoDaddy completam o resto).
export function customDomainDnsRecords(domain: string): CustomDomainDnsRecord[] {
  const d = apexDomain(domain)
  if (customDomainKind(d) === "apex") {
    return [
      { type: "A", name: "@", value: vercelApexIp() },
      { type: "CNAME", name: "www", value: cnameTarget() },
    ]
  }
  return [{ type: "CNAME", name: parse(d).subdomain ?? d, value: cnameTarget() }]
}
