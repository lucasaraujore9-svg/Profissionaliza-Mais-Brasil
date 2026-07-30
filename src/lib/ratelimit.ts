import { Redis } from "@upstash/redis"
import { Ratelimit } from "@upstash/ratelimit"
import { contextLogger } from "@/lib/logger"

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN
const isProd = process.env.NODE_ENV === "production"

const redis = url && token ? new Redis({ url, token }) : null

// Fail-closed em produção sem Redis: ver checagem dentro de rateLimit/rateLimitByKey.
// Antes essa guarda era um throw em tempo de import, mas isso quebra o
// `next build` (page-data collection) na Vercel — o assertEnv em
// instrumentation.ts já cobre o boot. Aqui só formalizamos o request-time deny.

interface LimiterConfig {
  /** Identificador unico do bucket. */
  name: string
  /** Numero maximo de requests na janela. */
  limit: number
  /** Janela em segundos. */
  windowSec: number
  /**
   * Se true, LIBERA (fail-open) quando o Redis estiver indisponível, em vez de
   * negar. Usado nos fluxos de AUTH (login/forgot/reset): uma queda do Upstash
   * não pode trancar o login de todos os usuários. Demais buckets continuam
   * fail-closed em prod (protege endpoints públicos abusáveis).
   */
  failOpen?: boolean
}

const limiters = new Map<string, Ratelimit>()

function getLimiter(config: LimiterConfig): Ratelimit | null {
  if (!redis) return null
  const cached = limiters.get(config.name)
  if (cached) return cached
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSec} s`),
    analytics: false,
    prefix: `rl:${config.name}`,
  })
  limiters.set(config.name, limiter)
  return limiter
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  limit: number
  retryAfterSec: number
}

/**
 * Aplica rate limit baseado em IP + bucket nominal. Se o Redis nao estiver
 * configurado (dev local, fallback), libera silenciosamente.
 */
export async function rateLimit(
  request: Request,
  config: LimiterConfig,
): Promise<RateLimitResult> {
  const limiter = getLimiter(config)
  if (!limiter) {
    // Redis indisponível. Buckets de auth (failOpen) LIBERAM para não trancar o
    // login durante outage do Upstash; demais buckets negam em prod (protege
    // endpoints públicos). Em dev tudo libera.
    const allow = config.failOpen ? true : !isProd
    return {
      ok: allow,
      remaining: 0,
      limit: config.limit,
      retryAfterSec: allow ? 0 : 60,
    }
  }

  const ip = ipFrom(request)
  const key = `${config.name}:${ip}`
  return runLimit(limiter, key, config)
}

/**
 * Aplica rate limit a partir de uma chave arbitrária (já contendo IP/identifier).
 * Útil para Server Components onde o `Request` não está disponível diretamente
 * — passe o IP extraído via `headers()` ou outro identificador estável.
 */
export async function rateLimitByKey(
  identifier: string,
  config: LimiterConfig,
): Promise<RateLimitResult> {
  const limiter = getLimiter(config)
  if (!limiter) {
    // Ver explicação em rateLimit(): auth = fail-open; resto = fail-closed em prod.
    const allow = config.failOpen ? true : !isProd
    return {
      ok: allow,
      remaining: 0,
      limit: config.limit,
      retryAfterSec: allow ? 0 : 60,
    }
  }

  const key = `${config.name}:${identifier}`
  return runLimit(limiter, key, config)
}

/**
 * Executa `limiter.limit` tratando FALHA do comando Redis (não só Redis
 * ausente). Quando o Upstash erra — tipicamente cota mensal estourada (`ERR max
 * requests limit exceeded`) — `limiter.limit` REJEITA. Sem este catch, a
 * exceção subia e derrubava a rota chamadora com 500. Em especial, isso fazia o
 * `/api/internal/resolve-tenant` responder 500 → o proxy caia em fail-open e
 * servia a PMB sob o domínio da revenda (personalização "sumida").
 *
 * Na falha aplicamos a MESMA política do Redis-ausente: failOpen libera; demais
 * negam em prod (graceful 429 em vez de 500).
 */
async function runLimit(
  limiter: Ratelimit,
  key: string,
  config: LimiterConfig,
): Promise<RateLimitResult> {
  try {
    const r = await limiter.limit(key)
    return {
      ok: r.success,
      remaining: r.remaining,
      limit: r.limit,
      retryAfterSec: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)),
    }
  } catch (err) {
    contextLogger().error(
      { err, event: "ratelimit.redis_command_failed", bucket: config.name },
      "rate limiter: comando Redis falhou — aplicando política de fallback",
    )
    const allow = config.failOpen ? true : !isProd
    return {
      ok: allow,
      remaining: 0,
      limit: config.limit,
      retryAfterSec: allow ? 0 : 60,
    }
  }
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Muitas requisições. Tente novamente em alguns segundos.",
      code: "RATE_LIMITED",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec || 1),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  )
}

function ipFrom(request: Request): string {
  // Na Vercel, o proxy confiável sempre ANEXA o IP real do cliente como
  // último segmento de x-forwarded-for. Usar o primeiro segmento é inseguro
  // pois pode ser forjado pelo cliente. Preferimos x-real-ip (já sanitizado
  // pela Vercel) e, como fallback, o ÚLTIMO segmento de XFF.
  const real = request.headers.get("x-real-ip")
  if (real) return real.trim()
  const xff = request.headers.get("x-forwarded-for")
  if (xff) {
    const segments = xff.split(",")
    return segments[segments.length - 1].trim()
  }
  return "anon"
}

// Buckets pre-definidos para rotas criticas.
export const RATE_LIMITS = {
  // failOpen: auth não pode trancar se o Upstash cair (libera durante outage).
  authLogin: { name: "auth-login", limit: 8, windowSec: 60, failOpen: true },
  authForgot: { name: "auth-forgot", limit: 4, windowSec: 60, failOpen: true },
  authReset: { name: "auth-reset", limit: 6, windowSec: 60, failOpen: true },
  leads: { name: "leads", limit: 6, windowSec: 60 },
  publicCheckout: { name: "loja-checkout", limit: 10, windowSec: 60 },
  // Consulta de parcelas do cartão (MP): endpoints públicos que disparam 1
  // chamada externa ao MP por request. Rate-limit protege contra abuso/
  // enumeração de BIN/exaustão da cota MP. failOpen: o cálculo de parcela é
  // apenas enriquecimento de UX (degrada para a síntese 1..12) — uma queda do
  // Upstash não pode piorar a experiência de checkout do cliente real.
  installments: { name: "installments", limit: 20, windowSec: 60, failOpen: true },
  publicCupom: { name: "loja-cupom", limit: 20, windowSec: 60 },
  revendedorCadastro: { name: "rev-cadastro", limit: 5, windowSec: 600 },
  cobrancaPayCard: { name: "cobranca-paycard", limit: 5, windowSec: 60 },
  certificateValidate: { name: "cert-validate", limit: 30, windowSec: 60 },
  alunoVerificarPagamento: { name: "aluno-verificar-pag", limit: 6, windowSec: 60 },
  // "Verificar pagamento" da gestão (unidade e sistema mãe): cada clique é 1+
  // consulta ao gateway da venda (MP ou Asaas da conta dona). Limite por
  // OPERADOR, mais folgado que o do aluno porque o atendimento verifica várias
  // cobranças em sequência ao destravar uma fila.
  gestaoVerificarPagamento: { name: "gestao-verificar-pag", limit: 20, windowSec: 60 },
  // Estado do webhook na conta Asaas da unidade: 1 chamada externa por request,
  // disparada ao abrir a aba de gateway. failOpen porque é diagnóstico — se o
  // Upstash cair, é melhor mostrar o estado real do que esconder a tela.
  asaasWebhookStatus: {
    name: "asaas-wh-status",
    limit: 20,
    windowSec: 60,
    failOpen: true,
  },
  // Registro/reparo do webhook: escreve na conta do gateway (cria o webhook e
  // ROTACIONA o token). Mais apertado — repetir em rajada só rotaciona token à toa.
  asaasWebhookEnsure: { name: "asaas-wh-ensure", limit: 5, windowSec: 60 },
  // Reenvio dos dados de acesso à plataforma de aulas (por aluno logado): cada
  // chamada dispara 1 leitura na EA + 1 e-mail. Janela longa para não virar
  // ferramenta de flood na caixa do próprio aluno.
  alunoCredenciaisPlataforma: {
    name: "aluno-cred-plataforma",
    limit: 3,
    windowSec: 900,
  },
  // Troca de senha na plataforma de aulas (por aluno logado): 2 idas à EA por
  // chamada (escrever + reler para conferir). A EA hoje sempre recusa a troca,
  // então repetir só queima cota externa.
  alunoSenhaPlataforma: {
    name: "aluno-senha-plataforma",
    limit: 5,
    windowSec: 900,
  },
  upload: { name: "upload", limit: 10, windowSec: 60 },
  // Banco de artes (SUPER_ADMIN only): mais folgado que `upload` para nao
  // estrangular a migracao do acervo (upload multi-file em lote).
  artesUpload: { name: "artes-upload", limit: 30, windowSec: 60 },
  // Automacao
  lojaLeads: { name: "loja-leads", limit: 5, windowSec: 60 },
  lojaLeadsByEmail: { name: "loja-leads-email", limit: 3, windowSec: 3600 },
  waSend: { name: "wa-send", limit: 20, windowSec: 60 },
  // Tracking de navegacao: generoso (page views sao frequentes) e failOpen
  // para jamais bloquear a navegacao do visitante por causa do Upstash.
  lojaTrack: { name: "loja-track", limit: 80, windowSec: 60, failOpen: true },
} as const
