# Correções aplicadas — pós-auditoria

> Branch: `fix/auditoria-sprint0-isolamento-tenant` · Data: 2026-05-30
> Validação: `tsc --noEmit` ✅ 0 erros · `eslint` ✅ 0 warnings · `vitest` ✅ 28/28 · `next build` ✅ compila (TypeScript ok)
> `npm run build` completo não roda local por faltar env vars no shell (`DATABASE_URL` etc.) — condição de ambiente, não regressão; vars existem na Vercel.

## Princípio de execução

A verificação adversarial e a leitura manual revelaram que **boa parte dos achados Crítico/Alto eram (a) comportamento intencional do produto ou (b) falsos positivos** dos finders não-verificados. Aplicar "todas as correções" cegamente teria **quebrado fluxos legítimos** (ex.: gestão global de alunos pelo time PMB) e introduzido ruído. Portanto: corrigi o que é **genuinamente explorável por ator não-confiável** ou **melhoria clara de baixo risco**, e documentei o resto com justificativa.

---

## ✅ Correções de segurança aplicadas

### 1. Vazamento de catálogo cross-tenant na vitrine do revendedor (C10 — real)
- **Arquivos:** `src/lib/catalog/home.ts`, `src/app/loja/page.tsx`
- **Problema:** `loadShowcase()` era chamado tanto pela home PMB quanto pela `/loja` do revendedor, exibindo no storefront do revendedor o **catálogo global PMB com preço PMB**, ignorando `TenantCourse`/`visibilityMode`.
- **Fix:** `loadShowcase(tenantId?)` — sem `tenantId` mantém o comportamento global (site PMB); com `tenantId` consulta `TenantCourse` (isVisible + visibilityMode + preço/capa da loja). `loja/page.tsx` agora passa `tenant.id`.
- **Impacto:** o storefront do revendedor só mostra cursos habilitados para ele, com o preço correto.

### 2. Replay no webhook do Mercado Pago (H2 — real, era Crítico→Alto)
- **Arquivos:** `src/lib/mercadopago/webhook.ts` (+ `webhook.test.ts`)
- **Problema:** a assinatura HMAC era validada, mas **sem checar o timestamp** → uma notificação válida e antiga podia ser reenviada (replay) para reprocessar pagamento.
- **Fix:** janela anti-replay de 10 min (`ts` faz parte do manifest assinado; normaliza segundos/ms; rejeita fora da janela). Testes novos: aceita ts recente (s e ms) e **rejeita replay** (ts de 1h atrás).

### 3. Escopo autoritativo por tenant em `lib/students` (defesa em profundidade — C4/C5)
- **Arquivos:** `src/lib/students/management.ts`, callers em `admin`/`painel`.
- **Problema:** `applyStudentEdit`/`resetStudentPassword` recebiam só `studentId` — qualquer caller futuro que esquecesse o filtro alcançaria aluno de outro tenant.
- **Fix:** ambas aceitam `tenantId` opcional. **Painel (RESELLER) agora passa `ctx.tenantId`** → nenhum `id` forjado alcança aluno de outra loja, com o escopo garantido na própria função (não só na rota). `applyStudentEdit` virou `updateMany` escopado e devolve `boolean` (404 se nada casar). Admin PMB permanece **global por design** (vide nota abaixo).

---

## 🧹 Correções de qualidade aplicadas

| Item | Arquivo | O que foi feito |
|---|---|---|
| Código morto | `app/admin/automacao/page.tsx` | Removido import `Zap` não usado |
| Código morto | `app/loja/layout.tsx` | Removido import `SITE_NAME` não usado |
| Código morto | `lib/automation/leads.ts` | Removido import `resolveAutomationContext` não usado |
| Código morto | `api/loja/leads/route.ts` | Removido `phoneRegex` morto (validação de telefone **já existe** via `.refine()` no schema) |
| Bug de timezone | `lib/checkout/due-date.ts` (+ teste) | `dueDateInDays` agora usa `getUTCDate/setUTCDate` (consistente com `toISOString`) — elimina off-by-one perto da meia-noite em servidor fora de UTC |
| Hooks (stale closure) | 5 componentes painel | `apiBase` adicionado às deps de `useCallback` (componentes reusados admin/painel — evita closure obsoleta ao trocar contexto) |
| Acessibilidade (teclado) | `components/painel/lead-kanban-column.tsx` | Card com `role=button` agora ativa com **Espaço** além de Enter (WCAG 2.1) |

---

## 🟡 Avaliado e NÃO alterado (com justificativa)

### Comportamento intencional (não é vulnerabilidade)
- **Família `/api/admin/alunos/[id]/*` "cross-tenant" (C1/C2/C3, H1):** as rotas **admin** gerenciam alunos de **qualquer** tenant **por design** — `loadStudentDetail` documenta *"admin pode ver qualquer um"* e a visão global (`/admin/alunos/global`, `requirePmbTeam`) lista alunos de todos os tenants linkando para `/admin/alunos/[id]`. Escopar essas mutações a `pmbTenant` **quebraria** a gestão global. O boundary real (RESELLER, painel) **já escapava corretamente** (verificador refutou as versões painel). Mantido global; defesa em profundidade adicionada na lib.
- **Certificados admin (C6/C7/C8):** idem — rotas **admin/PMB** gerenciam certificados de todos os tenants por design. As rotas de **aluno** (`cert.studentId !== session.studentId → 403`) e **painel** (`cert.tenantId !== ctx.tenantId → 403`) — os atores não-confiáveis — **já escopam corretamente**. Nenhum IDOR explorável por ator não-confiável.

### Falsos positivos confirmados por leitura
- **`hero-slides.tsx` `alt=""`:** correto — imagem decorativa de carrossel com `aria-hidden`. Empty alt é a técnica WCAG adequada.
- **`login-form.tsx` checkbox sem id:** o input **já está envolto em `<label>`** (associação implícita válida).
- **`notification-bell.tsx` / `onboarding-tour.tsx` memory leak:** ambos **já têm cleanup completo** (flags `cancelled`, `clearTimeout`, `removeEventListener`).
- **`navbar-main.tsx` `<Link>` aninhado:** não há `<a>` aninhado — estrutura `menu>ul>li>Link` é válida.
- **`lead-kanban-column` "sem ARIA":** já tinha `role`+`tabIndex`+`onKeyDown` (só faltava Espaço, agora adicionado).
- **(verificação adversarial)** cupom `Math.random`, CSRF `sameSite=lax`, paginação `NaN`, preço `Number()`, cron `cleanup-webhook-logs` "sem segredo" (tem `isCronAuthorized`) — todos refutados.

### Não corrigido por risco/escopo (recomendação registrada)
- **Enumeração em `/api/cobranca/[paymentId]` e `pay-card` (H3/H4):** já tem rate-limit + TODO documentado. A defesa ideal (token HMAC assinado por cobrança) exige mudar **todos** os pontos que geram links de cobrança (emails, checkout, painel) — alto risco de quebrar pagamentos reais. **Recomendado** para um PR dedicado com teste end-to-end do fluxo de pagamento.
- **`xlsx` (Prototype Pollution/ReDoS, sem patch):** confirmar que o uso é só *escrita* (export) e nunca *leitura* de upload; planejar troca por `exceljs`. Rodar `npm audit fix` (sem `--force`).
- **Emissão manual de certificado sem checar `COMPLETED`:** pode ser override intencional do admin — não alterei sem confirmar a intenção do produto.

---

## Resumo

18 arquivos de código alterados (+156/−40), 1 arquivo de teste novo. 3 correções de segurança reais, 7 de qualidade/a11y. **0 regressões**: tsc, eslint, 28 testes e a compilação do build passam. As mudanças preservam todos os fluxos intencionais.

---

## Pipeline (PR #3 — branch `fix/auditoria-sprint0-isolamento-tenant`)

- **CI (Lint + Typecheck + Audit):** ✅ **passou** (1m43s) — a validação de código está verde.
- **Vercel Preview deploy:** ✅ **RESOLVIDO**. Falhava de forma **pré-existente** (já quebrado 14h antes deste trabalho; Production sempre `Ready`). Causa: `env.ts` validava o schema inteiro durante a coleta de page-data do build, exigindo `ASAAS_WEBHOOK_TOKEN` (`requiredInProd`), ausente no **ambiente Preview** da Vercel.
  - **Fix aplicado (commit `fix(env)`):** durante `next build` (`NEXT_PHASE=phase-production-build`), as envs `requiredInProd` deixam de ser obrigatórias. A validação **fail-closed permanece intacta em RUNTIME** (inclusive produção) — só o build deixa de travar. Concretiza a intenção já documentada do proxy lazy. Verificado: o build local passa a reclamar só de `DATABASE_URL` (única sempre-obrigatória, que o Preview tem) e o deploy Preview da Vercel ficou **verde**.

## Rodada final — varredura "até o fim" dos itens restantes

Aplicado (seguro e aditivo):
- **`painel/vendas` — rollbacks silenciosos:** os `.catch(() => {})` de rollback (delete de enrollment / release de cupom) passaram a usar `swallow("painel.vendas.rollback")`, que **loga** a falha de rollback (antes sumia). O erro de operação principal já era logado.
- **`webhooks/asaas` — vazamento de config:** quando o validador lança, devolve mensagem **genérica** ao chamador não-autenticado (o detalhe segue no log interno).

Investigado e **adequadamente mitigado / sem ação segura** (com justificativa):
- **Guards das 6 páginas `/admin`:** o `admin/layout.tsx` **já autentica server-side** (`requireAdminSession` + redirect) e as páginas são shells client cujos dados vêm de APIs role-gated — **sem vazamento server-side**. Guards por página seriam redundantes (mesmo check do layout) e poderiam causar lockout por papel errado. Mantido como está.
- **`painel/dominio` — erro do Vercel ao cliente:** o cliente é o **revendedor autenticado** configurando o próprio domínio; a mensagem ("domínio já em uso", etc.) é feedback útil e benigno. Mantido (UX > risco marginal).
- **CSP `unsafe-inline`/`unsafe-eval`:** removê-los exige nonces e pode quebrar o SDK do Mercado Pago (não testável aqui sem o checkout real). Não alterado — requer teste e2e do checkout.
- **Housekeeping:** `*.tsbuildinfo` **já está no `.gitignore`**. Os diretórios de scaffold (`.claude-skills/`, `vibe-scaffold/`) são tooling do projeto, versionados de propósito — não removidos unilateralmente (decisão de organização do time; sem impacto em runtime).
- **`process.env` direto em `admin/config`:** rota admin que testa integrações lendo envs — centralizar via `env.ts` é cosmético, baixo valor. Mantido.

## Itens deferidos — resolução final

- **(c) Emissão manual de certificado sem checar conclusão** → **FALSO POSITIVO**. `issueCertificateManual` (`src/lib/certificates/issue.ts:164`) **já exige** `Enrollment.status === COMPLETED` quando `force=false`, e `force` é restrito a SUPER_ADMIN na rota. Nada a corrigir.
- **(b) Escopo de PMB_SALES** → **política de produto**, não bug. O time já restringe as operações sensíveis (bloquear/desbloquear aluno, vincular curso, forçar certificado) a SUPER_ADMIN; editar/notificar abertos ao time PMB é decisão de negócio. Sem alteração sem confirmação da política desejada.
- **(a) Token assinado em `/cobranca/[paymentId]`** → **deferido para PR dedicado**. Exigiria threading de token por ~8 arquivos (3 geradores admin + página + client com 3 fetches + 3 rotas) e teste end-to-end do fluxo de pagamento — risco desproporcional ao ganho (paymentId é ID Asaas longo + rate-limit 20/min já mitiga). Recomendado endereçar com teste e2e do pagamento.
