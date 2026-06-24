# Achados — Domínio: código / arquitetura
_Auditor read-only · 2026-06-24 · Nota do domínio: **8.7/10** · P0=0 · P1=0 · P2=3 · P3=2_

Re-verificação da rodada de 2026-06-20 + varredura dos commits recentes (LMS webhook receiver,
credenciais de plataforma por matrícula, branding white-label, sub-revendas, suporte roteado, aba API).

## Portão Zero-Erro (medido nesta rodada)
| Etapa | Comando | Resultado |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASSOU — exit 0, ZERO erros** |
| Lint | `npx eslint` | **PASSOU — 0 errors, 1 warning** (não bloqueante) |
| Testes | `npx vitest run` | **PASSOU — 37 arquivos / 218 testes verdes** |
| Build | `next build` | **NÃO EXECUTADO localmente** — `npm run build` encadeia `db:apply-pending` (toca prod). Já roda no CI (`ci.yml`) com `SKIP_PENDING_MIGRATIONS=1` + `DATABASE_URL` dummy → COD-002 fechado. |

Type-safety exemplar: **zero** `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` em `src/`; `tsconfig strict:true` real;
33 `eslint-disable` legítimos; 1 warning sobrou (`scripts/render-cert-samples.tsx:1` disable inútil — fora de `src/`).
Boundary server/client íntegro: **zero** componente client importando `@/lib/prisma|crypto|asaas/client|mercadopago/client|lms/client|email/*`.
Supabase centralizado (sem `createClient` espalhado); Prisma singleton (sem `new PrismaClient` fora de `lib/prisma.ts`).
Error boundaries presentes: `error.tsx` (5), `global-error.tsx` (1), `not-found.tsx` (6), `loading.tsx` (5).
`assertEnv()` é fail-fast em prod via `src/instrumentation.ts` (validação de config no boot — OK).
Migrations recentes idempotentes (`ADD COLUMN IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`).

### Status das findings de 2026-06-20
| ID | Estado hoje | Nota |
|---|---|---|
| COD-001 (LMS env fora do schema) | **CORRIGIDO** | `LMS_API_URL`/`LMS_API_KEY` no `envSchema` (env.ts:107-108) + warning em `assertEnv()` (env.ts:212-217); `lms/config.ts` lê de `env.*`. |
| COD-002 (CI sem build) | **CORRIGIDO** | `ci.yml` agora tem step **Build** com `SKIP_PENDING_MIGRATIONS=1` + `DATABASE_URL` dummy. |
| COD-003 (process.env espalhado) | **ABERTO — PIOROU** | 46 → **59** arquivos. Re-aberto abaixo. |
| COD-004 (8 ciclos de módulo) | **ABERTO** | madge confirma os mesmos 8 ciclos. Re-aberto abaixo. |
| COD-005 (exports mortos) | **CORRIGIDO** | `swallowCleanup` e `shouldSendEmail` removidos (grep vazio). |
| COD-006 (`.catch(()=>{})` silencioso) | **ABERTO** | Mesmos ~9 sites de side-effect/financeiro. Re-aberto abaixo. |

---

## Achados (abertos)

### [COD-003] 59 arquivos leem `process.env` direto, contrariando a convenção env.ts ⚠️MIGRAÇÃO
- **Severidade:** P2
- **Status:** Aberto
- **Local:** 59 arquivos (subiu de 46). Novos desde 2026-06-20: `src/lib/support/student-support.ts:13` (lê `PMB_SUPPORT_EMAIL` — env **nem declarada** no schema), `src/lib/branding.ts`, `src/lib/resellers/create.ts:141` (`ASAAS_API_KEY`), `src/lib/placar/snapshot.ts`, `src/lib/system-settings.ts`, entre outros. Persistentes: `asaas/client.ts`, `mercadopago/client.ts`, `lms/client.ts`, `redis.ts`, `ratelimit.ts`, `proxy.ts`, `api/checkout/route.ts`, `api/aluno/comprar/route.ts`, `api/webhooks/mercadopago/route.ts`.
- **Evidência:** `grep -rln "process\.env\." src --include=*.ts --include=*.tsx | grep -v env.ts | grep -v .test.` → 59. `env.ts:16` documenta "NÃO leia process.env.X diretamente em código novo". `PMB_SUPPORT_EMAIL` (student-support.ts:13) escapa 100% da validação central — se faltar/typo, o roteamento de suporte cai no default hardcoded sem aviso.
- **Impacto:** baixo em runtime hoje; dívida de migração. A fonte-de-verdade de envs está fragmentada — o checklist de secrets do Docker Swarm (que precisa enumerar todo segredo a injetar) não tem uma lista canônica. `PMB_SUPPORT_EMAIL` ausente do schema é um gap concreto de validação (item 4.5 da referência).
- **Correção:**
  1. Declarar `PMB_SUPPORT_EMAIL: z.string().email().optional()` no `envSchema` (env.ts) e trocar `student-support.ts:13` por `env.PMB_SUPPORT_EMAIL`.
  2. Migração incremental por arquivo, priorizando os clients de integração (`asaas/client.ts`, `mercadopago/client.ts`, `lms/client.ts`, `pmb-config.ts`, `resellers/create.ts`): declarar a env no schema (se faltar) e trocar `process.env.X` → `env.X`. Manter `process.env` apenas em `proxy.ts`/`redis.ts`/`ratelimit.ts`/`instrumentation.ts` (rodam no Edge/boot antes do proxy lazy de `env` — documentar a exceção em comentário).
- **Verificação:** `grep "PMB_SUPPORT_EMAIL" src/lib/env.ts` retorna 1 linha; `grep -rln "process\.env\." src/lib/{asaas,mercadopago,lms} | grep -v env.ts` decresce; `npx tsc --noEmit` verde.

### [COD-006] 9 `.catch(() => {})` silenciosos em side-effects (2 no motor de comissão) — debug cego
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/referrals/payout.ts:437` (backfill de comissão — financeiro) · `:548` · `src/lib/referrals/monthly.ts:397,497` · `src/lib/referrals/commission.ts:569` (notificação de refund parcial) · `src/lib/asaas/process.ts:653` (notificação SUPER_ADMIN de comissão CONGELADA) · `src/lib/automation/dispatch.ts:223,243` (gravação de `StudentLeadActivity` = audit-trail) · `src/app/api/admin/automacao/whatsapp/status/route.ts:72` · `src/app/api/painel/config/sales-gateway/route.ts:100`.
- **Evidência:** o projeto tem o helper `swallow(context)` (errors.ts:29) usado **108×** — loga `warn` antes de engolir. Estes sites usam `.catch(() => {})` cru. `asaas/process.ts:653` engole a notificação que avisa o SUPER_ADMIN que uma comissão foi congelada e os saques bloqueados (precisa de ação manual): se `createNotification` falhar, o admin nunca é avisado. `dispatch.ts:223,243` perdem registros de auditoria de envio de WhatsApp.
- **Impacto:** falha em notificação financeira/cleanup/audit some sem log → operador cego. Os 2 do motor de comissão e o de `asaas/process.ts` tocam dinheiro (compliance: alterações de billing devem registrar quem/o quê/quando — guardrail do projeto).
- **Correção:** trocar cada `.catch(() => {})` por `.catch(swallow("<contexto>"))` (importar de `@/lib/errors`). Contextos sugeridos: `referrals.payout.backfill`, `referrals.payout.notify`, `referrals.monthly.notify`, `referrals.commission.refund_notify`, `asaas.process.frozen_commission_notify`, `automation.dispatch.activity_no_whatsapp`, `automation.dispatch.activity_engine_error`, `automacao.whatsapp.stop_session`, `painel.sales_gateway.side_effect`.
- **Verificação:** `grep -rnE "\.catch\(\(\) *=> *\{\}\)" src/lib/referrals src/lib/asaas/process.ts src/lib/automation/dispatch.ts src/app/api/admin/automacao src/app/api/painel/config` → vazio; `npx tsc --noEmit` verde.

### [COD-007] `createReseller` não é atômico: Asaas + Tenant + User em writes separados → órfãos em falha
- **Severidade:** P2
- **Status:** Aceito (risco assumido — decisão do dono; registrado para rastreio)
- **Local:** `src/lib/resellers/create.ts:141-194` (cria customer + subscription no Asaas) → `:199` (`prisma.tenant.create`) → `:296` (`syncTenantBrandingToLms`) → `:303` (`prisma.user.create`).
- **Evidência:** a assinatura Asaas é criada ANTES do `tenant.create`, e o `user.create` (owner) é um 4º write separado. Não há `prisma.$transaction` nem compensação (rollback do Asaas) se um passo posterior falhar. O e-mail do owner é pré-checado em `:113-123` (mitiga o caso de duplicidade), mas há janela TOCTOU e qualquer falha de DB entre `:199` e `:316` deixa: (a) assinatura Asaas cobrando sem tenant, ou (b) tenant sem usuário owner (revenda inacessível). Caminho idêntico em `src/app/api/revendedores/cadastro/route.ts` (self-signup público) e `src/app/api/painel/revendas/route.ts` (sub-revenda).
- **Impacto:** raro, mas quando ocorre é financeiro: cliente é cobrado por uma revenda que não existe, ou uma revenda nasce sem login. Recuperação é manual (reconciliação Asaas ↔ Tenant já existe no painel, o que reduz a gravidade). Conhecido e aceito pelo dono (lote-ajustes-junho).
- **Correção (se for endereçar):** envolver `tenant.create` + `user.create` num `prisma.$transaction([...])` (os dois writes de DB), mantendo o Asaas fora da transação mas com bloco `catch` que, ao falhar o DB, cancela a assinatura recém-criada (`cancelSubscription(asaasSubscriptionId)`) e propaga erro. Como mínimo: mover o `user.create` para imediatamente após o `tenant.create` dentro de um `$transaction`, deixando os side-effects best-effort (branding/templates/vitrine) para depois do commit.
- **Verificação:** teste de integração simulando falha no `user.create` e asseverando que nenhum `Tenant` é persistido (ou que a assinatura Asaas é cancelada). `npx tsc --noEmit` verde.

### [COD-004] 8 dependências circulares no grafo de módulos (7 type-only, 1 mista)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** via `npx madge --circular`: (1-3) `checkout-wizard.tsx ↔ {checkout-form-empresa, checkout-form-pessoal, checkout-payment-preview}`; (4) `leads-kanban-board → lead-detail-drawer → lead-kanban-column` (**mista** — exporta valor `STAGE_META`); (5) `certificates/templates/classic ↔ info-page`; (6) `config-tabs ↔ account-form`; (7-8) `config-tabs → billing-section → asaas-gateway-section` / `→ billing-section`.
- **Evidência:** madge processou 1039 arquivos → "Found 8 circular dependencies". 7 ciclos são type-only (apagados na compilação). O ciclo 4 mistura valor (`STAGE_META`) → único com risco teórico de TDZ.
- **Impacto:** nenhum erro hoje; risco organizacional + ciclo 4 pode dar `undefined` em hot-reload/tree-shaking agressivo.
- **Correção:** extrair tipos compartilhados para `*.types.ts` neutros; mover `STAGE_META` para `lead-kanban.shared.ts`; filhos importam do neutro em vez do pai.
- **Verificação:** `npx madge --circular --ts-config tsconfig.json --extensions ts,tsx src/` → none.

### [COD-008] CSP `connect-src`/`img-src` e config acoplados à Vercel; sem `output:'standalone'` ⚠️MIGRAÇÃO
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `next.config.ts` (sem `output:"standalone"`; `images.unoptimized:true`; CSP `connect-src ... https://*.upstash.io https://vitals.vercel-insights.com`; `script-src ... https://va.vercel-scripts.com`) · `src/proxy.ts:152-155,174-177,210` (Upstash via REST `fetch`) · `@vercel/analytics`+`@vercel/speed-insights` no `package.json`.
- **Evidência:** sem `output:"standalone"` o Dockerfile da VPS não produz o bundle mínimo esperado pelo Swarm. CSP libera domínios Upstash REST + telemetria Vercel — na VPS o Redis vira TCP (REST `fetch` do proxy quebra; já há fallback de DB) e `*.vercel-insights`/`va.vercel-scripts` ficam mortos. `images.unoptimized:true` (workaround de cota Vercel) é neutro p/ migração mas precisa de revisão com MinIO/CDN próprio.
- **Impacto:** nenhum em produção Vercel hoje; checklist de migração. Sem o flag de standalone o container fica gordo/quebrado; a CSP precisa ser reescrita para os domínios self-hosted (MinIO `s3.bmbr.com.br` já está em `img-src`).
- **Correção:** ao migrar — adicionar `output:"standalone"`; remover `*.upstash.io`/`vitals.vercel-insights.com`/`va.vercel-scripts.com` da CSP (ou trocar por domínio do log-drain self-hosted); trocar `@upstash/redis` REST por `ioredis`/`redis` TCP nos consumidores (`redis.ts`, `ratelimit.ts`, `proxy.ts`); remover `@vercel/analytics`/`speed-insights` ou substituir. **Não aplicar agora** (ainda em Vercel) — é o pacote de migração.
- **Verificação:** pós-migração, `grep -n "output" next.config.ts` retorna standalone; CSP sem domínios Vercel/Upstash; `grep -rn "@upstash/redis" src/` vazio.

## Cobertura
- **294 route handlers / 390 métodos:** varredura de boundary (auth/secret/prisma em client → zero), padrão de erro (try/catch, `.catch(()=>null)` legítimo em parse de body e fallbacks de QR/billing), Zod nos recém-criados. Recentes auditados a fundo: `webhooks/lms` (assinatura-primeiro, idempotente, race P2002 tratada — OK), `painel/revendas` (Zod + gating de plano + guard — OK), `aluno/curso/[enrollmentId]/acessar`, `cron/resync-lms-credentials`, `cron/sync-lms-branding`. **OK** salvo COD-006 (sales-gateway, automacao/status).
- **193 módulos lib / ~577 exports:** ts-prune (mortos → COD-005 fechado) + madge (ciclos → COD-004) + grep type-safety (zero any). LMS novo (`lms-webhook`, `lms-process`, `lms-credentials`, `lms/branding`, `support/student-support`): type-safe, idempotente, isolado por sessão/tenant — **OK** salvo COD-003 (`student-support.ts:13`, `branding.ts`) e COD-006 (referrals/asaas/automation).
- **324 componentes:** boundary-leak (prisma/crypto/secrets/clients em client → **zero**). `api-docs-tab.tsx` (recente): recebe `pmbWebhookSecret` mas o pai server-side (`admin/configuracoes/page.tsx:37-45`) gateia por `requireAdminSession()` + role `SUPER_ADMIN` e anula p/ não-super; nunca `NEXT_PUBLIC_*` → **OK**.
- **4 arquivos `"use server"`** (`validar/page.tsx`, `inadimplente/page.tsx`, `coupons/preview.ts`, `coupons/types.ts`): diretiva correta → **OK**.
- **App Router specials:** error/global-error/not-found/loading mapeados; sem `template.tsx`/`default.tsx` (N/A) → **OK**.
- **tsconfig:** `strict:true`, `target ES2022`, `moduleResolution bundler` → **OK**.
- **Lint/format/hygiene:** ESLint sem erros; pre-commit não verificado neste domínio (ver QA); zero `console.log`; 2 `TODO(segurança)` documentados (cobranca/[paymentId]) → **OK**.
- **Boot/env:** `assertEnv()` via `instrumentation.ts` fail-fast em prod → **OK** (gap pontual: `PMB_SUPPORT_EMAIL` fora do schema → COD-003).
- ⚠️MIGRAÇÃO (COD-008): sem `output:"standalone"`; `@upstash/redis` REST (`redis.ts`/`ratelimit.ts`/`proxy.ts`); CSP com `*.upstash.io`+`*.vercel-insights`+`va.vercel-scripts`; `@vercel/analytics`+`speed-insights`; `placar/stream` `maxDuration=300`; Edge runtime do proxy não existe no Swarm (fallback de DB cobre).
