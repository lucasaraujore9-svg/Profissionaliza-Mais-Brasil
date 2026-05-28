import { describe, it, expect, beforeAll } from "vitest"
import { encrypt, decrypt } from "./crypto"

describe("crypto encrypt/decrypt (AES-256-GCM)", () => {
  beforeAll(() => {
    // 64 hex chars = 32 bytes. getKey() lê process.env.ENCRYPTION_KEY em runtime.
    process.env.ENCRYPTION_KEY = "0".repeat(64)
  })

  it("roundtrip preserva o texto (token MP do tenant)", () => {
    const plain = "APP_USR-1234567890-token-secreto"
    const enc = encrypt(plain)
    expect(enc).not.toBe(plain)
    expect(decrypt(enc)).toBe(plain)
  })

  it("gera ciphertext diferente a cada chamada (IV aleatório)", () => {
    expect(encrypt("mesmo-texto")).not.toBe(encrypt("mesmo-texto"))
  })

  it("decrypt rejeita formato inválido", () => {
    expect(() => decrypt("formato-invalido")).toThrow()
  })
})
