# Achados — Domínio: testes / QA
_Auditor read-only · 2026-06-20 · Nota do domínio: **3/10** · P0=0 · P1=4 · P2=4 · P3=1_

> `npx vitest run` → **PASSOU**: 8 arquivos, **44 testes verdes** (~335ms, determinísticos, sem flakiness).
> A suíte existente é boa, mas cobre 8 de ~858 unidades testáveis (281 handlers + ~577 exports de lib).
> Caminhos críticos do produto estão sem rede de segurança.

### [QA-001] Ausência total de teste de isolamento de tenant (o "teste de ouro")
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/lib/auth/scope.ts:39` (`tenantScopeWhere`), `:65` (`canAccessTenantScope`), `:88` (`leadScopeWhere`); não existe `scope.test.ts`
- **Evidência:** a referência `11-testes-qa.md:13-14` classifica a ausência deste teste como P1 ("é o risco P0 do produto"). `canAccessTenantScope` é AuthZ puro e determinístico. Projeto **não tem RLS no banco** (INVENTARIO §banco) — isolamento depende 100% destas funções.
- **Impacto:** uma regressão silenciosa em `tenantScopeWhere` vaza dados entre tenants sem nada para pegar.
- **Correção:** criar `src/lib/auth/scope.test.ts` cobrindo, por role (SUPER_ADMIN, PMB_RESELLER_MGR, PMB_REVENDA_SALES, PMB_SALES_MGR, PMB_SALES, PMB_FINANCEIRO, RESELLER): `canAccessTenantScope` true só p/ tenant próprio, false p/ alheio/null; `tenantScopeWhere` devolve where escopado correto (`{}` super, `{accountManagerId}`, `{salesUserId}`, `{salesUserId:{in:[...]}}`) e `null` p/ roles sem acesso. Mockar `salesTeamIds` via `vi.mock("@/lib/prisma")`.
- **Verificação:** `npx vitest run src/lib/auth/scope.test.ts`

### [QA-002] Webhook Asaas (cobrança das revendas) sem teste de assinatura/validação
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/lib/asaas/webhook.ts:17` (`validateAsaasWebhook`), `:72` (`parseAsaasWebhookPayload`); rota `src/app/api/webhooks/asaas/route.ts`
- **Evidência:** webhook MP tem teste, Asaas não. `validateAsaasWebhook` usa `timingSafeEqual` e teve "dev bypass" removido (comentário `webhook.ts:13-15`) sem teste de regressão. `parseAsaasWebhookPayload` antes era `as` cego (`:70`). Referência exige "assinatura inválida é rejeitada" (`11-testes-qa.md:16`).
- **Impacto:** regressão no bypass/validação pode permitir ativar/suspender tenants via payload forjado.
- **Correção:** criar `src/lib/asaas/webhook.test.ts`: token correto→true; errado/ausente/comprimento diferente→false; `ASAAS_WEBHOOK_TOKEN` ausente→false (regressão dev-bypass); `parseAsaasWebhookPayload` rejeita corpo sem `payment`/`subscription`, aceita PAYMENT_RECEIVED válido, preserva passthrough.
- **Verificação:** `npx vitest run src/lib/asaas/webhook.test.ts`

### [QA-003] CI não roda `next build` — Portão Zero-Erro institucionalizado pela metade
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `.github/workflows/ci.yml:36-43`
- **Evidência:** job `validate` roda lint/typecheck/test, mas **não há etapa de build** (`grep "next build" ci.yml` = 0). Guardrail global e `11-testes-qa.md:26-27` exigem build no CI.
- **Impacto:** rota/página quebrada e erro de RSC passam para `main` e só explodem no deploy Vercel.
- **Correção:** adicionar step `next build` no CI com `SKIP_PENDING_MIGRATIONS=1` (neutraliza `db:apply-pending` que toca a PROD — INVENTARIO §portão). Rodar `npx next build` direto ou condicionar o script ao env de skip; prover env mínimas de build.
- **Verificação:** PR com erro de RSC proposital falha o step de build.

### [QA-004] Motor de comissão por faixas / clawback sem teste (lógica financeira pura)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/lib/referrals/tiers.ts` (`resolveTierPercent`, `monthsSinceActivation`, `parseReferralTiers`), `src/lib/referrals/rules.ts` (8 exports), `src/lib/referrals/commission.ts:26` (`computeAvailableAt`)
- **Evidência:** 17 funções de cálculo de comissão, puras/determinísticas e centrais p/ pagamento de parceiros (MONTHLY_TIERED + clawback deployado 2026-06-18), sem nenhum teste. `computeAvailableAt`/`monthsSinceActivation` são suscetíveis ao mesmo bug de overflow que `dates.test.ts` protege.
- **Impacto:** erro de centavo/faixa paga errado o parceiro; sem teste, regride sem aviso.
- **Correção:** criar `src/lib/referrals/tiers.test.ts` e `rules.test.ts`: `resolveTierPercent` na borda de cada faixa; `monthsSinceActivation` em virada de mês/ano e dias 29-31; `parse*` com JSON inválido→fallback; `resolveBracket` no limiar de valor; `computeAvailableAt` p/ `payoutDay`≤20 em meses curtos (fev).
- **Verificação:** `npx vitest run src/lib/referrals/`

### [QA-005] Regressão de resiliência Redis sem teste
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/ratelimit.ts:118` (`runLimit` fail-open/closed), `:164` (`ipFrom`, parsing XFF anti-spoof)
- **Evidência:** correção `dcd03fd` mudou o controle de fluxo (try/catch em `limiter.limit()`); MEMORY alerta que `if(!redis)` NÃO cobre falha de comando — sem teste de regressão.
- **Impacto:** regressão pode reintroduzir fail-closed (login 500) ou spoof de IP no rate limit.
- **Correção:** teste com `vi.fn()` que rejeita: confirmar fail-open; `ipFrom` ignora XFF forjado.
- **Verificação:** `npx vitest run src/lib/ratelimit.test.ts`

### [QA-006] Zero testes de integração contra banco e zero E2E
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `package.json` (sem Playwright); nenhum harness Prisma de integração
- **Evidência:** `grep playwright package.json` = nada. Fluxos login→checkout→fulfillment nunca exercidos ponta-a-ponta. Referência pede E2E em login/checkout/billing (`11-testes-qa.md:9-10`).
- **Impacto:** quebras de fluxo end-to-end só aparecem em produção.
- **Correção:** adicionar ao menos 1 smoke E2E de checkout (médio prazo) + harness de integração para fulfillment.
- **Verificação:** suíte E2E roda no CI.

### [QA-007] Sem thresholds de cobertura nos módulos críticos
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `vitest.config.ts` (sem bloco `coverage`)
- **Evidência:** `11-testes-qa.md:22`; nada impede a cobertura de auth/tenant/billing cair.
- **Impacto:** erosão silenciosa de cobertura.
- **Correção:** definir `coverage.thresholds` para `src/lib/{auth,tenant,referrals,asaas,mercadopago}`.
- **Verificação:** `npx vitest run --coverage` falha abaixo do threshold.

### [QA-008] Funções puras de negócio testáveis sem teste
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `tenant/slug.ts` (`validateSlugFormat`, `RESERVED_SLUGS`), `tenant/forbidden-names.ts` (`containsForbiddenName`), `tenant/monthly-policy.ts` (`effectivePaymentType`), `students/display-status.ts` (`deriveStudentDisplayStatus`), `auth/roles.ts` (`canMarkPaid`/`canManageCommissions`/`canViewFinance`), `catalog/visibility.ts` (`COURSE_HAS_PRICE`)
- **Evidência:** todas validam fronteiras de comportamento sem cobertura.
- **Impacto:** regras de negócio (slug reservado, nome proibido, status derivado, gate de preço, AuthZ financeira) regridem sem aviso.
- **Correção:** testes unitários por função, incluindo bordas.
- **Verificação:** `npx vitest run src/lib/tenant src/lib/students src/lib/auth src/lib/catalog`

### [QA-009] vitest.config inclui só `.test.ts` (não `.tsx`); sem separação unit/integration
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `vitest.config.ts:7`
- **Evidência:** glob `src/**/*.test.ts` exclui componentes `.tsx`.
- **Impacto:** DX — testes de componente não rodariam.
- **Correção:** incluir `.tsx`; separar projetos unit/integration.
- **Verificação:** `npx vitest run` reconhece `*.test.tsx`.

## Cobertura
- 8 testes existentes: **OK** (todos passam). `vitest.config.ts`: OK c/ ressalva (QA-009).
- `ci.yml`: QA-003. Isolamento tenant (`auth/scope.ts`): QA-001. Webhook Asaas: QA-002. Webhook MP: OK.
- Motor de comissão/clawback: QA-004. Fulfillment EA+LMS: QA-006 (integração). Resiliência Redis: QA-005.
- Gate de preço, slug, forbidden-names, status derivado, roles: QA-008. E2E/staging: QA-006 (ausente).
