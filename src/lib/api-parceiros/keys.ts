import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { afterResponse } from "@/lib/after-response"
import { swallow } from "@/lib/errors"
import { ipFrom } from "@/lib/ratelimit"
import { sanitizeScopes, type ApiScope } from "./scopes"
import { apiFail } from "./response"

/**
 * Chaves da API de parceiros (/api/v1).
 *
 * Modelo: uma chave por SISTEMA INTEGRADO, guardada como SHA-256. O segredo em
 * texto puro existe uma única vez — no retorno do POST que a criou. Não há
 * "ver a chave de novo": perdeu, gera outra e revoga a anterior.
 *
 * Por que não um segredo único em env (padrão CRON_SECRET/INTERNAL_SECRET):
 * com vários integradores, rotacionar o segredo derruba todos de uma vez e não
 * há como saber quem chamou o quê. Aqui cada parceiro é revogável sozinho e
 * carrega telemetria de uso própria.
 *
 * Por que SHA-256 e não bcrypt/argon: o segredo tem 256 bits de entropia
 * gerados por CSPRNG — não é senha de humano, não sofre ataque de dicionário.
 * O hash rápido é o que permite o lookup por índice único (O(1)) em vez de
 * varrer a tabela comparando hash a hash a cada request.
 */

const KEY_PREFIX = "pmb_live_"
/** Bytes de aleatoriedade do segredo (32 = 256 bits → 43 chars em base64url). */
const SECRET_BYTES = 32
/** Chars do segredo preservados no `prefix` para identificar a chave na UI. */
const PREFIX_VISIBLE_CHARS = 8

export interface GeneratedApiKey {
  /** Segredo completo. Só existe aqui — nunca é persistido. */
  secret: string
  /** Trecho identificável, persistido e exibido na listagem. */
  prefix: string
  /** SHA-256 hex do segredo — é o que vai para o banco. */
  keyHash: string
}

export function generateApiKey(): GeneratedApiKey {
  const random = randomBytes(SECRET_BYTES).toString("base64url")
  const secret = `${KEY_PREFIX}${random}`
  return {
    secret,
    prefix: `${KEY_PREFIX}${random.slice(0, PREFIX_VISIBLE_CHARS)}`,
    keyHash: hashApiKey(secret),
  }
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex")
}

/**
 * Extrai a chave dos headers. Aceita as duas formas usuais para não obrigar o
 * parceiro a mudar o cliente HTTP dele:
 *   Authorization: Bearer pmb_live_xxx
 *   X-API-Key: pmb_live_xxx
 */
export function extractApiKey(request: Request): string | null {
  const header = request.headers.get("authorization")
  if (header) {
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
    if (match) return match[1]!
  }
  const direct = request.headers.get("x-api-key")
  return direct?.trim() || null
}

export interface AuthenticatedApiKey {
  id: string
  name: string
  prefix: string
  scopes: ApiScope[]
}

export type ApiKeyAuthResult =
  | { ok: true; key: AuthenticatedApiKey }
  | { ok: false; response: Response }

/**
 * Autentica a requisição e confere os escopos exigidos pela rota.
 *
 * Fail-closed em toda saída: qualquer problema (header ausente, formato
 * errado, hash desconhecido, revogada, expirada) responde 401 com a MESMA
 * mensagem genérica — a resposta nunca conta ao chamador *por que* a chave não
 * serve, o que transformaria o endpoint em oráculo de enumeração. A distinção
 * fica no log interno.
 */
export async function authenticateApiKey(
  request: Request,
  ...requiredScopes: ApiScope[]
): Promise<ApiKeyAuthResult> {
  const invalid = () =>
    apiFail("Chave de API ausente ou inválida.", {
      status: 401,
      code: "INVALID_API_KEY",
    })

  const secret = extractApiKey(request)
  if (!secret || !secret.startsWith(KEY_PREFIX)) {
    return { ok: false, response: invalid() }
  }

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(secret) },
    select: {
      id: true,
      name: true,
      prefix: true,
      keyHash: true,
      scopes: true,
      status: true,
      expiresAt: true,
    },
  })

  // Comparação em tempo constante mesmo já tendo casado pelo índice: o custo é
  // irrisório e mantém o padrão do resto do projeto (lib/auth/bearer.ts).
  if (!record || !safeEqualHex(record.keyHash, hashApiKey(secret))) {
    return { ok: false, response: invalid() }
  }
  if (record.status !== "ACTIVE") {
    return { ok: false, response: invalid() }
  }
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, response: invalid() }
  }

  const scopes = sanitizeScopes(record.scopes)
  const missing = requiredScopes.filter((scope) => !scopes.includes(scope))
  if (missing.length > 0) {
    return {
      ok: false,
      response: apiFail(
        `Esta chave não tem o escopo necessário: ${missing.join(", ")}.`,
        { status: 403, code: "INSUFFICIENT_SCOPE" },
      ),
    }
  }

  touchApiKey(record.id, ipFrom(request))

  return {
    ok: true,
    key: {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes,
    },
  }
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex")
  const bufB = Buffer.from(b, "hex")
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Telemetria de uso, DEPOIS da resposta. Responde "esse integrador ainda está
 * chamando?" antes de alguém revogar a chave.
 *
 * Best-effort de propósito: uma falha de escrita aqui não pode derrubar a
 * consulta do parceiro. Vai por `afterResponse` porque `void promise` morre com
 * o congelamento da instância em serverless.
 */
function touchApiKey(id: string, ip: string): void {
  afterResponse(async () => {
    await prisma.apiKey
      .update({
        where: { id },
        data: {
          lastUsedAt: new Date(),
          lastUsedIp: ip === "anon" ? null : ip,
          usageCount: { increment: 1 },
        },
      })
      .catch(swallow("api-parceiros.touch-key"))
  })
}
