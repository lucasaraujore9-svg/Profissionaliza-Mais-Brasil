import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required")
  }
  return Buffer.from(key, "hex")
}

/**
 * Criptografa texto com AES-256-GCM.
 * Retorna string no formato: iv:encrypted:tag (hex encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  return [
    iv.toString("hex"),
    encrypted.toString("hex"),
    tag.toString("hex"),
  ].join(":")
}

/**
 * Descriptografa texto criptografado com AES-256-GCM.
 * Espera string no formato: iv:encrypted:tag (hex encoded).
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const parts = ciphertext.split(":")

  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format")
  }

  const [ivHex, encryptedHex, tagHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")
  const tag = Buffer.from(tagHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}
