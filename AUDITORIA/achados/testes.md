# Auditoria — Testes / QA
_Data: 2026-06-24 · Referência: .claude/skills/auditoria-saas/references/11-testes-qa.md · Itens do inventário cobertos: 12/12 relevantes_

## Resumo
- Itens verificados: 12 · Achados: **P0=0 P1=0 P2=5 P3=1** · Nota do domínio: **7/10**
- `npx vitest run` → **PASSOU**: 37 arquivos, **218 testes verdes** (~1.6s, determinísticos, sem flakiness).
- `npx tsc --noEmit` → **0 erros**. `npm run lint` → **0 errors, 1 warning** não-bloqueante.
- **Evolução desde 2026-06-20:** suíte saltou de 8 arquivos/44 testes para 37/218. **4 dos 9 achados anteriores foram CORRIGIDOS** (QA-001 isolamento de tenant, QA-002 webhook Asaas, QA-003 build no CI, QA-004 motor de comissão/clawback). O domínio deixou de ter risco P1.
- O CI (`ci.yml`) agora roda **Lint + Typecheck + Test + Build** e bloqueia merge — Portão Zero-Erro institucionalizado. Resta a lacuna de integração/E2E e de cobertura de algumas funções puras novas (commits LMS).

---

## Achados

### [QA-010] Dispatcher do webhook LMS (`processLmsWebhookEvent`) sem teste — só a assinatura é testada
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/webhooks/lms-process.ts:98` (`processLmsWebhookEvent`), `:28` (`isLmsWebhookEvent`), `:66` (`clampPercent`); rota `src/app/api/webhooks/lms/route.ts:39`
- **Evidência:** o commit recente `2f2f708` adicionou o receiver LMS→PMB. Existe `src/lib/webhooks/lms-webhook.test.ts` (6 testes) cobrindo **apenas** `validateLmsWebhookSignature`. O dispatcher `processLmsWebhookEvent` — que faz parse Zod por evento, atualiza progresso (`progressPercent`/`progressStatus`), emite certificado (`issueCertificateIfEligible`, `lms-process.ts:120`), dispara `syncCatalogFromLMS` e roteia suporte — **não tem nenhum teste**. `clampPercent` (`:66`) é função pura de borda (`Number.isFinite`, clamp 0–100, `Math.round`) sem cobertura. A referência exige "evento duplicado é deduplicado (idempotência)" e "payload inválido retorna 400/422, não 500" (`11-testes-qa.md:16-17`).
- **Impacto:** regressão silenciosa em `clampPercent` grava progresso inválido; mudança no schema de evento ou no critério de match aluno↔matrícula (`findLmsEnrollment`, `:72`) deixa de emitir certificado / de rotear suporte sem nada para pegar antes do deploy.
- **Correção:** criar `src/lib/webhooks/lms-process.test.ts`. Mockar `@/lib/prisma`, `@/lib/certificates/issue`, `@/lib/catalog/sync-lms` e `@/lib/support/student-support` via `vi.mock`. Casos: (a) `isLmsWebhookEvent` true só para os 5 eventos de `LMS_WEBHOOK_EVENTS` e false para `null`/desconhecido; (b) `clampPercent` em `NaN`→0, `-5`→0, `150`→100, `33.6`→34; (c) `course.completed` com matrícula encontrada → `enrollment.update` com `progressPercent:100`/`progressStatus:"CONCLUIDO"` e chama `issueCertificateIfEligible` quando `certificateAutoIssue` true e NÃO chama quando false; (d) matrícula não encontrada → `{ok:false}` sem update; (e) `lesson.completed` sem `completedAt` → `progressStatus:"EM_ANDAMENTO"`; (f) `student.question.created` com aluno → `createStudentSupportTicket`; sem aluno → `{ok:false}`; (g) payload inválido por evento (`courseCompletedSchema`) → `parse` lança ZodError (o route converte para 400).
- **Verificação:** `npx vitest run src/lib/webhooks/lms-process.test.ts`

### [QA-011] Idempotência do receiver de webhook LMS (dedup por `X-PMB-Event-Id` + corrida P2002) sem teste
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/webhooks/lms/route.ts:86-97` (dedup por `externalEventId`), `:134-168` (`createLog`, recuperação de corrida P2002)
- **Evidência:** o route implementa idempotência: evento já `processed` → `200 {duplicate:true}` (`:91-93`); log não-processado → reprocessa; corrida de duas entregas do mesmo `event-id` é resolvida re-buscando o vencedor após `P2002` (`:155-165`). Nenhum teste exercita esse fluxo — não há harness de route handler nem teste de integração. A referência classifica "evento duplicado é deduplicado" como item-chave de webhook (`11-testes-qa.md:16`). Os webhooks Asaas e MP têm teste de validação; o de idempotência de LOG do LMS não tem.
- **Impacto:** uma re-entrega do LMS poderia reprocessar (re-emitir certificado, re-sincronizar catálogo) se a lógica de dedup regredir; a corrida P2002 mal tratada lançaria 500 em vez de convergir para o log vencedor.
- **Correção:** extrair a lógica de idempotência testável ou adicionar teste de unidade ao `createLog`/branch de dedup mockando `prisma.webhookLog`. Mínimo viável: criar `src/app/api/webhooks/lms/route.test.ts` que importa o `POST`, mocka `@/lib/prisma`, `@/lib/env` (`PMB_WEBHOOK_SECRET` setado) e `@/lib/webhooks/lms-process`. Casos: assinatura inválida→401; `PMB_WEBHOOK_SECRET` ausente→503; evento não suportado→400; JSON inválido→400; `webhookLog.findUnique` com `processed:true`→200 `{duplicate:true}` (não chama `processLmsWebhookEvent`); novo→cria log, processa, marca `processed:true`; `createLog` recebendo `P2002` (`PrismaClientKnownRequestError` code `P2002`) → re-busca e retorna o id vencedor sem lançar.
- **Verificação:** `npx vitest run src/app/api/webhooks/lms/route.test.ts`

### [QA-012] Roteamento de suporte por tenant (`createStudentSupportTicket`) sem teste — decisão de isolamento
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/support/student-support.ts:68` (`createStudentSupportTicket`), `:76` (`isPmb`), `:85` (`tenantId: isPmb ? null : student.tenantId`)
- **Evidência:** commit `2f2f708` introduziu o roteamento de suporte do aluno por unidade. A decisão `isPmb = student.tenant?.slug === PMB_TENANT_SLUG` (`:76`) define se o `ContactMessage` nasce com `tenantId: null` (caixa PMB) ou `tenantId` da revenda (`:85`), e roteia a notificação para `ROLE:SUPER_ADMIN` vs `TENANT` e o e-mail para `PMB_SUPPORT_EMAIL` vs o dono da unidade. É uma fronteira de isolamento de tenant (chamado de aluno de revenda nunca pode cair na caixa PMB e vice-versa) e **não tem teste**.
- **Impacto:** se `isPmb` regride (ex.: comparação de slug muda), o chamado de uma revenda vaza para a caixa do SUPER_ADMIN/PMB ou um chamado PMB cai indevidamente numa revenda — vazamento de PII de aluno entre caixas de tenants distintos.
- **Correção:** criar `src/lib/support/student-support.test.ts`. Mockar `@/lib/prisma` (`contactMessage.create`), `@/lib/notifications` (`createNotification`), `@/lib/email/resend` (`sendEmail`, `isEmailConfigured`). Casos: (a) aluno com `tenant.slug === "__pmb__"` → `contactMessage.create` com `tenantId:null`, `createNotification` com `audience:"ROLE", roleTarget:"SUPER_ADMIN"`, destinatário e-mail = `PMB_SUPPORT_EMAIL`; (b) aluno de revenda → `tenantId` da revenda, `audience:"TENANT"` com o `tenantId`, e-mail = `owner.email`; (c) falha em `contactMessage.create` não lança (best-effort — segue para notificação); (d) `isEmailConfigured()` false → não chama `sendEmail`.
- **Verificação:** `npx vitest run src/lib/support/student-support.test.ts`

### [QA-005] Resiliência do rate-limit / Redis sem teste (regressão de fail-open + anti-spoof de IP)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/ratelimit.ts` (`runLimit` fail-open/closed; `ipFrom` parsing XFF anti-spoof); não existe `src/lib/ratelimit.test.ts`
- **Evidência:** re-verificado em 2026-06-24 — ainda **sem teste** (`ls src/lib/ratelimit.test.ts` → ausente). A correção `dcd03fd` (MEMORY: "Resiliência a outage do Redis") mudou o controle de fluxo para capturar falha de **comando** Redis (não só `if(!redis)`) e manter fail-open no login. Sem teste de regressão, o comportamento fail-open e o parsing anti-spoof de `X-Forwarded-For` podem regredir silenciosamente.
- **Impacto:** regressão pode reintroduzir fail-closed (login devolve 500 quando a cota Upstash estoura) ou aceitar IP forjado no XFF, derrotando o rate limit.
- **Correção:** criar `src/lib/ratelimit.test.ts`. Mockar o limiter com `vi.fn()` que **rejeita** (simula falha de comando Redis) e confirmar que `runLimit` resolve fail-open (permite a requisição) e loga; um segundo caso com `redis` ausente também fail-open. Para `ipFrom`: confirmar que um `X-Forwarded-For` com cadeia (`"1.2.3.4, 9.9.9.9"`) usa o IP confiável correto e ignora valores forjados conforme a política implementada.
- **Verificação:** `npx vitest run src/lib/ratelimit.test.ts`

### [QA-006] Zero testes de integração contra banco e zero E2E
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `package.json` (sem `@playwright/test`); nenhum harness Prisma de integração (todos os `*.test.ts` mockam `@/lib/prisma`)
- **Evidência:** re-verificado — `grep playwright package.json` = nada; não há `playwright.config.*`. Nenhum teste conecta em banco real (todos usam `vi.mock("@/lib/prisma")`). Fluxos login→checkout→fulfillment (EA + LMS) nunca são exercidos ponta-a-ponta. A referência pede E2E em login/checkout/billing (`11-testes-qa.md:9-10`) e integração contra banco de teste (`:8`).
- **Impacto:** quebras de fluxo end-to-end (ex.: checkout MP → `fulfill.ts` → provisionamento LMS/EA) só aparecem em produção; não há rede de segurança para regressões de integração entre camadas.
- **Correção:** (médio prazo) adicionar `@playwright/test` + `playwright.config.ts` com 1 smoke E2E de checkout/login contra o staging; e/ou um harness de integração Prisma contra um Supabase branch/Postgres de teste exercitando `fulfill.ts` (matrícula primária + satélites + provisionamento). Rodar o E2E em job separado do CI (não bloqueante no início).
- **Verificação:** `npx playwright test` (smoke) roda verde no staging; job de integração roda no CI.

### [QA-007] Sem thresholds de cobertura nos módulos críticos
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `vitest.config.ts` (sem bloco `coverage`)
- **Evidência:** re-verificado — `grep coverage vitest.config.ts package.json` = nada. Apesar de a suíte ter crescido muito, nada impede a cobertura de `auth`/`tenant`/`billing`/`referrals` cair em PRs futuros. A referência pede thresholds nos módulos críticos (`11-testes-qa.md:22`). Rebaixado de P2 para P3 vs 2026-06-20 porque a cobertura efetiva desses módulos hoje é alta (scope, roles, guards, referrals, asaas, mp, checkout, coupons já testados).
- **Impacto:** erosão silenciosa de cobertura ao longo do tempo.
- **Correção:** em `vitest.config.ts`, adicionar `test.coverage` com `provider:"v8"` e `thresholds` por glob para `src/lib/{auth,tenant,referrals,asaas,mercadopago,checkout,coupons,webhooks}/**` (ex.: lines/functions ≥ 70). Adicionar script `"test:coverage": "vitest run --coverage"` e instalar `@vitest/coverage-v8` como devDependency.
- **Verificação:** `npx vitest run --coverage` falha quando a cobertura cai abaixo do threshold.

### [QA-008] Funções puras de negócio ainda sem teste (escopo reduzido)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/tenant/monthly-policy.ts:27` (`monthlyAllowedOn`), `:37` (`effectivePaymentType`); `src/lib/students/display-status.ts:30` (`deriveStudentDisplayStatus`), `:12` (`isPaidEnrollment`), `:41` (`countEnrollmentStatuses`)
- **Evidência:** re-verificado — parte do QA-008 original foi **corrigida** (`tenant/slug.test.ts`, `tenant/forbidden-names.test.ts`, `auth/roles.test.ts`, `checkout/price-guard.test.ts` para `isSellablePrice` existem). Restam sem teste: `monthly-policy` (política de tipo de pagamento por canal) e `display-status` (status derivado do aluno — MEMORY "Status do aluno é derivado": `Student.status` é manual, o exibido vem de `deriveStudentDisplayStatus`). `catalog/visibility.ts` é uma constante `Prisma.CourseWhereInput` declarativa (não há comportamento a unit-testar — **N/A**; o gate de runtime exigiria integração).
- **Impacto:** regra de status exibido ("PENDENTE" só quando matrícula PENDING) e política de pagamento mensal por canal regridem sem aviso, induzindo o operador a erro sobre o estado real do aluno/cobrança.
- **Correção:** criar `src/lib/students/display-status.test.ts` (`isPaidEnrollment` para cada `EnrollmentStatus`; `deriveStudentDisplayStatus` → "PENDENTE" só com matrícula PENDING e "ATIVO" caso contrário; `countEnrollmentStatuses` agrega corretamente) e `src/lib/tenant/monthly-policy.test.ts` (`monthlyActive`, `monthlyAllowedOn` por canal, `effectivePaymentType` em cada combinação de política).
- **Verificação:** `npx vitest run src/lib/students/display-status.test.ts src/lib/tenant/monthly-policy.test.ts`

### [QA-009] `vitest.config` inclui só `.test.ts` (não `.tsx`); sem separação unit/integration
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `vitest.config.ts:7` (`include: ["src/**/*.test.ts"]`)
- **Evidência:** re-verificado — o glob ainda exclui `*.test.tsx`. Hoje **não há** nenhum `.test.tsx` no repo (`find src -name '*.test.tsx'` = vazio), então não há teste sendo silenciosamente ignorado **agora**; é uma armadilha de DX para quando alguém adicionar teste de componente.
- **Impacto:** DX — um futuro teste de componente `.test.tsx` não rodaria e passaria despercebido (falsa sensação de verde).
- **Correção:** trocar o `include` por `["src/**/*.test.{ts,tsx}"]`. Opcionalmente separar `projects` unit (environment node) e component (environment jsdom). Se adotar jsdom, instalar `jsdom` como devDependency.
- **Verificação:** `npx vitest run` reconhece e executa um `*.test.tsx` de fumaça.

---

## Cobertura
Itens do inventário relevantes ao domínio de Testes/QA (12) e veredito:

1. **Suíte unit existente (37 arquivos / 218 testes):** OK — todos passam, determinísticos (~1.6s), sem flakiness. `vi.mock("@/lib/prisma")` em toda parte (sem DB real).
2. **`vitest.config.ts`:** OK com ressalva — QA-009 (glob só `.test.ts`); QA-007 (sem coverage).
3. **CI (`.github/workflows/ci.yml`):** OK — roda Lint + Typecheck + Test + **Build** (com `SKIP_PENDING_MIGRATIONS=1` e `DATABASE_URL` dummy). Bloqueia merge. **QA-003 CORRIGIDO.**
4. **Teste de isolamento de tenant (`auth/scope.ts`):** OK — `scope.test.ts` (18 testes). **QA-001 CORRIGIDO.**
5. **AuthZ por papel (`auth/roles.ts`, `auth/guards.ts`):** OK — `roles.test.ts` + `guards.test.ts`.
6. **Webhook Asaas (validação de assinatura):** OK — `asaas/webhook.test.ts` (10 testes). **QA-002 CORRIGIDO.**
7. **Webhook Mercado Pago:** OK — `mercadopago/webhook.test.ts` presente.
8. **Webhook LMS — assinatura HMAC:** OK — `lms-webhook.test.ts` (6 testes, anti-replay incluído).
9. **Webhook LMS — dispatcher + idempotência + roteamento de suporte:** **Achado** — QA-010, QA-011, QA-012 (NOVOS, commits LMS).
10. **Motor de comissão/clawback (`referrals/*`):** OK — `tiers/clawback/commission/payout.test.ts` (32 testes). **QA-004 CORRIGIDO.**
11. **Resiliência Redis/rate-limit (`ratelimit.ts`):** **Achado** — QA-005 (ainda sem teste).
12. **Integração contra banco + E2E (login/checkout/billing):** **Achado** — QA-006 (ausentes).

Funções puras de negócio: `slug`, `forbidden-names`, `roles`, `price-guard/isSellablePrice`, `coupons`, `cpf`, `dates`, `crypto` → OK (testados). `monthly-policy`, `display-status` → **Achado** QA-008. `catalog/visibility.COURSE_HAS_PRICE` → **N/A** (constante `Prisma.WhereInput` declarativa, sem comportamento unitário).

Sub-revenda (plano 209/239 — commit `30918bb`): OK — `resellers/plans.test.ts` cobre o gate, e o gate está wired no API com Zod `.refine(isAllowedResellerPlan)` (`api/painel/revendas/route.ts:30`).
Credenciais LMS por matrícula (commit `8c71f74`): a cifra AES-256-GCM já é coberta por `crypto.test.ts`; `getLmsEnrollmentCredentials` é wrapper Prisma fino que filtra por `studentId` da sessão — N/A para unit (cobertura real = integração, QA-006).
