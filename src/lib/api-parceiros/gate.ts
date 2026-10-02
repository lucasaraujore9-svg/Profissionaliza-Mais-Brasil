import { authenticateApiKey, type AuthenticatedApiKey } from "./keys"
import { apiFail } from "./response"
import type { ApiScope } from "./scopes"
import { rateLimit, rateLimitByKey } from "@/lib/ratelimit"

/** Resposta 429 padronizada — mesma forma para o teto por IP e o por chave. */
function limiteExcedido(retryAfterSec: number, limit: number): Response {
  return apiFail("Limite de requisições excedido. Tente novamente em instantes.", {
    status: 429,
    code: "RATE_LIMITED",
    details: { retryAfterSec, limit },
  })
}

/**
 * Portaria de toda rota /api/v1 que exige escopo: teto por IP, chave + escopo,
 * teto por chave. Uma sequência só, para as rotas não divergirem entre si.
 */
export async function autenticarParceiro(
  request: Request,
  scope: ApiScope,
  limitePorMinuto: number,
): Promise<{ ok: true; key: AuthenticatedApiKey } | { ok: false; response: Response }> {
  // Teto por IP ANTES de autenticar. O limite por chave abaixo só existe depois
  // que a chave é válida, então sozinho ele deixa o tráfego NÃO autenticado
  // (chave errada, varredura em busca de uma válida) passar sem nenhum freio —
  // e cada tentativa custa um lookup no Postgres. Este bucket é generoso o
  // bastante para não atrapalhar um parceiro real atrás de NAT e apertado o
  // bastante para tornar a varredura inviável.
  const porIp = await rateLimit(request, {
    name: "api-v1-parceiros-ip",
    limit: 300,
    windowSec: 60,
  })
  if (!porIp.ok) return { ok: false, response: limiteExcedido(porIp.retryAfterSec, porIp.limit) }

  const auth = await authenticateApiKey(request, scope)
  if (!auth.ok) return auth

  // Rate-limit POR CHAVE (não por IP): o parceiro pode chamar de uma frota de
  // servidores, e o limite pertence ao contrato dele, não à máquina de saída.
  // Bucket por ESCOPO: criar unidade tem teto bem menor que consultar.
  //
  // failOpen: quem chegou aqui JÁ provou ter uma chave válida, então este teto é
  // proteção de capacidade, não de segurança — e o teto por IP acima continua
  // valendo. Sem failOpen, uma queda do Upstash (a cota já estourou neste
  // projeto) viraria "0 requisição para todo mundo": 429 em 100% das chamadas de
  // todos os integradores por causa de um incidente de cache.
  const rl = await rateLimitByKey(auth.key.id, {
    name: scope === "unidades.read" ? "api-v1-parceiros" : `api-v1-parceiros-${scope}`,
    limit: limitePorMinuto,
    windowSec: 60,
    failOpen: true,
  })
  if (!rl.ok) return { ok: false, response: limiteExcedido(rl.retryAfterSec, rl.limit) }

  return auth
}
