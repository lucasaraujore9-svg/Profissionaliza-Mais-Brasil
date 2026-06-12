/**
 * Sugere uma senha temporária forte e legível (sem caracteres ambíguos).
 * Client-safe: usa Web Crypto (não importa node:crypto). Espelha o gerador
 * do servidor em `@/lib/auth/credentials`.
 */
export function suggestPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  const symbols = "!@#$%&*"
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  let out = ""
  for (let i = 0; i < 10; i++) {
    out += alphabet[arr[i] % alphabet.length]
  }
  out += symbols[arr[10] % symbols.length]
  out += String(arr[11] % 10)
  return out
}
