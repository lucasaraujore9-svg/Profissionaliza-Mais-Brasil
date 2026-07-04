# Auditoria — Frontend / UX
_Data: 2026-07-03 · Referência: .claude/skills/auditoria-saas/references/06-frontend-ux.md · Itens do inventário cobertos: 137/137 telas + 342/342 componentes + 9 layouts + 17 boundaries (5 loading · 5 error · 6 not-found · 1 global-error)_

> Reescreve a auditoria de 2026-06-24. Portão parcial verde: `npx tsc --noEmit` = **0 erros**; `npx eslint .` = **0 erros** (1 warning trivial `Unused eslint-disable` em `scripts/render-cert-samples.tsx`, fora do domínio FE — idêntico à rodada anterior). **137/137** `page.tsx` com `export default` (verificado). **Zero rota estruturalmente quebrada.** Cross-check exaustivo de `href`/`push`/`replace`/`redirect`/`window.location.href`: **zero link morto** — todos os 65 destinos-raiz distintos resolvem para rotas reais (incl. `[tab]` de relatórios via gate server-side, `/admin/relatorios/visao-geral|exportacoes`, `/painel/relatorios/financeiro`, e os href-templates de tabela de BI `/admin/revendedores/{id}` e `/painel/alunos/{id}`).
>
> **Re-verificação dos 6 achados de 2026-06-24:** FE-001/FE-002/FE-004 seguem **Corrigidos**. **FE-005 → Corrigido** (o route de acesso ao curso LMS agora redireciona para banner amigável). **FE-006 → Corrigido** (aria-labels adicionados). **FE-003 → segue Aberto**. 1 achado novo no hub de BI (delta 2026-06-25→07-02): **FE-007**.

## Resumo
- Itens verificados: 137 telas + 342 componentes + 17 boundaries · Achados: **P0=0 P1=0 P2=0 P3=2 (abertos)** · Nota do domínio: **9.0/10**
- Delta auditado (páginas novas/alteradas desde 2026-06-24): `/admin/relatorios/*` + `/painel/relatorios/*` (hub de BI, 9+7 abas), `/placar` + `/painel/placar` (placar de indicações), tours guiados (`tour-runner.tsx`), `/pagar/[id]` (retomada de cobrança PMB), seletor de parcelas no checkout (`mp-checkout-form.tsx`), menu lateral recolhível (`sidebar-admin`/`sidebar-painel` + `use-sidebar-collapsed.ts`). **Todos revisados item a item; sólidos** salvo FE-007.

## Achados

### [FE-003] `confirmacaoPath` default `/loja/confirmacao` expõe o prefixo interno `/loja` na URL da revenda pós-compra
- **Severidade:** P3
- **Status:** Corrigido (commit `33ea858`, 2026-07-04) — novo helper puro `storePath(currentPathname, "/confirmacao")` em `src/lib/tenant/vitrine-paths.ts` resolve o path por contexto de host em runtime: `/confirmacao` no host da vitrine (proxy reescreve `/`→`/loja` transparente) e `/loja/confirmacao` no host PMB (servido direto). Os defaults literais foram removidos; overrides explícitos (`/aluno/pagamentos`, `/checkout/confirmacao`) seguem honrados. Cobre os DOIS contextos com teste (`vitrine-paths.test.ts`, 3 casos novos). Portão verde (570 testes).
- **Local:** defaults em `src/components/loja/asaas-checkout-form.tsx:108` e `src/components/loja/mp-checkout-form.tsx:155` (`confirmacaoPath = "/loja/confirmacao"`); os 3 sites de instanciação **não passam** override: `src/app/loja/checkout/page.tsx:138,163-169` (`pkgPanelForm` → `CheckoutPanel`) e `:323,355-361` (`coursePanelForm`) montam `FormConfig` sem `confirmacaoPath`; `src/app/loja/pagar/[id]/page.tsx:140` instancia `MpCheckoutForm` sem `confirmacaoPath`. Redirect efetivo em `asaas-checkout-form.tsx:114` / `mp-checkout-form.tsx:163` (`${confirmacaoPath}?enrollment_id=...`).
- **Evidência:** no subdomínio de revenda o proxy (`src/proxy.ts` + `src/lib/tenant/vitrine-paths.ts`) reescreve `/confirmacao`→`/loja/confirmacao`, mas `isVitrinePath("/loja/confirmacao")` é `false` (a lista cobre `/confirmacao`, não o literal `/loja/confirmacao`), então a URL literal `/loja/confirmacao` é servida direto (não 404) — porém deixa o prefixo interno `/loja` visível ao cliente. Inconsistente com o checkout PMB, que usa `/checkout/confirmacao`. `grep -rn confirmacaoPath` confirma que só os defaults dos forms definem o valor; nenhum call-site passa `/confirmacao`.
- **Impacto:** cosmético/consistência de URL (não quebra a confirmação; a compra e a matrícula seguem funcionando). Vaza nomenclatura interna `/loja` ao cliente da revenda. Impacto de produto baixo.
- **Correção:** passar `confirmacaoPath: "/confirmacao"` nos 3 sites: em `src/app/loja/checkout/page.tsx` adicionar `confirmacaoPath: "/confirmacao"` aos objetos `pkgPanelForm` (ramos asaas/mp) e `coursePanelForm`; em `src/app/loja/pagar/[id]/page.tsx:140` passar `confirmacaoPath="/confirmacao"` ao `MpCheckoutForm`. (O `CheckoutPanel` já repassa `form.confirmacaoPath`.) Verificar que `/confirmacao` continua vitrine-path e que o route físico `/loja/confirmacao` segue resolvendo via proxy.
- **Verificação:** após compra numa vitrine de revenda, a URL de confirmação é `https://{slug}.livrecursos.com.br/confirmacao?enrollment_id=...` (sem `/loja`). Adicionar caso a `src/lib/tenant/vitrine-paths.test.ts` cobrindo `/confirmacao`.

### [FE-007] Hub de BI (`/admin/relatorios/[tab]` e `/painel/relatorios/[tab]`) não oferece "tentar novamente" no estado de erro
- **Severidade:** P3
- **Status:** Corrigido (commit `7f4d032`, 2026-07-04) — `ReportTabView` aceita `onRetry?`; ambos os clients passam o refetch `load`; o bloco de erro ganhou `role="alert"` + `Button` shadcn "Tentar novamente" (desabilitado durante recarregamento). Teste de renderização deste estado depende de infra jsdom/testing-library ausente (rastreada em QA-006); verificado por typecheck + build + portão verde (570 testes).
- **Local:** `src/components/admin/admin-relatorios-client.tsx:30-49` (fn `load`, `setError`) e o mesmo padrão em `src/components/painel/painel-relatorios-client.tsx:30-41`; renderização do erro em `src/components/reports/report-tab-view.tsx:23-29` (bloco vermelho **só com mensagem**, sem botão de retry). `grep -rn "Tentar novamente\|retry\|Recarregar" src/components/reports src/components/admin/admin-relatorios-client.tsx src/components/painel/painel-relatorios-client.tsx` = **vazio**.
- **Evidência:** quando `GET /api/admin/relatorios/bi/[tab]` (ou `/api/painel/relatorios/...`) falha por rede ou 5xx, o client faz `setError(...)` e `ReportTabView` mostra `<div class="...bg-red-50...">{error}</div>` sem ação de recarregar. O único gatilho de re-fetch é o `PeriodFilter` (`onChange` → `queryString` muda → `load`), que **não existe na aba `exportacoes`** (filters `undefined`) e não resolve o caso de erro transiente com o mesmo período. Loading (`ReportSkeleton`) e empty (`EmptyState`/"Sem dados no período" em `data-table.tsx:130`) estão corretos; falta apenas o retry do estado de erro exigido pela checklist ("erro = mensagem **+ retry**").
- **Impacto:** num erro de rede transiente, o usuário de BI (admin/owner de revenda) fica na tela de erro e precisa navegar para fora e voltar (ou trocar o período) para tentar de novo. Audiência interna e caminho não-crítico → impacto baixo, mas é lacuna real de estado de UI.
- **Correção:** em `ReportTabView` aceitar um callback opcional `onRetry?: () => void` e, no bloco de erro (`:23-29`), renderizar um `<button type="button" onClick={onRetry}>Tentar novamente</button>` quando fornecido. Passar `onRetry={load}` em `admin-relatorios-client.tsx` (linha do `<ReportTabView ... />`) e o equivalente em `painel-relatorios-client.tsx`. Alternativa mínima: mover a `load` para fora do `useCallback` de período e expor no shell.
- **Verificação:** com a rota `/api/admin/relatorios/bi/[tab]` mockada para 500, a aba mostra a mensagem de erro **com** botão "Tentar novamente"; clicar re-dispara `load` e, com o mock revertido, renderiza os KPIs/gráficos. Cobrir por teste de componente do `ReportTabView` (render com `error` + `onRetry` → botão presente e chamado no clique).

## Achados corrigidos desde a rodada anterior (re-verificação)

### [FE-005] Acesso ao curso LMS devolvia JSON cru ao aluno em caso de falha
- **Severidade:** P2 · **Status:** Corrigido (código atual)
- **Local/Evidência:** `src/app/api/aluno/curso/[enrollmentId]/acessar/route.ts` agora define `errorRedirect(code) = NextResponse.redirect(new URL(`/aluno/cursos?erro=${code}`, request.url))` e usa `errorRedirect("indisponivel"|"parceiro"|"falha")` nos 3 ramos de erro (não-LMS/inativa, portal do parceiro nulo, falha de SSO). A tela `src/app/aluno/cursos/page.tsx:72-80` lê `searchParams.erro`, mapeia por `ACCESS_ERROR_MESSAGE` e renderiza banner `role="alert"` (`:141`). Não há mais `NextResponse.json({error},...)` em ramo de navegação.
- **Verificação:** `grep -n "NextResponse.json" src/app/api/aluno/curso/[enrollmentId]/acessar/route.ts` não retorna respostas de erro de navegação; `curl -sI` num ramo de erro devolve `3xx Location: /aluno/cursos?erro=...`.

### [FE-006] Botões só-ícone em `security-tab` sem nome acessível
- **Severidade:** P3 · **Status:** Corrigido (código atual)
- **Local/Evidência:** `src/components/shared/student-management/security-tab.tsx:287,300,485,498` — os 4 botões mostrar/ocultar e copiar senha (LMS por curso + plataforma EA) agora têm `aria-label={reveal ? "Ocultar senha" : "Mostrar senha"}` e `aria-label="Copiar senha"` além do `title`.
- **Verificação:** `npx eslint src/components/shared/student-management/security-tab.tsx` sem violações; inspeção manual: cada botão de ícone anuncia rótulo.

### Históricos (permanecem Corrigidos)
- **FE-001** `/admin/webhooks` link morto (P2) → Corrigido (`grep -rn "admin/webhooks" src` = vazio).
- **FE-002** `CheckoutButton` órfão (P3) → Corrigido (arquivo inexistente).
- **FE-004** `target="_blank"` sem `rel` (P3) → Corrigido (nenhuma ocorrência sem `rel="noopener"`).

## Cobertura — 137/137 telas (tela × veredito)

| # | Tela | Veredito |
|---|---|---|
| 1 | `/` | OK |
| 2 | `/ajuda` | OK |
| 3 | `/categoria/[slug]` | OK |
| 4 | `/certificado` | OK |
| 5 | `/checkout` | OK |
| 6 | `/checkout/confirmacao` | OK |
| 7 | `/como-funciona` | OK |
| 8 | `/contato` | OK |
| 9 | `/contrato-de-revenda` | OK |
| 10 | `/cursos` | OK |
| 11 | `/cursos-tecnicos/ir` | OK |
| 12 | `/cursos/[slug]` | OK |
| 13 | `/eja/ir` | OK |
| 14 | `/pacotes/[slug]` | OK |
| 15 | `/pagar/[id]` (PMB retoma cobrança — novo) | OK |
| 16 | `/privacidade` | OK |
| 17 | `/reembolso` | OK |
| 18 | `/sobre` | OK |
| 19 | `/termos` | OK |
| 20 | `/login` | OK |
| 21 | `/forgot-password` | OK |
| 22 | `/reset-password` | OK |
| 23 | `/livrecursos` | OK |
| 24 | `/lp-revenda2` | OK |
| 25 | `/seja-revendedor` | OK |
| 26 | `/seja-revendedor/checkout` | OK |
| 27 | `/seja-revendedor/pre-live` | OK |
| 28 | `/alterar-senha-inicial` | OK |
| 29 | `/logout` | OK |
| 30 | `/offline` | OK |
| 31 | `/inadimplente` | OK |
| 32 | `/cobranca/[paymentId]` | OK |
| 33 | `/placar` (novo) | OK |
| 34 | `/validar` | OK |
| 35 | `/validar/[code]` | OK |
| 36 | `/admin` | OK |
| 37 | `/admin/alunos` | OK |
| 38 | `/admin/alunos/[id]` | OK |
| 39 | `/admin/analytics` (redirect→relatórios) | OK |
| 40 | `/admin/atendimento` | OK |
| 41 | `/admin/automacao` | OK |
| 42 | `/admin/automacao/conexao` | OK |
| 43 | `/admin/automacao/mensagens` | OK |
| 44 | `/admin/banner` | OK |
| 45 | `/admin/catalogo` | OK |
| 46 | `/admin/certificados` | OK |
| 47 | `/admin/certificados/configuracoes` | OK |
| 48 | `/admin/certificados/emitir` | OK |
| 49 | `/admin/certificados/template-padrao` | OK |
| 50 | `/admin/comunicacao` | OK |
| 51 | `/admin/configuracoes` | OK |
| 52 | `/admin/configuracoes/automacao` | OK |
| 53 | `/admin/configuracoes/certificados` | OK |
| 54 | `/admin/configuracoes/indicacoes` | OK |
| 55 | `/admin/configuracoes/rastreamento` | OK |
| 56 | `/admin/configuracoes/unidade-tecnica` | OK |
| 57 | `/admin/equipe` | OK |
| 58 | `/admin/equipe/[id]` | OK |
| 59 | `/admin/financeiro` | OK |
| 60 | `/admin/indicacoes` | OK |
| 61 | `/admin/indicacoes/comissoes` | OK |
| 62 | `/admin/indicacoes/saques` | OK |
| 63 | `/admin/leads` | OK |
| 64 | `/admin/leads-revenda` | OK |
| 65 | `/admin/meu-perfil` | OK |
| 66 | `/admin/notificacoes` | OK |
| 67 | `/admin/relatorios` (redirect) | OK |
| 68 | `/admin/relatorios/[tab]` (hub BI — novo) | Achado FE-007 |
| 69 | `/admin/relatorios/exportar/[type]` | OK |
| 70 | `/admin/revendedores` | OK |
| 71 | `/admin/revendedores/[id]` | OK |
| 72 | `/admin/revendedores/[id]/comissoes` | OK |
| 73 | `/admin/treinamentos` | OK |
| 74 | `/admin/treinamentos/assistir` | OK |
| 75 | `/admin/treinamentos/assistir/[moduleId]` | OK |
| 76 | `/admin/vendas` | OK |
| 77 | `/admin/vendas/alunos` | OK |
| 78 | `/admin/vendas/alunos/[id]` | OK |
| 79 | `/admin/vendas/cupons` | OK |
| 80 | `/admin/vendas/nova` | OK |
| 81 | `/admin/vitrine` | OK |
| 82 | `/aluno` | OK |
| 83 | `/aluno/certificados` | OK |
| 84 | `/aluno/certificados/[id]` | OK |
| 85 | `/aluno/comprar` | OK |
| 86 | `/aluno/comprar/pagar/[id]` | OK |
| 87 | `/aluno/cursos` (banner ?erro= — FE-005 corrigido) | OK |
| 88 | `/aluno/notificacoes` | OK |
| 89 | `/aluno/pagamentos` | OK |
| 90 | `/aluno/perfil` | OK |
| 91 | `/aluno/suporte` | OK |
| 92 | `/loja` | OK |
| 93 | `/loja/checkout` | Achado FE-003 |
| 94 | `/loja/confirmacao` | Achado FE-003 |
| 95 | `/loja/contato` | OK |
| 96 | `/loja/curso/[slug]` | OK |
| 97 | `/loja/cursos` | OK |
| 98 | `/loja/pacote/[slug]` | OK |
| 99 | `/loja/pagar/[id]` | Achado FE-003 |
| 100 | `/loja/suspended` | OK |
| 101 | `/painel` | OK |
| 102 | `/painel/alunos` | OK |
| 103 | `/painel/alunos/[id]` | OK |
| 104 | `/painel/atendimento` | OK |
| 105 | `/painel/automacao` | OK |
| 106 | `/painel/automacao/conexao` | OK |
| 107 | `/painel/automacao/mensagens` | OK |
| 108 | `/painel/certificados` | OK |
| 109 | `/painel/certificados/emitidos` | OK |
| 110 | `/painel/certificados/emitir` | OK |
| 111 | `/painel/certificados/template` | OK |
| 112 | `/painel/comunicacao` | OK |
| 113 | `/painel/configuracoes` | OK |
| 114 | `/painel/cupons` | OK |
| 115 | `/painel/cursos` | OK |
| 116 | `/painel/dominio` | OK |
| 117 | `/painel/equipe` | OK |
| 118 | `/painel/financeiro` | OK |
| 119 | `/painel/indicacoes` | OK |
| 120 | `/painel/indicacoes/materiais` | OK |
| 121 | `/painel/indicacoes/sacar` | OK |
| 122 | `/painel/leads` | OK |
| 123 | `/painel/leads/configuracao` | OK |
| 124 | `/painel/notificacoes` | OK |
| 125 | `/painel/onboarding` | OK |
| 126 | `/painel/placar` (placar indicações — novo) | OK |
| 127 | `/painel/relatorios` (redirect) | OK |
| 128 | `/painel/relatorios/[tab]` (hub BI — novo) | Achado FE-007 |
| 129 | `/painel/revendas` | OK |
| 130 | `/painel/revendas/[id]` | OK |
| 131 | `/painel/revendas/leads` | OK |
| 132 | `/painel/revendas/nova` | OK |
| 133 | `/painel/treinamentos` | OK |
| 134 | `/painel/treinamentos/[moduleId]` | OK |
| 135 | `/painel/vendas` | OK |
| 136 | `/painel/vendas/nova` | OK |
| 137 | `/painel/vitrine` | OK |

### Cobertura complementar (não-tela)
- **Boundaries (17/17):** `error.tsx`+`global-error.tsx`+`not-found.tsx` raiz; `admin`/`aluno`/`loja`/`painel` com error+loading+not-found; `(main)` com loading+not-found (erro herda o boundary raiz). Grupos `(auth)`/`(landing)` e rotas top-level (`/placar`, `/validar`, `/cobranca`, `/checkout`, `/inadimplente`, `/offline`, `/logout`, `/alterar-senha-inicial`) herdam `src/app/error.tsx`+`not-found.tsx`. **Cobertura completa.**
- **Componentes (342/342):** varredura de `href`/`Link`/`router.push|replace`/`redirect`/`window.location.href` + href-templates de payloads de BI → **zero link morto**. Novos componentes revisados: hub de BI (`components/reports/*`, `admin-relatorios-client`, `painel-relatorios-client`) — loading/empty OK, erro sem retry (FE-007); `funnel-chart-card.tsx` (overflow corrigido, `widthPct` clamp ≤100% + `overflow-hidden`); `data-table.tsx` (empty + paginação + shadcn `Table` com wrapper `overflow-x-auto`); `tour-runner.tsx` (driver.js sob demanda, `visibleSteps` defensivo, persistência de dispensa, botão de ajuda com `aria-label="Refazer tutorial"`); `placar-client` (render sempre a partir do snapshot server — sem spinner infinito); `use-sidebar-collapsed.ts` + botões de recolher com `aria-label` "Expandir/Recolher menu"; seletor de parcelas (`mp-checkout-form.tsx:619-646`) com `<Label htmlFor="cc-installments">` + `<select id>` casados, opções vindas do MP real, `disabled` durante submit.
- **`<img>` cru:** apenas 2 (QR PIX data-URI em `asaas-checkout-form.tsx:621` e `mp-checkout-form.tsx:898`), ambos com `alt` — **N/A** (`next/image` não otimiza data-URI).
- **N/A do domínio FE:** route handlers/crons/webhooks (406 métodos), models/migrations/enums e Server Actions de dados → vereditos de auth/Zod/idempotência pertencem a **seguranca**/**api**/**saas**/**banco**. Exceção mantida: `api/aluno/curso/[enrollmentId]/acessar` entra em FE por ser alvo de navegação `<a>` (FE-005, agora corrigido).

## ⚠️ MIGRAÇÃO Vercel→VPS (sinalização do domínio FE)
- `src/components/admin/api-docs-tab.tsx:15` fixa `WEBHOOK_URL = "https://profissionalizamaisbrasil.com.br/api/webhooks/lms"` como constante de documentação exibida ao SUPER_ADMIN/integrador do LMS. Não quebra runtime (é texto copiável), mas ficará desatualizado se o domínio público mudar na VPS. Recomendado derivar de `NEXT_PUBLIC_APP_URL`/`appUrl()`.
- Demais itens FE (boundaries, links, estados, forms, tours, placar, hub de BI) são agnósticos de Edge/Upstash/Storage — sem outras quebras previstas na migração.
