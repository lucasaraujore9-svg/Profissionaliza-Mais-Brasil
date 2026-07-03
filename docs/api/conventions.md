# Convenções de API (route handlers internos)

> Escopo: todos os route handlers em `src/app/api/**`. Esta é uma **API privada**
> (consumida apenas pelo próprio front-end da PMB/vitrines/painéis) — não há
> consumidor externo nem contrato OpenAPI público. As convenções abaixo são a
> fonte da verdade para manter consistência entre os ~300 handlers.

## Envelope de resposta

O projeto padroniza um envelope **flat** (não aninhado):

### Sucesso

```jsonc
// 200 / 201
{ "data": { /* payload */ } }
```

Alguns endpoints simples de escrita respondem `{ "ok": true }` quando não há
payload a devolver (idempotentes). Ambos são aceitos.

### Erro

```jsonc
// 4xx / 5xx — formato FLAT (canônico deste projeto)
{
  "error": "Mensagem legível para humano (pt-BR)",
  "code": "CODIGO_MAQUINA"   // opcional, SCREAMING_SNAKE_CASE
}
```

- `error`: string sempre presente, mensagem em pt-BR.
- `code`: string opcional em `SCREAMING_SNAKE_CASE` para o cliente ramificar
  (ex.: `INVALID_JSON`, `VALIDATION_ERROR`, `NOT_FOUND`, `TENANT_MISMATCH`,
  `RATE_LIMITED`). Adicione `code` quando o front precisar tratar o caso
  específico; omita quando a mensagem basta.

> **Decisão explícita (API-005):** mantemos o formato **flat** `{ error, code }`,
> e **não** o formato aninhado `{ error: { code, message } }` sugerido por
> algumas referências. Motivo: (a) é a convenção já aplicada de forma consistente
> em centenas de handlers; (b) API privada sem consumidor externo; (c) migrar
> exigiria tocar todos os call-sites (cliente e servidor) sem ganho funcional.
> Se um dia surgir um consumidor externo/versionado, reavaliar migração para o
> envelope aninhado + OpenAPI.

## Validação de entrada

- Todo `POST/PUT/PATCH/DELETE` valida o corpo com **Zod** (`safeParse` → 400
  `{ error: "Dados inválidos", code: "VALIDATION_ERROR" }`; ou `.parse` dentro de
  try/catch).
- Corpo não-JSON → 400 `{ error: "JSON inválido" }`.
- Nunca confiar no cliente para limites/valores: revalidar no servidor
  (ex.: teto de parcelas, cap de cupom).

## AuthZ

- Sessão validada por guard server-side (`requireResellerSession`,
  `requireStudentSession`, guards de role) — nunca por cookie cru.
- Endpoints escopados por tenant filtram por `tenantId` (anti-IDOR).

## Rate limiting

- Endpoints públicos abusáveis aplicam `rateLimit(...)` +
  `rateLimitResponse(...)` no topo do handler (resposta 429 com `code:
  "RATE_LIMITED"` + `Retry-After`).
- Buckets em `src/lib/ratelimit.ts` (`RATE_LIMITS`). `failOpen: true` só para
  fluxos onde bloquear na queda do Redis é pior que liberar (auth, tracking,
  enriquecimento de UX como parcelas).

## Idempotência

- Webhooks: dedupe por id do provedor + advisory lock no fulfill.
- Chamadas externas que **mutam** (criam pagamento/assinatura) enviam chave de
  idempotência quando o provedor suporta (ex.: `X-Idempotency-Key` no MP).
