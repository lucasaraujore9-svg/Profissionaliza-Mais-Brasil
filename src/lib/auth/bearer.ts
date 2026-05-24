import { timingSafeEqual } from "node:crypto"

/**
 * Compara em tempo constante duas strings ASCII. Use para validar bearer tokens
 * e secrets compartilhados (CRON_SECRET, INTERNAL_SECRET, webhook tokens).
 */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

/**
 * Valida o header Authorization de um cron job da Vercel.
 *
 * Aceita formato `Bearer <token>` ou o token cru. Exige `CRON_SECRET` em
 * produção; sem o secret configurado, rejeita por segurança.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") ?? ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : header
  if (!bearer) return false
  return safeEqual(bearer, secret)
}

/**
 * Valida o header `x-internal-secret` de chamadas internas (proxy → API).
 */
export function isInternalAuthorized(request: Request): boolean {
  const secret = process.env.INTERNAL_SECRET
  if (!secret) return false
  const header = request.headers.get("x-internal-secret") ?? ""
  if (!header) return false
  return safeEqual(header, secret)
}
