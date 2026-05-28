# Agente 11 — DevOps, Deploy, Ambientes e Configurações

**Data:** 2026-05-28  
**Escopo:** Variáveis de ambiente, pipeline CI/CD, processo de deploy/migração, crons, observabilidade, gestão de segredos, configurações de build.

---

## Resumo executivo

A infraestrutura de deploy tem **um risco crítico operacional** (migração SQL dispara diretamente em produção a cada `npm run build`, sem advisory lock nem proteção contra deploy concorrente) e **múltiplos gaps de documentação de ambiente** que podem causar falhas silenciosas em produção. A estrutura de env.ts com Zod é boa, mas ~51 arquivos ainda bypassa o módulo centralizado via `process.env.*` direto.

---

## Achados

---

### [Alto] Deploy Vercel roda migração SQL em produção sem lock de concorrência

- **Agente responsável:** DevOps/Config
- **Categoria:** Deploy / Banco de Dados
- **Arquivo:** `package.json:7`, `scripts/apply-pending-migrations.mjs:140-151`
- **Linha/trecho:**
  ```json
  "build": "npm run db:apply-pending && next build"
  ```
- **Evidência:** `apply-pending-migrations.mjs` usa `BEGIN/COMMIT` por migration individual, mas não usa `SELECT pg_advisory_lock()` antes do loop. Dois deploys simultâneos (ex: push para `main` + deploy manual) competem em `_pmb_applied_migrations` sem serialização externa.
- **Descrição:** O Vercel pode executar builds em paralelo (ex: redeploy manual enquanto outro está rodando). O script de migração não adquire advisory lock Postgres, portanto dois processos podem simultaneamente executar `ensureTracking()` → `bootstrap()` → loop de `applyMigration()`. O `ON CONFLICT DO NOTHING` protege a tabela de tracking, mas a migration SQL em si pode rodar duas vezes em race condition antes do INSERT na tracking table completar na outra instância.
- **Impacto:** Possível double-execution de DDL em produção. Migrations com `IF NOT EXISTS` sobrevivem; migrations com `INSERT` de dados iniciais ou `ALTER TABLE` sem guarda podem falhar ou criar dados duplicados.
- **Cenário de risco:** Dev faz push. Vercel inicia build #1. PM clica "Redeploy" antes de #1 terminar. Build #2 começa. Ambos vêem a migration X como não-aplicada e tentam executá-la simultaneamente.
- **Recomendação:** Adicionar `SELECT pg_advisory_xact_lock(hash('pmb_migrations')::int)` como primeira query no `main()`, antes do `ensureTracking`. Esta lock é liberada automaticamente ao fim da conexão, sem necessidade de unlock explícito.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] 18 variáveis de ambiente usadas em código sem documentação em `.env.example`

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração / Onboarding
- **Arquivo:** `.env.example` vs uso real em `src/`
- **Linha/trecho:** Variáveis ausentes do `.env.example`:
  - Integrações críticas: `MP_WEBHOOK_SECRET`, `WA_GATEWAY_URL`, `WA_GATEWAY_API_KEY`
  - PMB: `PMB_MP_ACCESS_TOKEN`, `PMB_PLATAFORMA_VENDEDOR_ID`, `PMB_PLATAFORMA_POLO`, `PMB_SUPPORT_EMAIL`, `PMB_EA_VENDEDOR_ID`, `PMB_EA_POLO`
  - Observabilidade: `AXIOM_TOKEN`, `AXIOM_DATASET`, `AXIOM_URL`, `LOG_LEVEL`
  - Feature flags: `MP_WEBHOOK_DEV_BYPASS`, `SKIP_PENDING_MIGRATIONS`, `DATABASE_POOL_MAX`
  - UX/Social: `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_HOURS`, `NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_TIKTOK_URL`, `NEXT_PUBLIC_YOUTUBE_URL`, `EA_STUDENT_LOGIN_URL`
- **Evidência:** `grep -rhoE "process\.env\.[A-Z0-9_]+" src/ scripts/ | sort -u` retorna 51 variáveis; `.env.example` documenta apenas 35. 18 não têm entrada no `.env.example`.
- **Descrição:** `MP_WEBHOOK_SECRET` é a mais crítica — sem ela o webhook MP rejeita todos os pagamentos em produção (ver `src/lib/mercadopago/process.ts:257`). `WA_GATEWAY_*` controla toda a automação de WhatsApp. `PMB_*` são necessários para vendas via vitrine principal. Um dev configurando um novo ambiente a partir do `.env.example` terá falhas silenciosas de webhook e automação.
- **Impacto:** Falhas de onboarding, webhook MP não funcional se `MP_WEBHOOK_SECRET` não for configurado, automação WA inoperante sem aviso.
- **Cenário de risco:** Novo dev clona repo, copia `.env.example`, configura as 35 vars documentadas, vai para produção — webhooks MP são rejeitados silenciosamente (`markLog(logId, false, "MP_WEBHOOK_SECRET ausente")`), matrículas automáticas não ocorrem, sem alerta imediato.
- **Recomendação:** Adicionar todas as 18 variáveis ao `.env.example` com comentários explicativos. `MP_WEBHOOK_SECRET` e `WA_GATEWAY_*` devem ser marcados como obrigatórios para os respectivos módulos.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] 7 variáveis no `.env.example` não são usadas em código (ruído de configuração)

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração
- **Arquivo:** `.env.example`
- **Linha/trecho:** Variáveis documentadas mas sem `process.env.*` no código:
  - `DIRECT_URL` — declarada no `.env.example`, não usada no código da app (apenas em `prisma.config.ts` como fallback)
  - `NEXTAUTH_SECRET` — código usa `AUTH_SECRET ?? NEXTAUTH_SECRET` (ambos funcionam; apenas `NEXTAUTH_SECRET` está no exemplo)
  - `NEXTAUTH_URL` — Next.js v5 usa `AUTH_URL`, não `NEXTAUTH_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — declarada em `env.ts` como optional, mas sem uso real no código da app
  - `SUPABASE_ACCESS_TOKEN` — apenas para MCP local (`.mcp.json`), não é env de runtime da app
  - `SUPABASE_ANON_KEY` — idem, aparece em `env.ts` schema mas sem uso direto
  - `SUPABASE_PROJECT_REF` — não há `process.env.SUPABASE_PROJECT_REF` em nenhum arquivo `src/`
- **Evidência:** `comm -13` entre código e `.env.example`.
- **Descrição:** `SUPABASE_ACCESS_TOKEN` é um Personal Access Token de admin do Supabase documentado como se fosse uma env de runtime — alguém pode injetar no Vercel por engano, expondo capacidade de admin do Supabase na app. `NEXTAUTH_URL` pode confundir: NextAuth v5 usa `AUTH_URL`.
- **Impacto:** Confusão no onboarding; risco de `SUPABASE_ACCESS_TOKEN` (poder de admin total no Supabase) injetado na app Vercel.
- **Cenário de risco:** Dev vê `SUPABASE_ACCESS_TOKEN` no `.env.example`, adiciona ao painel do Vercel como env de produção. Vazamento de variáveis de ambiente via `/api/admin/config` (que já expõe quais estão configuradas) ou via log leak expõe o token com poder de admin.
- **Recomendação:** Remover `SUPABASE_ACCESS_TOKEN` do `.env.example` (mover para a seção de comentário sobre MCP). Substituir `NEXTAUTH_SECRET` por `AUTH_SECRET` como nome principal. Remover `SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` se não há uso real.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] `AUTH_SECRET` e `NEXTAUTH_SECRET` são ambos opcionais no schema Zod — gap de validação early

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração / Auth
- **Arquivo:** `src/lib/env.ts:49-50`, `src/lib/env.ts:189-192`
- **Linha/trecho:**
  ```typescript
  AUTH_SECRET: z.string().min(32).optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  // ...
  if (!cached.AUTH_SECRET && !cached.NEXTAUTH_SECRET) {
    throw new Error(...)  // só lançado em assertEnv(), não no parse()
  }
  ```
- **Evidência:** A validação mútua (pelo menos um dos dois deve existir) só ocorre em `assertEnv()`, chamada via `instrumentation.ts` no boot do servidor. Se `instrumentation.ts` não for importado, ou se rodar em Edge runtime (onde `register()` retorna cedo por `NEXT_RUNTIME !== "nodejs"`), o gap não é detectado.
- **Descrição:** O schema Zod aceita `parse()` sem nenhum dos dois secrets. A app em ambiente malconfigurado (ambos ausentes) assina JWTs com secret aleatório a cada restart — invalidando todas as sessões sem log de erro imediato. A cobertura de `assertEnv()` depende de `instrumentation.ts` rodar.
- **Impacto:** Sessões invalidadas a cada restart em deploy malconfigurado, sem alerta claro.
- **Cenário de risco:** Novo ambiente sem `AUTH_SECRET`/`NEXTAUTH_SECRET` — app sobe sem erro, mas logout forçado a cada cold start.
- **Recomendação:** Adicionar `.refine()` no schema Zod: `envSchema.refine(d => d.AUTH_SECRET || d.NEXTAUTH_SECRET, { message: "AUTH_SECRET ou NEXTAUTH_SECRET obrigatório" })`. Assim falha no `parse()` independente de quem chamou.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] ~51 arquivos usam `process.env.*` direto, bypassando `env.ts`

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração / Manutenibilidade
- **Arquivo:** 51 arquivos (seleção relevante):
  - `src/app/api/aluno/suporte/route.ts:18` — `process.env.PMB_SUPPORT_EMAIL?.trim() || "profissionaliza@bmbr.com.br"`
  - `src/lib/pmb-config.ts:31,38` — `process.env.PMB_PLATAFORMA_VENDEDOR_ID`, `process.env.PMB_EA_POLO`
  - `src/lib/auth/bearer.ts` — lê `CRON_SECRET`/`INTERNAL_SECRET` direto (legítimo: edge-adjacent)
  - `src/app/api/admin/config/route.ts:147-148` — lê `ASAAS_API_URL`/`ASAAS_API_KEY` direto
  - `src/lib/supabase/storage.ts:4` — `process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL`
  - `src/proxy.ts` — lê várias envs direto (legítimo: Edge runtime, Zod não pode rodar)
- **Evidência:** `grep -rl "process\.env\." src/ | grep -v "env\.ts|logger\.ts"` retorna 51 arquivos.
- **Descrição:** O módulo `env.ts` foi criado para centralizar validação e tipagem. Mas 51 arquivos ainda leem `process.env.*` diretamente, removendo a cobertura do schema Zod. Alguns casos são legítimos (Edge runtime: `proxy.ts`, `bearer.ts`); outros não têm justificativa clara (`suporte/route.ts`, `pmb-config.ts`). O fallback em `suporte/route.ts` com email hardcoded como default é aceitável como graceful degradation, mas não é rastreado pelo schema.
- **Impacto:** Variáveis não validadas podem ser undefined em runtime; fallbacks hardcoded podem mascarar misconfigurações.
- **Recomendação:** Migrar arquivos Node runtime para `import { env } from "@/lib/env"`. Documentar quais casos são Edge runtime legítimos com comentário `// edge: não pode importar env.ts`. Adicionar as variáveis ausentes ao schema de `env.ts`.
- **Correção aplicada:** Parcialmente (env.ts existe mas não cobre todos os casos)
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Sem ambiente de staging separado — Vercel previews provavelmente apontam para banco de produção

- **Agente responsável:** DevOps/Config
- **Categoria:** Ambiente / Deploy
- **Arquivo:** `.github/workflows/ci.yml`, `.vercel/repo.json`, `vercel.json`
- **Linha/trecho:** `vercel.json` só tem `{"crons":[]}`. Não há `.env.preview` ou documentação de banco separado para previews.
- **Evidência:** Docs `docs/qa/lancamento/RE-ANALISE-002-LINKS.md:62` menciona: "Quando `NEXT_PUBLIC_APP_URL` não setado, MP volta para prod mesmo em dev/staging". `_context.md` confirma "não há ambiente de staging". Commit history não evidencia configuração de Preview env vars no Vercel dashboard.
- **Descrição:** Vercel cria um deployment preview para cada branch/PR. Se `DATABASE_URL` não estiver escopado para "Production only" no Vercel dashboard, todos os previews de PR leem/escrevem no banco de produção — incluindo o `npm run build` que executa `db:apply-pending`.
- **Impacto:** Abertura de PR pode disparar migração SQL em banco de produção. Testes manuais em preview criam dados reais, poluem analytics, disparam emails reais.
- **Cenário de risco:** Dev abre PR com uma migration nova. Vercel cria preview. Build do preview roda `db:apply-pending` com `DATABASE_URL` de produção. Migration roda. PR é depois abandonado, schema não corresponde mais ao código em main.
- **Recomendação:** (1) No painel Vercel, configurar `DATABASE_URL` como "Production" environment only. (2) Adicionar `SKIP_PENDING_MIGRATIONS=1` nas env vars de Preview. (3) Idealmente criar um banco Supabase de staging separado.
- **Correção aplicada:** Não (confirmado apenas por ausência de evidência)
- **Status:** Requer decisão humana
- **Confiança:** Média (depende de configuração no Vercel dashboard, não verificável por código)

---

### [Médio] `prisma.config.ts` usa fallback string vazia `?? ""` para `DATABASE_URL`

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração / Banco
- **Arquivo:** `prisma/prisma.config.ts:7`
- **Linha/trecho:**
  ```typescript
  url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  ```
- **Evidência:** Fallback para string vazia. Prisma (CLI) tentará conectar com URL vazia, gerando erro confuso (`invalid connection string`) em vez de "DATABASE_URL não definida".
- **Descrição:** Este arquivo é usado pela Prisma CLI (`prisma generate`, `prisma migrate`). O fallback `?? ""` significa que em ambiente sem DATABASE_URL, ao rodar `npx prisma migrate dev`, a mensagem de erro é sobre connection string inválida, não sobre env ausente. Pior: durante o `prisma generate` no `postinstall` do CI, a string vazia é passada sem erro (Prisma generate não precisa de URL real). Comportamento correto acidentalmente.
- **Impacto:** Debug mais difícil quando DATABASE_URL não está configurada.
- **Recomendação:** `url: process.env.DIRECT_URL ?? process.env.DATABASE_URL` (sem fallback `?? ""`). Prisma CLI emite erro claro se URL for undefined.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] `vercel.json` tem `crons: []` — pg_cron é a única fonte de schedule sem failsafe documentado

- **Agente responsável:** DevOps/Config
- **Categoria:** Crons / Observabilidade
- **Arquivo:** `vercel.json:2`, CLAUDE.md (commit `9dca6d8`)
- **Linha/trecho:** `{"crons":[]}` — Vercel Cron desabilitado intencionalmente.
- **Evidência:** Commit `9dca6d8` "migra todos os crons restantes para Supabase pg_cron". As 8 rotas em `src/app/api/cron/*/` são protegidas por `isCronAuthorized` (Bearer `CRON_SECRET`). Não há migration SQL configurando `pg_cron.schedule()` nem documentação de como o `CRON_SECRET` é passado do pg_cron para as rotas HTTP.
- **Descrição:** A migração para pg_cron está documentada apenas no commit message. Não existe migration SQL mostrando os `pg_cron.schedule()` calls, nem documentação de como o CRON_SECRET é armazenado no Supabase e passado via `net.http_post`. Se o Supabase project for migrado, os jobs pg_cron se perdem sem rastreamento em código.
- **Impacto:** Crons silenciosamente param se o Supabase project for recriado ou se o pg_cron job se descadastrar. Sem fallback de Vercel Cron, não há redundância.
- **Cenário de risco:** Rotação do `CRON_SECRET` — dev atualiza a env no Vercel mas esquece de atualizar o valor armazenado no pg_cron job. Todos os 8 crons passam a retornar 401 silenciosamente, sem alerta.
- **Recomendação:** (1) Criar migration SQL documentando os `SELECT cron.schedule(...)` para todos os 8 jobs. (2) Adicionar documentação em `docs/references/` sobre como o CRON_SECRET é configurado no pg_cron. (3) Adicionar alerta no Axiom/Vercel para rotas `/api/cron/*` com status != 200.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] `db:reset --force` exposto como script npm sem proteção

- **Agente responsável:** DevOps/Config
- **Categoria:** Deploy / Banco
- **Arquivo:** `package.json:10`
- **Linha/trecho:**
  ```json
  "db:reset": "prisma migrate reset --force"
  ```
- **Evidência:** `prisma migrate reset --force` apaga e recria o banco inteiro sem confirmação interativa. Com `DATABASE_URL` de produção no `.env.local`, `npm run db:reset` destruiria o banco de produção.
- **Descrição:** O comando é necessário para desenvolvimento local, mas a combinação com `--force` (skip de confirmação) e sem validação de ambiente é arriscada. Não há guarda `NODE_ENV === 'development'` no script.
- **Impacto:** Execução acidental em ambiente com DATABASE_URL de produção destrói todos os dados.
- **Recomendação:** Adicionar guarda explícita: `"db:reset": "node -e \"if(process.env.NODE_ENV==='production') { console.error('db:reset PROIBIDO em produção'); process.exit(1); }\" && prisma migrate reset --force"`. Ou renomear para `db:reset:local` e documentar que não deve rodar em produção.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] CI não tem gate de build — typecheck passa, mas build com migração nunca é validado

- **Agente responsável:** DevOps/Config
- **Categoria:** CI/CD
- **Arquivo:** `.github/workflows/ci.yml`
- **Linha/trecho:** CI executa: `npm run lint`, `npm run typecheck`, `npm audit` (continue-on-error). Não executa `npm run build`.
- **Evidência:** `ci.yml` não tem step de build. CLAUDE.md confirma: "Para validar build use `SKIP_PENDING_MIGRATIONS=1 npx next build`".
- **Descrição:** Um PR pode passar CI com typecheck OK mas falhar no build Vercel (ex: erro de import dinâmico, Server Component importando código client-only, etc.). O feedback só vem no deploy preview, não na PR.
- **Impacto:** Builds quebrados chegam a preview antes de serem detectados. Demora no ciclo de feedback.
- **Recomendação:** Adicionar step de build ao CI com `SKIP_PENDING_MIGRATIONS=1 npx next build` e `DATABASE_URL` fake (Prisma não consulta o banco no build com o adapter pg se não houver queries estáticas). Ou configurar `next build` para só rodar em `push:branches:[main]`, não em PRs.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] `SUPABASE_SERVICE_ROLE_KEY` não está no schema de `env.ts` — sem validação fail-fast

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração / Segredos
- **Arquivo:** `src/lib/supabase/storage.ts:5`, `src/lib/env.ts`
- **Linha/trecho:** `storage.ts` usa `throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurado")` ao ser chamado (lazy); `env.ts` lista `SUPABASE_SERVICE_ROLE_KEY: z.string().optional()` mas sem `requiredInProd()`.
- **Evidência:** `grep -n "SUPABASE_SERVICE_ROLE_KEY" src/lib/env.ts` → linha 99: `z.string().optional()`. Sem `requiredInProd()`.
- **Descrição:** Upload de logo/banner de vitrine falha silenciosamente ao primeiro uso em produção se a key não estiver configurada, em vez de falhar no boot. A validação lazy em `storage.ts` é melhor que nada, mas o erro chega para o usuário final.
- **Impacto:** Revendedor tenta fazer upload de logo, recebe erro interno sem mensagem útil.
- **Recomendação:** Mudar para `SUPABASE_SERVICE_ROLE_KEY: requiredInProd(z.string().min(1))` em `env.ts`. O erro de boot é preferível ao erro em runtime para o usuário.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] `next.config.ts` — `images.remotePatterns` usa wildcard `*.supabase.co` sem path restriction

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração / Segurança
- **Arquivo:** `next.config.ts:43`
- **Linha/trecho:**
  ```typescript
  { protocol: "https", hostname: "*.supabase.co" },
  ```
- **Evidência:** Sem `pathname` restriction. Permite `<Image>` de qualquer projeto Supabase, incluindo projetos externos.
- **Descrição:** O wildcard `*.supabase.co` permite que qualquer subdomínio do Supabase seja usado como fonte de `<Image>`. Um atacante que consiga injetar uma URL de imagem (ex: via XSS em campo de configuração de tenant) pode apontar para `attacker-project.supabase.co/storage/v1/...`. O risco é baixo por ser `<Image>` (server-side resize), não script.
- **Impacto:** Baixo — abuso de bandwidth via image proxy; sem execução de código.
- **Recomendação:** Restringir para o projeto específico: `{ protocol: "https", hostname: "jpwskehhnplmmtgyyxmf.supabase.co", pathname: "/storage/v1/object/public/**" }`. Adicionar `storage.googleapis.com` ou similar apenas se necessário.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] `tsconfig.json` — `target: "ES2017"` pode omitir polyfills para APIs modernas em Node 20

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração de Build
- **Arquivo:** `tsconfig.json:4`
- **Linha/trecho:** `"target": "ES2017"`
- **Evidência:** Node.js 20 suporta ES2022+. `ES2017` força downcompile de `async/await` para generators (já desnecessário), pode interagir mal com `isolatedModules` e bundle size.
- **Descrição:** Para Next.js 16 + Node 20, `ES2022` ou `ES2023` é mais adequado. `ES2017` pode causar downcompile desnecessário de features como `Promise.allSettled`, `Object.fromEntries`, `??=`, `?.`. O impacto prático é mínimo dado que Next.js tem sua própria pipeline de transpile.
- **Impacto:** Bundle ligeiramente maior; sem impacto funcional.
- **Recomendação:** Mudar `target` para `"ES2022"` para alinhar com Node 20 LTS.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Média

---

### [Informativo] Observabilidade estruturada bem implementada

- **Agente responsável:** DevOps/Config
- **Categoria:** Observabilidade
- **Arquivo:** `src/lib/logger.ts`, `src/lib/observability/log-transport.ts`
- **Evidência:** Pino com `redact` de 30+ paths sensíveis (passwords, tokens, CPF, CNPJ, card data). Fan-out HTTP para Axiom quando configurado. `contextLogger()` via AsyncLocalStorage. ESLint bane `console.*` em `src/lib/**` e `src/app/api/**`.
- **Descrição:** Implementação sólida. Paths redactados incluem headers HTTP sensíveis (asaas-access-token, x-signature), dados pessoais (cpf, cnpj, rg), cripto (iv, ciphertext). Fallback gracioso: sem Axiom, só stdout (Vercel Log Drain leva para qualquer aggregator).
- **Status:** Informativo
- **Confiança:** Alta

---

### [Informativo] Crons protegidos corretamente por `isCronAuthorized` com timing-safe compare

- **Agente responsável:** DevOps/Config
- **Categoria:** Crons / Segurança
- **Arquivo:** `src/lib/auth/bearer.ts`, todos os `src/app/api/cron/*/route.ts`
- **Evidência:** `isCronAuthorized` usa `timingSafeEqual` do Node crypto. Todos os 8 GET handlers delegam para POST que já autentica. Sem `CRON_SECRET`, retorna `false` (fail-closed).
- **Descrição:** Implementação correta. GET e POST protegidos. Fail-closed por design.
- **Status:** Informativo
- **Confiança:** Alta

---

### [Informativo] `assertEnv()` / `instrumentation.ts` provê fail-fast no boot em produção

- **Agente responsável:** DevOps/Config
- **Categoria:** Configuração
- **Arquivo:** `src/instrumentation.ts`, `src/lib/env.ts:164-195`
- **Evidência:** `instrumentation.ts` chama `assertEnv()` no Node runtime boot. Em produção, relança erro (derruba servidor). Em dev, só loga aviso. Redis ausente em produção = warning, não fatal (degradação graciosa do rate-limit documentada).
- **Descrição:** Boa prática. A validação lazy via Proxy Zod + boot via instrumentation é o padrão correto para Next.js App Router com Server Components.
- **Status:** Informativo
- **Confiança:** Alta

---

## Checklist de Produção

```
DEPLOY / MIGRAÇÕES
[ ] Adicionar pg_advisory_xact_lock no apply-pending-migrations.mjs (anti-race de deploy concorrente)
[ ] Configurar DATABASE_URL como "Production only" no painel Vercel (não expor em Preview)
[ ] Adicionar SKIP_PENDING_MIGRATIONS=1 nas env vars de Preview do Vercel
[ ] Documentar (e idealmente codificar) os 8 pg_cron.schedule() calls em migration SQL
[ ] Criar banco Supabase de staging separado para deploys de preview

SEGREDOS / ENV
[ ] Adicionar ao .env.example: MP_WEBHOOK_SECRET, WA_GATEWAY_URL, WA_GATEWAY_API_KEY
[ ] Adicionar ao .env.example: PMB_MP_ACCESS_TOKEN, PMB_PLATAFORMA_VENDEDOR_ID, PMB_PLATAFORMA_POLO, PMB_SUPPORT_EMAIL
[ ] Adicionar ao .env.example: AXIOM_TOKEN, AXIOM_DATASET, AXIOM_URL, LOG_LEVEL, DATABASE_POOL_MAX
[ ] Adicionar ao .env.example: EA_STUDENT_LOGIN_URL, NEXT_PUBLIC_SUPPORT_*, NEXT_PUBLIC_*_URL (sociais)
[ ] Remover SUPABASE_ACCESS_TOKEN do .env.example (é token MCP, não runtime da app)
[ ] Substituir NEXTAUTH_SECRET por AUTH_SECRET como nome principal no .env.example
[ ] Verificar se AUTH_SECRET ou NEXTAUTH_SECRET está setado em todos os ambientes Vercel
[ ] Verificar se MP_WEBHOOK_SECRET está configurado no Vercel (sem ele, matrículas não funcionam)
[ ] Documentar rotação do CRON_SECRET: requer atualização simultânea no Vercel + pg_cron job

VALIDAÇÃO / CÓDIGO
[ ] Adicionar .refine() no envSchema para exigir AUTH_SECRET OU NEXTAUTH_SECRET (não só em assertEnv)
[ ] Adicionar SUPABASE_SERVICE_ROLE_KEY: requiredInProd() no envSchema (fail-fast no boot)
[ ] Migrar src/app/api/aluno/suporte/route.ts para usar env.ts (PMB_SUPPORT_EMAIL)
[ ] Migrar src/lib/pmb-config.ts para usar env.ts (PMB_EA_VENDEDOR_ID, PMB_EA_POLO)
[ ] Remover fallback ?? "" de prisma/prisma.config.ts (url: process.env.DIRECT_URL ?? process.env.DATABASE_URL)
[ ] Adicionar proteção contra db:reset em produção (guarda NODE_ENV no script npm)

BUILD / CI
[ ] Adicionar step de build ao CI: SKIP_PENDING_MIGRATIONS=1 npx next build (com DATABASE_URL fake)
[ ] Restringir images.remotePatterns para o hostname específico do Supabase (não wildcard *.supabase.co)
[ ] Considerar mudar tsconfig.json target de ES2017 para ES2022

OBSERVABILIDADE
[ ] Configurar alerta para rotas /api/cron/* com status != 200 (pg_cron silencioso em falha)
[ ] Verificar Vercel Log Drain configurado (evita depender do Axiom HTTP transport em serverless)
[ ] Adicionar CRON_SECRET ao pg_cron job no Supabase com processo documentado de rotação
```

---

## Referências de arquivo (principais)

| Arquivo | Relevância |
|---|---|
| `package.json:7,10` | build roda migração; db:reset --force sem proteção |
| `scripts/apply-pending-migrations.mjs:140-151` | sem advisory lock |
| `.env.example` | 18 vars ausentes, 7 vars mortas |
| `src/lib/env.ts:49-50,189-192` | gap de validação AUTH_SECRET |
| `src/lib/mercadopago/process.ts:254-257` | MP_WEBHOOK_SECRET — rejeita sem essa env |
| `vercel.json` | crons vazios — pg_cron sem rastreamento em código |
| `prisma/prisma.config.ts:7` | fallback `?? ""` |
| `next.config.ts:43` | wildcard `*.supabase.co` |
| `.github/workflows/ci.yml` | sem gate de build |
| `src/lib/auth/bearer.ts` | timing-safe compare — correto |
| `src/instrumentation.ts` | fail-fast boot — correto |
