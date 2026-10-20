import { createHash, createHmac } from "node:crypto"
import { redis } from "@/lib/redis"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { getRequestContext } from "@/lib/observability/request-context"
import { swallow } from "@/lib/errors"

/**
 * Trava contra TESTE DE CARTAO no checkout publico.
 *
 * Em 20/10/2026 um robo passou ~500 cartoes roubados pela vitrine de uma unidade
 * em 66 minutos, cada tentativa com identidade falsa e IP de um pais diferente
 * — o limite por IP nao pegou nada. As travas aqui olham o que o robo NAO
 * consegue trocar a cada tentativa: a CONTA que recebe e o CARTAO.
 *
 *   1. Disjuntor por conta: recusas de cartao acima do normal numa conta Asaas
 *      fecham o cartao NAQUELA conta por um tempo e avisam o SUPER_ADMIN.
 *      PIX e boleto seguem funcionando — o robo so testa cartao.
 *   2. Mesmo cartao com CPFs diferentes: recusado.
 *   3. Mesmo cartao tentado muitas vezes na hora: recusado.
 *
 * Chamado DENTRO do cliente Asaas (`asaas/client.ts`), por onde passam todas as
 * portas que cobram no cartao — checkout novo nao nasce sem a trava.
 *
 * Fail-OPEN no Redis: uma queda do Upstash nao pode parar as vendas no cartao
 * da rede inteira. O limite por IP do checkout continua fail-closed.
 */

export const CARD_GUARD = {
  /** Recusas numa conta, dentro da janela, que abrem o disjuntor. */
  accountRefusals: 10,
  accountWindowSec: 10 * 60,
  /** Quanto tempo o cartao fica fechado na conta depois de disparar. */
  accountTripSec: 30 * 60,
  /** Tentativas do MESMO cartao por hora. */
  cardAttempts: 4,
  cardWindowSec: 60 * 60,
  /** Janela em que o mesmo cartao nao pode aparecer com outro CPF. */
  cardCpfWindowSec: 24 * 60 * 60,
} as const

export const CARD_GUARD_BLOCKED_MESSAGE =
  "Pagamento no cartão temporariamente indisponível. Use PIX ou boleto, ou tente novamente mais tarde."
export const CARD_GUARD_CARD_MESSAGE =
  "Este cartão não pode ser usado nesta compra. Use outro meio de pagamento."

export type CardGuardReason = "account_tripped" | "card_cpf_mismatch" | "card_attempts"

export class CardGuardError extends Error {
  constructor(
    message: string,
    public readonly reason: CardGuardReason,
  ) {
    super(message)
    this.name = "CardGuardError"
  }
}

/** Id da conta sem expor a chave: so os primeiros 16 hex do SHA-256. */
export function accountId(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16)
}

/**
 * Impressao do cartao: HMAC do numero inteiro com segredo do servidor. O numero
 * nunca e gravado; sem o segredo, a impressao nao volta a ser cartao.
 */
export function cardFingerprint(number: string): string {
  const secret = process.env.ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET ?? ""
  return createHmac("sha256", secret).update(number.replace(/\D/g, "")).digest("hex").slice(0, 24)
}

const keys = {
  tripped: (acct: string) => `cg:acct:${acct}:tripped`,
  refusals: (acct: string) => `cg:acct:${acct}:refusals`,
  attempts: (fp: string) => `cg:card:${fp}:attempts`,
  cpfs: (fp: string) => `cg:card:${fp}:cpfs`,
}

export interface CardAttempt {
  apiKey: string
  cardNumber: string
  holderCpf: string
}

/** Lanca `CardGuardError` quando a tentativa deve ser recusada antes do gateway. */
export async function assertCardAttemptAllowed(attempt: CardAttempt): Promise<void> {
  if (!redis) return
  const acct = accountId(attempt.apiKey)
  const fp = cardFingerprint(attempt.cardNumber)
  const cpf = attempt.holderCpf.replace(/\D/g, "")

  let tripped: number, attempts: number, cpfCount: number
  try {
    tripped = await redis.exists(keys.tripped(acct))
    attempts = await redis.incr(keys.attempts(fp))
    if (attempts === 1) await redis.expire(keys.attempts(fp), CARD_GUARD.cardWindowSec)
    await redis.sadd(keys.cpfs(fp), cpf || "?")
    await redis.expire(keys.cpfs(fp), CARD_GUARD.cardCpfWindowSec)
    cpfCount = await redis.scard(keys.cpfs(fp))
  } catch (err) {
    contextLogger().error({ err, event: "card_guard.redis_failed" }, "card guard: Redis falhou — liberando")
    return
  }

  const reason: CardGuardReason | null =
    tripped > 0
      ? "account_tripped"
      : cpfCount > 1
        ? "card_cpf_mismatch"
        : attempts > CARD_GUARD.cardAttempts
          ? "card_attempts"
          : null
  if (!reason) return

  contextLogger().warn(
    { event: "card_guard.blocked", reason, account: acct, card: fp, attempts, cpfCount },
    "card guard: tentativa de cartao recusada antes do gateway",
  )
  throw new CardGuardError(
    reason === "account_tripped" ? CARD_GUARD_BLOCKED_MESSAGE : CARD_GUARD_CARD_MESSAGE,
    reason,
  )
}

/**
 * So o disjuntor da conta — para o Mercado Pago, onde o cartao chega TOKENIZADO
 * do browser e o servidor nao tem numero para tirar a impressao.
 */
export async function assertAccountCardOpen(apiKey: string): Promise<void> {
  if (!redis) return
  let tripped: number
  try {
    tripped = await redis.exists(keys.tripped(accountId(apiKey)))
  } catch (err) {
    contextLogger().error({ err, event: "card_guard.redis_failed" }, "card guard: Redis falhou — liberando")
    return
  }
  if (tripped > 0) throw new CardGuardError(CARD_GUARD_BLOCKED_MESSAGE, "account_tripped")
}

/**
 * Registra uma RECUSA do gateway (4xx numa chamada com cartao). Ao passar do
 * limite na janela, fecha o cartao naquela conta e avisa o SUPER_ADMIN — uma
 * vez por disparo (`SET NX`).
 */
export async function recordCardRefusal(apiKey: string): Promise<void> {
  if (!redis) return
  const acct = accountId(apiKey)
  try {
    const n = await redis.incr(keys.refusals(acct))
    if (n === 1) await redis.expire(keys.refusals(acct), CARD_GUARD.accountWindowSec)
    if (n < CARD_GUARD.accountRefusals) return
    const opened = await redis.set(keys.tripped(acct), "1", {
      nx: true,
      ex: CARD_GUARD.accountTripSec,
    })
    if (opened !== "OK") return
    await alertTripped(acct, n)
  } catch (err) {
    contextLogger().error({ err, event: "card_guard.record_failed" }, "card guard: falha ao registrar recusa")
  }
}

async function alertTripped(acct: string, refusals: number): Promise<void> {
  const ctx = getRequestContext()
  contextLogger().error(
    { event: "card_guard.tripped", account: acct, refusals, tenantId: ctx?.tenantId, route: ctx?.route },
    "card guard: disjuntor de cartao aberto — possivel teste de cartao",
  )
  // Sem `category`: alerta de fraude nao pode ser silenciado por preferencia.
  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "WARNING",
    title: "Possível teste de cartão no checkout",
    body:
      `${refusals} cartões recusados em ${CARD_GUARD.accountWindowSec / 60} min numa mesma conta Asaas ` +
      `(conta ${acct}${ctx?.route ? `, rota ${ctx.route}` : ""}${ctx?.tenantId ? `, unidade ${ctx.tenantId}` : ""}). ` +
      `O cartão ficou fechado nessa conta por ${CARD_GUARD.accountTripSec / 60} min; PIX e boleto seguem. ` +
      `Confira cadastros e cobranças recentes da loja.`,
    href: "/admin/revendedores",
  }).catch(swallow("card_guard.alert"))
}
