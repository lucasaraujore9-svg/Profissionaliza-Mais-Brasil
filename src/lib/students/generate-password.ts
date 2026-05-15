import { randomBytes } from "crypto"
import { hash } from "bcryptjs"

/**
 * Gera uma senha temporária amigável para envio por email.
 *
 * Critérios:
 * - 10 caracteres legíveis (evita 0/O, 1/l/I para não confundir);
 * - mix de letras maiúsculas, minúsculas e dígitos;
 * - aleatoriedade criptográfica (crypto.randomBytes).
 *
 * Devolve tanto a senha em texto plano (para enviar por email) quanto
 * o hash bcrypt (para salvar em `Student.passwordHash`).
 */
const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

export function generateTemporaryPassword(length = 10): string {
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}

export async function generatePasswordWithHash(): Promise<{
  plain: string
  hash: string
}> {
  const plain = generateTemporaryPassword()
  const hashed = await hash(plain, 10)
  return { plain, hash: hashed }
}
