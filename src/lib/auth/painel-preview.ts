/**
 * Prévia "ver como" — o dono da unidade inspeciona o painel com os olhos de um
 * papel da equipe, sem trocar de usuário.
 *
 * Diferente da impersonação de admin (`lib/auth/impersonate.ts`), aqui NÃO se
 * emite uma sessão nova: a sessão continua a do dono e só o conjunto de
 * permissões é substituído, em modo SOMENTE LEITURA (ver `toReadOnly`). Assim a
 * prévia nunca escreve no banco nem dispara efeito colateral.
 *
 * O cookie é assinado com HMAC SHA-256 (mesmo esquema do flag de impersonação)
 * para que ninguém possa forjá-lo via XSS/cookie injection. Ainda assim ele é
 * inofensivo por construção — só reduz privilégio, nunca amplia, e
 * `painelContext` só o consulta quando o usuário JÁ é o dono.
 */

import { cookies } from "next/headers"
import { createHmac, timingSafeEqual } from "node:crypto"
import { authSecret } from "@/lib/env"
import {
  ASSIGNABLE_MEMBER_ROLES,
  type AssignableMemberRole,
} from "@/lib/auth/painel-permissions"

export const PAINEL_PREVIEW_COOKIE = "pmb_painel_preview"

/** Janela curta: a prévia é para conferir o menu, não para operar. */
export const PAINEL_PREVIEW_MAX_AGE = 30 * 60 // 30 minutos

function getSecret(): string {
  const secret = authSecret()
  if (!secret) {
    throw new Error(
      "AUTH_SECRET ausente — a prévia de papel requer secret válido. Configure no .env (openssl rand -hex 32).",
    )
  }
  return secret
}

function hmacSign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url")
}

function hmacVerify(data: string, sig: string): boolean {
  const a = Buffer.from(hmacSign(data))
  const b = Buffer.from(sig)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

interface PreviewPayload {
  role: AssignableMemberRole
  /** Dono que iniciou a prévia — o cookie não vale para outra conta. */
  ownerUserId: string
  startedAt: number
}

export function encodePreview(
  role: AssignableMemberRole,
  ownerUserId: string,
): string {
  const payload: PreviewPayload = { role, ownerUserId, startedAt: Date.now() }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${encoded}.${hmacSign(encoded)}`
}

export function decodePreview(
  raw: string | undefined | null,
): PreviewPayload | null {
  if (!raw) return null
  try {
    const [encoded, sig] = raw.split(".")
    if (!encoded || !sig) return null
    if (!hmacVerify(encoded, sig)) return null
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8"),
    ) as PreviewPayload
    if (
      !parsed.ownerUserId ||
      !(ASSIGNABLE_MEMBER_ROLES as readonly string[]).includes(parsed.role)
    ) {
      return null
    }
    // Defesa extra: o maxAge do cookie já expira, mas um cookie copiado para
    // outro contexto não deve sobreviver à janela.
    if (Date.now() - parsed.startedAt > PAINEL_PREVIEW_MAX_AGE * 1000) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Papel simulado na requisição atual, ou `null`.
 *
 * `ownerUserId` amarra o cookie à conta que iniciou a prévia: um cookie vazado
 * e colado noutra sessão é ignorado. `painelContext` só chama isto depois de
 * confirmar que o usuário é o dono da unidade.
 */
export async function readPreviewRole(
  ownerUserId: string,
): Promise<AssignableMemberRole | null> {
  const store = await cookies()
  const payload = decodePreview(store.get(PAINEL_PREVIEW_COOKIE)?.value)
  if (!payload || payload.ownerUserId !== ownerUserId) return null
  return payload.role
}
