import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { TRACKING_CSP, trackingOrigins, type ProviderOrigins } from "./csp"
import { TRACKING_PROVIDERS } from "./schema"

/**
 * Invariante da CSP dos pixels de rastreamento.
 *
 * O modo de falhar aqui é traiçoeiro: um pixel bloqueado pela CSP não dá erro
 * visível para ninguém que importe. O revendedor salva o ID, a tela confirma, e
 * o evento simplesmente nunca chega ao gerenciador de anúncios — o problema só
 * aparece semanas depois, como "minha campanha não otimiza". Foi assim que o
 * pixel da Meta ficou morto em todas as vitrines.
 *
 * Estes testes acoplam o código que CARREGA os scripts (snippets.ts) à lista que
 * os PERMITE (csp.ts): adicionar um provedor sem liberar o domínio dele quebra
 * aqui, e não em produção.
 */

const SNIPPETS = readFileSync(join(process.cwd(), "src/lib/tracking/snippets.ts"), "utf8")

/** Casa um host contra uma origem de CSP, respeitando o curinga de subdomínio. */
function originMatches(origin: string, host: string): boolean {
  const originHost = origin.replace(/^[a-z]+:\/\//, "")
  if (originHost.startsWith("*.")) {
    const suffix = originHost.slice(1) // ".hotjar.com"
    return host.endsWith(suffix)
  }
  return originHost === host
}

/** Hosts externos que os snippets baixam (inclui a URL sem esquema do Bing). */
function hostsCarregadosPelosSnippets(): string[] {
  const out = new Set<string>()
  for (const m of SNIPPETS.matchAll(/(?:https:)?\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    out.add(m[1].toLowerCase())
  }
  return [...out]
}

describe("CSP dos pixels de rastreamento", () => {
  it("libera o script de todo host que os snippets carregam", () => {
    const permitidos = trackingOrigins("script")
    const bloqueados = hostsCarregadosPelosSnippets().filter(
      (host) => !permitidos.some((origin) => originMatches(origin, host)),
    )
    expect(bloqueados).toEqual([])
  })

  it("cobre os hosts conhecidos de cada provedor", () => {
    // Trava de sanidade do próprio teste acima: se o regex parar de extrair os
    // hosts, `bloqueados` fica vazio e aquele teste passa sem verificar nada.
    const hosts = hostsCarregadosPelosSnippets()
    expect(hosts).toContain("connect.facebook.net")
    expect(hosts).toContain("www.googletagmanager.com")
    expect(hosts).toContain("analytics.tiktok.com")
    expect(hosts).toContain("bat.bing.com")
    expect(hosts.length).toBeGreaterThanOrEqual(8)
  })

  it("dá a todo provedor do formulário pelo menos uma origem de script", () => {
    // Sem script-src o loader nem baixa: o pixel está morto por completo, não
    // apenas sem eventos.
    const semScript = TRACKING_PROVIDERS.filter(
      (p) => (TRACKING_CSP[p.key].script ?? []).length === 0,
    ).map((p) => p.label)
    expect(semScript).toEqual([])
  })

  it("dá a todo provedor um caminho de envio de evento", () => {
    // connect-src (fetch/beacon) OU img-src (beacon 1x1) — os provedores usam um
    // ou outro conforme o navegador. Nenhum dos dois = pixel carrega e não
    // reporta, que é o estado enganoso que motivou este arquivo.
    const semEnvio = TRACKING_PROVIDERS.filter((p) => {
      const o: ProviderOrigins = TRACKING_CSP[p.key]
      return (o.connect ?? []).length === 0 && (o.img ?? []).length === 0
    }).map((p) => p.label)
    expect(semEnvio).toEqual([])
  })

  it("junta as origens sem repetir e em ordem estável", () => {
    // Diretiva repetida no header é ignorada pelo navegador (vale a primeira),
    // então tudo precisa sair numa lista só; a ordem fixa mantém o header
    // diffável entre builds.
    const script = trackingOrigins("script")
    expect(script).toEqual([...new Set(script)])
    expect(script).toEqual([...script].sort())
    // O Google compartilha o googletagmanager.com entre GA4, Ads e GTM — é o
    // caso real de deduplicação.
    expect(script.filter((o) => o === "https://www.googletagmanager.com")).toHaveLength(1)
  })

  it("mantém o wss:// do Hotjar, que https:// não cobre", () => {
    // A gravação de sessão do Hotjar sobe por WebSocket. connect-src casa por
    // ESQUEMA: liberar https://*.hotjar.com não libera wss://*.hotjar.com.
    expect(trackingOrigins("connect")).toContain("wss://*.hotjar.com")
  })
})
