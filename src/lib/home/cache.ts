import "server-only"
import { getJson, setJson, invalidateMany } from "@/lib/redis/cache"
import { loadHomeSections, type HomeSectionRecord } from "./sections"
import { loadShowcase, type ShowcaseCard } from "@/lib/catalog/home"
import { logger } from "@/lib/logger"

/**
 * Cache de DADOS cross-request da home/vitrine (PERF-002).
 *
 * As homes (PMB e cada vitrine de revenda) são `force-dynamic` — o HTML segue
 * dinâmico. O que este módulo faz é cachear os DADOS por-escopo que TODA visita
 * re-lia do Postgres: a estrutura de seções (`loadHomeSections`) e o showcase do
 * hero (`loadShowcase`). Chave namespaceada por tenant (`home:*:{tenantId|pmb}`),
 * TTL curto (60s) como backstop de staleness, com invalidação explícita nos
 * writes de seções (ver `invalidateHomeCache` chamado em `src/lib/home/api.ts`).
 *
 * Segue o padrão de resiliência do repo (dcd03fd): os helpers Redis
 * (`getJson`/`setJson`/`invalidateMany`) já são fail-open (swallow em falha de
 * comando), então uma indisponibilidade do Upstash nunca derruba a home — cai
 * direto no Postgres.
 *
 * ESCOPO deliberado: só as leituras DETERMINÍSTICAS por-escopo são cacheadas. A
 * resolução de cursos por seção (`resolveSectionCourses`) NÃO é cacheada porque
 * o modo "random" sorteia por visita e mantém um snapshot por cookie — cacheá-la
 * mudaria esse comportamento. Assim o cache reduz carga sem congelar o sorteio.
 */

const HOME_CACHE_TTL_SECONDS = 60

function scopeKey(tenantId: string | null): string {
  return tenantId ?? "pmb"
}

function homeSectionsKey(tenantId: string | null): string {
  return `home:sections:${scopeKey(tenantId)}`
}

function showcaseKey(tenantId: string | null): string {
  return `home:showcase:${scopeKey(tenantId)}`
}

/** Estrutura de seções da home do escopo, com cache Redis (TTL 60s). */
export async function loadHomeSectionsCached(
  tenantId: string | null,
): Promise<HomeSectionRecord[]> {
  const key = homeSectionsKey(tenantId)
  try {
    const cached = await getJson<HomeSectionRecord[]>(key)
    if (cached) return cached
    const fresh = await loadHomeSections(tenantId)
    // Só grava conjunto não-vazio (evita fixar um estado transitório vazio).
    if (fresh.length > 0) await setJson(key, fresh, HOME_CACHE_TTL_SECONDS)
    return fresh
  } catch (err) {
    // Resiliência (RENDER-only): uma falha transitória do Postgres ao ler as
    // seções NÃO pode derrubar a vitrine inteira (error boundary "Não
    // conseguimos carregar a loja"). Degrada para vazio — a home renderiza só o
    // hero + rodapé — e o TTL/nova visita se recupera sozinho. Só o caminho de
    // render passa por aqui; as APIs de admin/painel usam loadHomeSections
    // direto (onde o erro deve propagar).
    logger.warn(
      { err: String(err), tenantId, event: "home.sections_cache_failed" },
      "loadHomeSectionsCached falhou; degradando para vazio",
    )
    return []
  }
}

/** Showcase (cards do hero) do escopo, com cache Redis (TTL 60s). */
export async function loadShowcaseCached(
  tenantId: string | null,
): Promise<ShowcaseCard[]> {
  const key = showcaseKey(tenantId)
  const cached = await getJson<ShowcaseCard[]>(key)
  if (cached) return cached
  const fresh = await loadShowcase(tenantId ?? undefined)
  // loadShowcase devolve [] em erro (try/catch interno) — não cacheia vazio.
  if (fresh.length > 0) await setJson(key, fresh, HOME_CACHE_TTL_SECONDS)
  return fresh
}

/**
 * Invalida o cache de home de um escopo (seções + showcase). Chamado nos writes
 * de seções (create/update/delete/reorder) — best-effort/fail-open. O TTL de 60s
 * é o backstop caso a invalidação não rode (ex.: Redis indisponível no write).
 */
export async function invalidateHomeCache(tenantId: string | null): Promise<void> {
  await invalidateMany([homeSectionsKey(tenantId), showcaseKey(tenantId)])
}
