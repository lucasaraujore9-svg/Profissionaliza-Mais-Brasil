# SECURITY.md — Profissionaliza Mais Brasil

> Documento vivo. Leia antes de tocar em auth, webhooks, tenant scoping,
> uploads, cripto ou envs. Atualize quando mudar qualquer um deles.

Última auditoria: **2026-05-24** (`/goal` security audit — rounds 1 a 4
concluídos, todas as correções aplicadas).

---

## 1. Modelo de ameaça (resumo)

Quem queremos manter de fora:

| Ator | Vetor típico | O que defendemos |
|---|---|---|
| Atacante anônimo na internet | brute-force login, webhook forge, scrape de slugs | rate-limit, HMAC, validação de input, sanitização de slug |
| Atacante autenticado (aluno/revendedor) | IDOR, cross-tenant via param/header | guards de role + filtro obrigatório por `tenantId` em queries Prisma |
| Atacante com 1 secret leakado (`MP_WEBHOOK_SECRET`, `INTERNAL_SECRET`) | replay/forge | defesa em profundidade — secret sozinho não basta |
| Funcionário PMB malicioso | acesso indevido a dados de revendedor | logs de webhook, auditoria de admin (futuro) |

**Fora de escopo:** comprometimento físico do servidor, malware no laptop do
dev, ataques de timing-side-channel em rede pública (mitigamos com TLS).

---

## 2. Contratos críticos (quebrar = vulnerabilidade)

### 2.1. Tenant isolation

- **Toda** query Prisma em rotas `/api/painel/*` e `/api/aluno/*` **DEVE**
  filtrar por `tenantId: ctx.tenantId` (ou `studentId: session.studentId`).
- `tenantId` **nunca** vem do body/query — sempre da session via
  `requireResellerSession()` / `requireStudentSession()`.
- Headers `x-tenant-id` / `x-tenant-slug` **são preenchidos pelo proxy**
  (`src/proxy.ts`) baseado no hostname. **Nunca** confie em valor vindo
  diretamente do client em outras rotas.

**Pattern oficial para mutação por id** (Prisma `update`/`delete` exigem
unique field, não permitem `{id, tenantId}` no `where`):

```ts
// 1. Confirma posse com findFirst escopado por tenantId
const tc = await prisma.tenantCourse.findFirst({
  where: { id, tenantId: ctx.tenantId },
  select: { id: true },
})
if (!tc) return apiResponse.notFound()

// 2. Mutação por id
await prisma.tenantCourse.update({ where: { id: tc.id }, data: {...} })
```

Se o ganho de defesa-em-profundidade contra race conditions justificar, use
`updateMany({ where: { id, tenantId }, ... })` — perde retorno do registro
mas elimina a janela entre find e update.

### 2.2. Webhooks

**Mercado Pago** (`/api/webhooks/mercadopago`):
1. Headers `x-signature` + `x-request-id` obrigatórios em prod (rejeita 401)
2. HMAC SHA256 validado com `MP_WEBHOOK_SECRET` **antes** de tocar em qualquer
   tenant (`src/lib/mercadopago/process.ts` passo 2)
3. `tenantSlug` da query é validado contra `/^[a-z0-9_-]{1,64}$/i`
4. `getPayment(tenant.mpAccessToken, paymentId)` é o último gate — payment
   tem que pertencer à conta MP do tenant
5. Idempotência por `mpPaymentId` permite replay safe

**Risco residual conhecido:** secret global (MP não permite secret por tenant
via Preference API). Mitigado pelo gate `getPayment`. Se vazar, atacante
precisa **também** do access token criptografado de algum tenant para
explorar — duplo gate.

**Asaas** (`/api/webhooks/asaas`):
1. Header `asaas-access-token` comparado em tempo constante com
   `ASAAS_WEBHOOK_TOKEN` (env obrigatória em **todos** os ambientes — não
   há mais "dev bypass")
2. Processamento idempotente por `asaasPaymentId`
3. 500 sinaliza retry ao Asaas

### 2.3. Cron jobs

- Todas as rotas em `/api/cron/*` validam `Authorization: Bearer ${CRON_SECRET}`
  via `isCronAuthorized()` em `src/lib/auth/bearer.ts`.
- A Vercel chama crons via **GET** com esse header. Os handlers `GET` que
  delegam ao `POST` são **intencionais** — não remover.
- `CRON_SECRET` ≥ 32 chars hex (`openssl rand -hex 32`). Validado em `env.ts`.

### 2.4. Sessões / Auth

- NextAuth v5 (`src/lib/auth.ts`). Secret obrigatório via `AUTH_SECRET` ou
  `NEXTAUTH_SECRET` (validado no boot por `assertEnv()` em `src/lib/env.ts`).
- Cookie de sessão: `httpOnly`, `sameSite: lax`, `secure: true` em prod,
  nome prefixado `__Secure-` em prod.
- Rate-limit no login: bucket `auth-login` por `IP+email` — 8 tentativas/min.
- Senhas: bcryptjs rounds=12 (`reset-password`) / rounds=10 (legado em
  `alterar-senha-inicial`). Padronizar para 12 em código novo.
- Reset tokens: 32 bytes hex (256 bits), armazenados como SHA-256, TTL 5min,
  single-use (limpos após uso). Rate-limit em forgot e reset.
- Aluno e User têm tabelas separadas; resolução de aluno é escopada por
  `tenantId` do subdomain — mesmo email pode logar em tenants diferentes.

### 2.5. Cripto (`src/lib/crypto.ts`)

- AES-256-GCM, IV randômico por encrypt, auth tag obrigatória, chave
  validada para 32 bytes.
- Use **apenas** para o `mpAccessToken` no banco. Nada mais é criptografado
  aplicacionalmente hoje (DB at-rest fica com Supabase).
- `ENCRYPTION_KEY` = 64 chars hex. Validado em `env.ts` E em `crypto.ts`.

**`student.plataformaAlunoSenha` (plataforma parceira):** armazenada em
plaintext APENAS durante a janela entre criação do aluno e envio do email
de credenciais. Zerada (`NULL`) após `sendEmail` retornar sucesso em
`src/lib/enrollment/fulfill.ts`. Se o aluno perder acesso, usar o fluxo
"esqueci senha" da plataforma parceira. Nunca persistimos essa senha
permanentemente.

### 2.6. Uploads (Supabase Storage)

Toda rota de upload deve:
1. Validar MIME whitelist (`image/png|jpeg|jpg|webp` — SVG bloqueado por XSS)
2. Validar tamanho máximo
3. Chamar `isValidImageMagic(buffer, file.type)` de
   `src/lib/storage/validate-image.ts` para conferir magic bytes (defesa
   contra MIME spoof)
4. Path scoped por tenant: `${tenantId}/...` ou `system/...` ou `__pmb__/...`
5. Rate-limit `RATE_LIMITS.upload` em rotas autenticadas

Rotas aplicando isso hoje:
- `/api/painel/cursos/[id]/capa` ✓
- `/api/painel/vitrine/upload` ✓
- `/api/admin/system-settings/group-logo/upload` ✓
- `/api/admin/certificate-template/upload` ✓ (corrigido 2026-05-24)

### 2.7. CSV / formula injection

Use `escapeCsv()` de `src/lib/csv.ts` ou `src/lib/reports/csv.ts`. Ambos
prefixam células iniciadas por `=+-@\t\r` com aspa simples.

Filenames em `Content-Disposition` devem usar `csvResponseHeaders()` ou
sanitizar CRLF manualmente (regex `/[\r\n"\\;]/g → _`).

### 2.8. Variáveis de ambiente

**Sempre** via `import { env } from "@/lib/env"` — nunca `process.env.X`
direto em código novo. Schema Zod em `src/lib/env.ts` documenta cada env,
falha rápido se algo essencial faltar em prod.

`assertEnv()` é chamado no boot de `src/app/layout.tsx` — fail-fast em prod
se faltar `AUTH_SECRET`, `MP_WEBHOOK_SECRET`, `ASAAS_WEBHOOK_TOKEN`,
`CRON_SECRET`, `INTERNAL_SECRET`, `ENCRYPTION_KEY` ou credenciais EA/Asaas.
Em dev só emite warnings.

Para Edge Runtime (`src/proxy.ts`), o schema Zod **não** pode ser importado
(Edge não suporta o Proxy lazy). Lá usa-se `process.env.X` direto — risco
mitigado porque só há 3 envs em uso (UPSTASH_*, INTERNAL_SECRET) e o proxy
falha visivelmente se ausentes.

### 2.9. Migrations

`npm run build` invoca `node scripts/apply-pending-migrations.mjs` que:
- Descobre dinamicamente `prisma/migrations/*/migration.sql`
- Rastreia o que já foi aplicado em `_pmb_applied_migrations`
- **Bootstrap mode**: na primeira execução em um banco existente, marca
  tudo como aplicado (não re-roda migrations não-idempotentes antigas)
- Cada migration roda em transação própria — falha = rollback automático

**Para criar uma migration nova:** escreva SQL idempotente
(`CREATE TABLE/INDEX IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`,
`DO $$ ... $$` pra constraints) em `prisma/migrations/YYYYMMDD_nome/migration.sql`.
Pronto — o script descobre sozinho no próximo build.

---

## 3. Convenções de código

### 3.1. Response shape (rotas novas)

```ts
import { apiResponse } from "@/lib/api/response"

export async function POST(req: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) return apiResponse.unauthorized()

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return apiResponse.validation(parsed.error)

  // ...

  return apiResponse.ok({ id: created.id })
}
```

Rotas antigas usam `{ data }` / `{ error }` inconsistentes — migrar quando
encostar, não em refactor massivo.

### 3.2. `.catch(() => undefined)` é proibido

Substituído por `swallow("contexto")` de `src/lib/errors.ts` — mesma
semântica (não-fatal) mas com log warn estruturado pra grepar em prod.
Tolerado apenas em side-effects cosméticos (notificação, cache, log de
webhook). Em mutações **financeiras** (pagamento, matrícula, cupom),
propague erros — deixe o caller decidir.

```ts
// ❌ NÃO faça
await prisma.x.update({...}).catch(() => undefined)

// ✅ Cleanup não-crítico
await prisma.x.update({...}).catch(swallow("modulo.acao"))

// ✅ Crítico: propaga
await prisma.x.update({...})  // throw é OK
```

### 3.3. Comentários

Só comentar **por quê**, não **o quê**. Bom exemplo:
```ts
// Defesa em profundidade: cert.code é gerado internamente, mas sanitizar
// evita CRLF injection caso o gerador mude no futuro.
```

Ruim:
```ts
// sanitiza cert.code
```

### 3.4. Types > casts

Nunca `as unknown as X` em hot paths (auth, prisma, payload de webhooks).
Tipos do NextAuth ficam em `src/types/index.ts` via `declare module`.

---

## 4. Checklist de PR

Antes de aprovar um PR que toca em qualquer um dos seguintes, verifique:

- [ ] **Query Prisma em rota painel/aluno** → tem `tenantId` no `where`?
- [ ] **API route nova** → tem guard de auth? Zod no body? Rate-limit se for
      hot path?
- [ ] **Upload** → magic bytes + MIME whitelist + size limit + path scoped?
- [ ] **Cron** → `isCronAuthorized(request)` na primeira linha do handler?
- [ ] **Webhook externo** → assinatura validada **antes** de qualquer query?
- [ ] **Envs novas** → adicionadas em `src/lib/env.ts` (schema Zod) E em
      `.env.example`?
- [ ] **Erros** → não há `.catch(() => undefined)` em mutações; mensagens
      genéricas pro client; stack no log do server?
- [ ] **Logs** → não há tokens, senhas, PII ou access tokens em
      `console.log/warn/error`?
- [ ] **Migrations Prisma** → arquivo idempotente (`IF NOT EXISTS`) e
      adicionado em `package.json:db:apply-pending`?

---

## 5. Gaps conhecidos (débito documentado)

### MED
- **Sem testes automatizados** para fluxos críticos (auth, checkout,
  webhook, fulfillment). Cobertura zero é risco de regressão. Próximo
  investimento maior.
- **next-auth 5.0.0-beta.30 em prod.** Atualizar para 5.0.0 stable quando
  sair (monitorar https://github.com/nextauthjs/next-auth/releases).
- **Naming PT/EN mistura** (Prisma fields em PT — `nome/fone`; API routes
  em PT — `revendedores/vendas`; componentes em EN — `student-toolbar`).
  Documentar regra em `docs/references/architecture.md` e seguir em código
  novo. Não refatorar tudo agora.
- **`process.env.X` direto em ~30 lugares legados.** Migrar pra `env.ts`
  conforme se encostar em cada arquivo. Bloqueador: `src/proxy.ts` (Edge
  Runtime não suporta o Proxy lazy do Zod).

### LOW
- **Prisma 7 beta** (saiu maio 2026). Monitorar issues.
- **Sem pre-commit hook** rodando `npm run lint`. Setup com husky +
  lint-staged. ~30 min.
- **`xlsx` HIGH no `npm audit`** (Prototype Pollution + ReDoS, sem patch)
  — **RESOLVIDO (SEG-003, 2026-06-20)**: substituído por `exceljs` (mantido
  e patchável no npm). A exportação de relatório (`report-viewer.tsx`) usa
  `ExcelJS.Workbook` apenas para **escrita** de XLSX — nunca parseamos
  arquivos externos. Se algum dia adicionar import/upload de XLSX,
  reavaliar a superfície de parsing.
- **`mercadopago` / `svix` / `resend` MED por uuid<11.** Atualizar requer
  `mercadopago@0.5.0` (breaking). Esperar release sem breaking.
- **`nodemailer@7.0.13` HIGH (SEG-007, risco ACEITO até haver patch)** —
  dois advisories: GHSA-vvjj-xcjg-gr5g (CRLF no `name`/EHLO) e
  GHSA-c7w3-x93f-qmm8 (`envelope.size`). Não há release corrigido publicado
  (o mais recente é o 7.0.13; o fix upstream exige ≥9.0.1, ainda inexistente),
  então **não há bump possível hoje**. Exploitabilidade atual **baixíssima**:
  o transport em `src/lib/email/smtp.ts` é montado só com `host`/`port`/
  `secure`/`auth.{user,pass}` vindos de env `SMTP_*`, **nunca** seta a opção
  `name` e `sendSmtp()` passa apenas `from`/`to`/`subject`/`html`/`replyTo`
  (sem `envelope`) — nenhum input de usuário/tenant alcança os vetores dos
  advisories. **Watch item:** bumpar assim que sair `nodemailer` ≥9.0.1 e
  reconfirmar `npm audit --omit=dev`. **Invariante a preservar:** se um dia
  o SMTP passar a ser por revenda, `host`/`name`/`envelope` do transport
  **não** podem derivar de dados de tenant sem sanitização de CRLF.

### Notas de auditoria (falsos positivos descartados)
- **Cron GET handlers** — apareceu em auditoria como "bypass". Falso
  positivo: Vercel cron chama GET com Bearer, `isCronAuthorized` cobre
  ambos. Mantido.
- **Crypto sem validação de input** — falso positivo: `src/lib/crypto.ts`
  linhas 53 e 62 já validam.
- **MP webhook IDOR via slug forge** — mitigado pelo gate `getPayment`
  com token do tenant. Documentado em §2.2 como risco residual aceito.
- **Tenant scoping em `update({where:{id}})` sem tenantId** — não é IDOR:
  o pattern oficial é `findFirst(scoped) + update(by id)`. Limitação do
  Prisma `update` (só aceita unique no where). Veja §2.1.

## 6. Histórico de auditorias

| Data | Round | Foco | Resultado |
|---|---|---|---|
| 2026-05-24 | 1 | Webhook HMAC, env central, magic bytes, CRLF | 7 vulns CRITICAL/HIGH fechadas + `src/lib/env.ts` + helpers |
| 2026-05-24 | 2 | `assertEnv()` no boot, Prisma Pool, migrations dinâmicas, swallow helper | Manutenibilidade + 43 `.catch(()=>undefined)` migrados |
| 2026-05-24 | 3 | `process.env` residuais, XSS/redirect, `npm audit` | Open-redirect em login fixado; xlsx documentado |
| 2026-05-24 | 4 | Varredura final tenant isolation | Pattern oficial documentado |
| 2026-05-24 | 5 | Timeouts em chamadas HTTP externas | `AbortSignal.timeout` em plataforma/asaas/mp/vercel |
| 2026-05-24 | 6 | Plaintext-password leak da plataforma parceira | `student.plataformaAlunoSenha` zerada após email |
| 2026-05-24 | 7 | Headers HTTP, performance (N+1, indexes), observabilidade, DX | Health check, error boundaries, composite indexes, GitHub Actions CI, Vercel Analytics |

## 7. Áreas que ficaram fora desta auditoria (próximo investimento)

### Observabilidade (próximo investimento maior)
- **Sentry / error tracking** — Sem isso, erros 500 em prod só aparecem em logs do Vercel Runtime (sem alerta, sem grouping). Recomendação: `@sentry/nextjs` + DSN, integrar em `src/instrumentation.ts`.
- **Logger estruturado** — `console.error/warn` espalhado em 60+ arquivos sem contexto (userId, tenantId, requestId). Criar `src/lib/logger.ts` e migrar gradualmente.
- **Alertas de cron** — Crons falham silenciosamente. Webhook (Slack/n8n) deveria notificar 5xx. Cron monitor pattern: ping em cada execução, alerta se gap.
- **Audit log** — Tabela `AuditLog` para mudanças críticas de admin (criar usuário, cancelar matrícula, alterar preço). Sem isso não há "quem fez o quê quando".
- **PostHog / eventos de negócio** — Funnels (signup → primeira compra → churn) não rastreados.

### Performance (após observabilidade revelar hotspots)
- **N+1 em `/admin/indicacoes`** — Loop em JS substituível por `groupBy` em SQL. ~5-10x speedup com 100+ comissões.
- **Cache de catálogo** — `loadCategorias()` em `src/lib/catalog/home.ts` roda COUNT JOIN em toda visita de home. Cachear no Redis por 1h.
- **Paginação ausente** em `/api/admin/alunos/global` (findMany sem `take`).
- **`force-dynamic` espalhado** em 50 páginas — algumas (`/cursos`, `/checkout/confirmacao`) podem usar `revalidate` em vez.

### React 19 / Next 16
- **Layout shells Client-only** em `admin/layout-shell.tsx` e `painel/layout-shell.tsx` — toda a árvore vira Client por causa de 1 sidebar. Server Component wrapper + sidebar isolada como Client.
- **`generateMetadata` ausente** em `/cursos/[slug]/page.tsx` — SEO fraco.

### CSP & headers
- **`'unsafe-eval'` e `'unsafe-inline'`** em script-src — Justificado por Mercado Pago SDK + Tailwind inline styles. Para fechar precisaria nonces dinâmicas (refactor significativo). Aceitável hoje, registrar quando MP migrar para um SDK sem eval.

---

## 6. Como reportar vulnerabilidade

Mande email a `iabolsa@bmbr.com.br` (admin). Não abra issue pública no
GitHub. Resposta em até 48h úteis.
