# Plano de Ação — Auditoria PMB (2026-05-28)

Ordenado por fase. Cada item: **ID** (ver MATRIZ_DE_RISCOS), **o quê**, **onde**, **como**, **decisão humana?**.

---

## FASE 1 — Urgente antes de produção (P0/P1 de segurança e dinheiro)

### R1 — [CRÍTICO] Tirar PII (CPF) dos certificados do bucket público
- **Onde:** `src/lib/certificates/storage.ts`, `generate-pdf.ts`, `code.ts:8-9`, página `/validar/[code]`, rota `student/certificates/[id]/download`.
- **Como:** (1) tornar o bucket `certificates` **privado** no Supabase; (2) servir PDF via **signed URL** de curta duração gerada por rota autenticada (aluno dono) ou por `/validar/{code}` após resolver o registro; (3) aumentar a entropia do `code` (usar os 32+ bits completos / `randomUUID`); (4) aplicar rate-limit no endpoint de download/validação. **Alternativa de menor risco:** manter validação pública mostrando só nome+curso+validade (sem CPF) e exigir auth para baixar o PDF completo.
- **Decisão humana:** SIM — muda fluxo de validação pública de certificado; precisa testar que QR code/validação continuam funcionando. Patch não aplicado automaticamente.

### R4 — [ALTO] Escopar autorização dos papéis PMB sobre revendedores
- **Onde:** `src/app/api/admin/revendedores/[id]/status/route.ts`, `/policy/route.ts`, `/billing/route.ts`, `/manager`, `/comissoes/*`.
- **Como:** após `requirePmbTeam`, se `role !== SUPER_ADMIN`, validar `tenant.accountManagerId === session.userId` (para PMB_RESELLER_MGR) e **restringir `policy`/`billing` a SUPER_ADMIN** (decidir se PMB_SALES deve poder mexer em billing).
- **Decisão humana:** SIM — define a política de quem gerencia quem. Ambíguo sem regra de negócio.

### R6 — [ALTO] Cap de 50% deve cobrir cupom FIXED
- **Onde:** `src/app/api/admin/vendas/route.ts:~227-236`.
- **Como:** estender a checagem do cap para `discountType === "FIXED"` (rejeitar se desconto efetivo > 50% do preço base). Patch pequeno.
- **Decisão humana:** confirmar se FIXED deve ser permitido para PMB_SALES (provável bug, não intencional).

### R2 — [ALTO] Orphan enrollment no `/api/checkout`
- **Onde:** `src/app/api/checkout/route.ts:~304-441`.
- **Como:** envolver a criação de preference/preapproval MP em try/catch que **deleta o `enrollment` PENDING criado** (rastrear `createdEnrollmentId` como as outras 3 rotas já fazem) e libera o cupom.
- **Decisão humana:** não (correção de bug claro), mas requer teste do fluxo de checkout.

### R5 — [ALTO] Unificar cálculo de desconto em Decimal
- **Onde:** `src/app/api/checkout/route.ts:~241-256` e `admin/vendas/route.ts`.
- **Como:** substituir `(basePrice * Number(discountValue))/100` por `applyCouponDiscount` (helper Decimal já existente nas outras rotas).
- **Decisão humana:** não. Testar valores.

### R7 / R8 — [ALTO] Bloqueio de inadimplência consistente
- **R7:** `sweep-students-overdue/route.ts:115-116` — trocar `setMonth` por `addMonthsClamped` (já definido no arquivo).
- **R8:** `src/lib/asaas/process.ts:182-190` — no branch `processPmbDirectSale` com `PAYMENT_OVERDUE`, chamar `blockStudentInEA` além de marcar `SUSPENDED`.
- **Decisão humana:** não. Correções de bug.

### R9 / R11 — [ALTO] Rate-limit faltante
- **R9:** adicionar `RATE_LIMITS.publicCheckout` em `/api/checkout` (PMB) como já existe em `/api/loja/checkout`.
- **R11:** adicionar rate-limit em `alterar-senha-inicial` e considerar exigir senha atual.
- **Decisão humana:** não.

### R10 — [ALTO] Senha temporária em resposta JSON
- **Onde:** `admin/revendedores/route.ts:~378`.
- **Como:** não retornar senha em plaintext; enviar por e-mail e/ou forçar reset no 1º login (já há `mustChangePassword`). Se a UI precisa exibir uma vez, marcar a resposta como não-logável e nunca persistir.
- **Decisão humana:** SIM — depende de como o admin recebe a credencial hoje.

### R3 / R12 — [ALTO] Defesa em profundidade no banco/Storage
- **Como:** avaliar adotar RLS + um role de aplicação não-owner para o Prisma (mudança grande), ou no mínimo documentar formalmente o risco aceito e compensar com testes de tenant-scoping (ver FASE 2). Para Storage: criar policies em `storage.objects` mesmo usando service-role (defesa em profundidade) e tornar privados os buckets com PII.
- **Decisão humana:** SIM — mudança arquitetural; risco de quebrar acesso. Não aplicar automaticamente.

---

## FASE 2 — Curto prazo (bugs médios, testes essenciais, UX/A11y, performance)

- **R16 [Alto/Perf]** Adicionar `take`/paginação aos 15 `findMany` de relatórios; converter analytics 180d para `date_trunc GROUP BY` no SQL; paginar broadcast `scope=ALL` com `createMany` e remover N+1 de `isChannelEnabled`.
- **R30 [A11y]** Aplicar os 5 itens WCAG Alto: ring de foco visível, `role="alert"` em erros, `autocomplete` em formulários de compra, corrigir hierarquia de headings, pausa no slideshow. (correções localizadas, verificáveis)
- **R21 [Médio]** `GET /api/cobranca/[paymentId]`: exigir token por-cobrança ou sessão; adicionar rate-limit.
- **R22 [Médio]** Enforce `mustChangePassword` em guard/layout server-side (hoje só UI).
- **R24 [Médio]** `admin/certificates/[id]/revoke`: filtrar por escopo (`tenantId`/`null`).
- **R19/R20 [Médio]** Rate-limit nas rotas de upload admin/painel; usar IP confiável da Vercel em vez do 1º segmento de `x-forwarded-for`.
- **R29 [Médio/Arq]** Extrair helper único de checkout (elimina a duplicação que causou R2/R5); unificar `dueDateInDays`, `normalizeE164`, `TenantContext`.
- **Testes (P1):** introduzir **Vitest** (unit) + **Playwright** (e2e). Cobertura mínima inicial:
  1. `applyCouponDiscount` (cálculo financeiro)
  2. `validateMpWebhookSignature` (HMAC)
  3. `addMonthsClamped` (inadimplência)
  4. `isValidCpf` + `encrypt/decrypt` roundtrip
  5. idempotência de `fulfillEnrollment` (replay → no-op) [integração c/ DB de teste]
  6. e2e: login por papel, acesso negado, IDOR aluno A↔B, checkout feliz.
  Adicionar job de testes no CI.

---

## FASE 3 — Médio prazo (arquitetura, observabilidade, compliance documental)

- **R14 [LGPD]** Persistir audit log em tabela (ações sensíveis: impersonation, bloqueio, alterações financeiras), além do Pino.
- **R13 [LGPD]** Implementar fluxo de exclusão/anonimização de dados do titular (aluno) e definir retenção (Lead/Student) com TTL.
- **R15 [LGPD]** Carregar Vercel Analytics só após consentimento do banner de cookies.
- **R38 [LGPD]** Registrar `termsAcceptedAt`/versão no aceite; formalizar DPAs com sub-operadores (Supabase, Vercel, Upstash, MP, Asaas, plataforma parceira) — **documental/jurídico**.
- **R17/R27 [DevOps]** `pg_advisory_xact_lock` no `apply-pending-migrations.mjs`; ambiente de **staging** separado; migrar de `migrate em build` para `prisma migrate deploy` gated; proteger `db:reset` contra prod.
- **R23 [Sessão]** Reduzir `maxAge` do JWT e revalidar `status`/`role` no callback `jwt` (invalidar desativados).
- **R18 [CSP]** Migrar para CSP com **nonce** (remover `unsafe-inline`/`unsafe-eval`).
- **R32 [Perf]** Redis cache em dashboards/`getSystemSettings`; usar PgBouncer/connection pooler do Supabase (porta 6543) em vez de 5432 direto.
- **R33/R34 [Deps]** Migrar `xlsx`→`exceljs`; remover `animejs`/`zustand` não usados; mover `shadcn` para devDependencies; `npm audit fix` p/ `brace-expansion`.
- **R25/R26 [DB]** Revisar `onDelete` das FKs de Tenant (evitar reclassificação contábil); adicionar CHECK de coerência tenant↔registro.
- **R35/R36/R37 [Baixo]** Padronizar bcrypt cost=12 e senha mínima=8; janela temporal no HMAC MP; guarda de `NODE_ENV` no `db:reset`; subir `tsconfig target`.

---

## Já corrigido nesta auditoria
- **R31 (parcial):** `.env.example` reescrito e alinhado a `src/lib/env.ts` — documenta `MP_WEBHOOK_SECRET`, `AUTH_SECRET`, grupo `PMB_*`, `WA_GATEWAY_*`, `EA_STUDENT_LOGIN_URL`, `AXIOM_*`, `DATABASE_POOL_MAX`, vars públicas de contato, com avisos sobre `SUPABASE_ACCESS_TOKEN`. (Falta: configurar as vars de fato no Vercel — ação operacional.)
