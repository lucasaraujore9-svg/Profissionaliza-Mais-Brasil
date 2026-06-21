# Achados — Domínio: código / arquitetura
_Auditor read-only · 2026-06-20 · Nota do domínio: **8.5/10** · P0=0 · P1=0 · P2=2 · P3=4_

## Portão Zero-Erro (medido)
| Etapa | Comando | Resultado |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASSOU — exit 0, ZERO erros** |
| Lint | `npx eslint` | **PASSOU — 0 errors, 2 warnings** (não bloqueantes) |
| Testes | `npx vitest run` | **PASSOU — 8 arquivos / 44 testes verdes** |
| Build | `next build` | **NÃO EXECUTADO** — `npm run build` encadeia `db:apply-pending` (toca prod). Não rodado p/ não mudar estado. |

Type-safety exemplar: **zero** `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` em `src/`; `tsconfig strict:true` real; 32 `eslint-disable` todos legítimos.
2 warnings: `scripts/render-cert-samples.tsx:1` (disable inútil), `src/lib/students/plataforma-actions.ts:160` (`err` não usado).

### [COD-001] `LMS_API_URL`/`LMS_API_KEY` ausentes do schema env.ts — escapam da validação de boot
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/lms/config.ts:9-19` (lê `process.env` direto) · `src/lib/env.ts` (schema Zod não declara)
- **Evidência:** `grep "LMS_API" src/lib/env.ts` → vazio. `env.ts:16` documenta "NÃO leia process.env.X diretamente". LMS é integração de produção ativa.
- **Impacto:** se `LMS_API_KEY` faltar/expirar em prod, sem erro no boot; falha silenciosa no provisionamento LMS (aluno paga, não recebe acesso) só aparece quando cron/fulfill roda.
- **Correção:** adicionar `LMS_API_URL: z.string().url().optional()` e `LMS_API_KEY: z.string().optional()` ao `envSchema`; refatorar `config.ts` p/ ler de `env.*`; warning não-fatal em `assertEnv()` se faltar em prod (padrão do `MP_WEBHOOK_SECRET`).
- **Verificação:** `grep "LMS_API" src/lib/env.ts` retorna 2 chaves; `npx tsc --noEmit` verde.

### [COD-002] CI (`ci.yml`) não roda `next build` — erros de RSC/build escapam do gate
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `.github/workflows/ci.yml:36-43` (só lint + typecheck + test)
- **Evidência:** sem step de build. `next.config.ts` corretamente sem `ignoreBuildErrors`/`ignoreDuringBuilds`, mas build nunca roda no pipeline. (Duplica QA-003.)
- **Impacto:** página que passa no `tsc` mas quebra na coleta de build do Next chega em prod (tela branca/500).
- **Correção:** step de build após testes com `SKIP_PENDING_MIGRATIONS=1` (flag já respeitada por `apply-pending-migrations.mjs`); envs mínimas de build.
- **Verificação:** workflow numa PR com step Build verde.

### [COD-003] 46 arquivos leem `process.env` direto, contrariando convenção env.ts ⚠️MIGRAÇÃO
- **Severidade:** P3
- **Status:** Aberto
- **Local:** 46 arquivos (ex.: `asaas/client.ts:35,40`, `mercadopago/client.ts`, `lms/config.ts:9`, `api/aluno/comprar/route.ts:192,311`, `api/checkout/route.ts`, `api/webhooks/mercadopago/route.ts`)
- **Evidência:** validação centralizada existe mas é parcial.
- **Impacto:** baixo hoje; dívida de migração — fonte de verdade de envs espalhada complica checklist de secrets no Docker Swarm.
- **Correção:** migração incremental por arquivo (priorizar clients de integração), trocando `process.env.X`→`env.X` após declarar no schema.
- **Verificação:** `grep -rln "process.env." src/lib/{asaas,mercadopago,lms}` decresce.

### [COD-004] 8 dependências circulares no grafo de módulos (majoritariamente type-only)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** via `madge --circular`: checkout-wizard↔{form-empresa,form-pessoal,payment-preview}; leads-kanban-board→lead-detail-drawer→lead-kanban-column (**mista**, valor `STAGE_META`); certificates/templates/classic↔info-page; config-tabs↔account-form; config-tabs→billing-section→asaas-gateway-section
- **Evidência:** 7 ciclos são type-only (apagados em compilação); ciclo 4 mistura valor → único com risco teórico de TDZ (mitigado por render deferido).
- **Impacto:** nenhum erro hoje; risco organizacional + ciclo 4 pode dar `undefined` em hot-reload/tree-shaking.
- **Correção:** extrair tipos/`STAGE_META` para arquivos neutros (`*.types.ts`, `lead-kanban.shared.ts`); filhos importam do neutro.
- **Verificação:** `npx madge --circular --ts-config tsconfig.json --extensions ts,tsx src/` → none.

### [COD-005] Exports mortos: `swallowCleanup` e `shouldSendEmail`
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/lib/errors.ts:43` · `src/lib/notifications.ts:153`
- **Evidência:** grep retorna só a definição — zero call sites (ts-prune confirmou).
- **Impacto:** código morto.
- **Correção:** remover os dois exports (ou marcar `// reservado`).
- **Verificação:** `grep -rn "swallowCleanup\|shouldSendEmail" src/` vazio; `tsc` verde.

### [COD-006] 9 `.catch(() => {})` silenciosos fora do helper `swallow()`
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `api/admin/automacao/whatsapp/status/route.ts:72` · `api/painel/config/sales-gateway/route.ts:100` · `referrals/monthly.ts:397,497` · `referrals/payout.ts:395,504` · `asaas/process.ts:592` · `automation/dispatch.ts:223,243`
- **Evidência:** projeto tem `swallow(context)` usado 105× (loga warn antes de engolir); estes 9 usam catch cru. 2 estão no motor de comissão (financeiro).
- **Impacto:** falha em side-effect (notificação, backfill de comissão, cleanup) some sem log → debug cego.
- **Correção:** trocar por `.catch(swallow("<contexto>"))`.
- **Verificação:** `grep -rnE "\.catch\(\(\) *=> *\{\}\)" src/app/api src/lib` vazio.

## Cobertura
- 281 route handlers: 143 importam Zod; dos 137 sem Zod, só `webhooks/asaas` lê body sem Zod (valida por assinatura — aceitável). OK.
- 198 lib / ~577 exports: ts-prune (mortos→COD-005) + madge (ciclos→COD-004) + grep type-safety (zero any). OK.
- 322 componentes: boundary-leak (prisma/supabase/secrets/process.env em client → zero) + naming. OK.
- 2 Server Actions: `"use server"` correto. App Router specials: mapeados, OK.
- ⚠️MIGRAÇÃO: sem `output:"standalone"`; `@upstash/redis` REST; `@vercel/analytics`+`speed-insights`; `placar/stream` `maxDuration=300`.
