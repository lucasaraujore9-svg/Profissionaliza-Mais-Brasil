# Arquitetura — {{NOME}}

## Principios

- **Thin client, fat server**: logica critica no servidor (Server Components / API Routes).
- **Behavior isolation**: cada comportamento vive em um arquivo unico, testavel isoladamente.
- **Single source of truth**: dados em um lugar so. UI deriva.
- **Validacao na borda**: todo input externo passa por Zod antes de ser usado.
- **Erros sao valores**: nunca swallow. Tipar ou propagar.

## Camadas

```
app/          -> Rotas (Server + Client Components)
components/   -> UI reutilizavel (PascalCase, 1 por arquivo)
lib/          -> Logica pura, clients de API, utils
  |- prisma.ts
  |- auth.ts
  |- crypto.ts
  |- [integracao]/   -> client + tipos de cada API externa
middleware.ts -> Edge: rewrites, auth guard, tenant resolver
```

## Convencoes de nomes

- Componentes: `PascalCase.tsx`
- Hooks: `useNomeDoHook.ts`
- Utils: `kebab-case.ts`
- Rotas: `lowercase` no sistema de arquivos do App Router
- Env vars: `SCREAMING_SNAKE_CASE`

## Validacao (Zod)

Toda API Route comeca assim:

```ts
const Input = z.object({ ... })
const parsed = Input.safeParse(await req.json())
if (\!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })
```

## Erros

- `try/catch` com tipos customizados em `lib/errors.ts`
- Logar em server, retornar mensagem amigavel ao client
- Nunca vazar stack traces em producao

{{MULTI_TENANT_ARCH}}

## Seguranca

- Segredos so no servidor (`process.env.*`). Nunca em `NEXT_PUBLIC_*`.
- Tokens sensiveis de terceiros: criptografar com AES-256-GCM antes de salvar.
- Webhooks: validar assinatura (HMAC) ou token antes de processar.
- Rate limiting em rotas publicas via Upstash.
