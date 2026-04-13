# Issue 027 — Crypto Module (AES-256-GCM)

**Tipo:** infra
**Página:** global
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Implementar módulo criptografia AES-256-GCM para encriptar/decriptar MP access tokens. Keys derivadas de ENCRYPTION_KEY, nonces aleatórios, validação autenticidade. Tokens armazenados em Tenant.mp_access_token_encrypted.

## Componentes Envolvidos
- lib/crypto.ts — encrypt/decrypt functions
- lib/crypto/key-derivation.ts — derive keys de ENCRYPTION_KEY
- lib/crypto/errors.ts — custom crypto errors

## Comportamentos
- `encrypt-token` — AES-256-GCM encrypt(plaintext, key, nonce)
- `decrypt-token` — AES-256-GCM decrypt(ciphertext, key, nonce)
- `generate-nonce` — random 12-byte nonce
- `validate-auth-tag` — verificar autenticidade antes decrypt

## Critério de Aceite
- [ ] lib/crypto.ts criado
- [ ] encrypt(plaintext: string): string retorna base64
- [ ] decrypt(ciphertext: string): string retorna plaintext
- [ ] AES-256-GCM algorithm (Node.js crypto)
- [ ] Nonce aleatório 12 bytes
- [ ] Auth tag validação
- [ ] ENCRYPTION_KEY em .env
- [ ] Error handling decrypt failures
- [ ] No console logs de secrets
- [ ] Unit tests encrypt/decrypt roundtrip
