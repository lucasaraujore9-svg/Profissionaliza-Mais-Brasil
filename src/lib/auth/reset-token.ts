import { createHash, randomBytes } from "node:crypto"

/**
 * Tokens de reset/invite armazenados no banco como hash SHA-256.
 *
 * Justificativa: se o banco for comprometido (ou um log expõe a coluna),
 * o atacante não consegue redefinir senhas — só temos o hash. O token plain
 * vai apenas no email do usuário, com TTL curto (5min) e uso único.
 *
 * Use `generateResetToken()` ao criar o token; o `plain` vai no email,
 * o `hash` vai no `resetToken` do banco. Para validar, hashe o token recebido
 * via `hashResetToken()` e faça lookup pelo hash.
 */
export function generateResetToken(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString("hex")
  return { plain, hash: hashResetToken(plain) }
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
