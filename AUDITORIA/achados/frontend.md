# Auditoria — Frontend / UX
_Data: 2026-06-24 · Referência: .claude/skills/auditoria-saas/references/06-frontend-ux.md · Itens do inventário cobertos: 131/131 telas + 324/324 componentes + 9 layouts + 18 boundaries (error/not-found/loading/global-error)_

> Substitui a auditoria de 2026-06-20. `tsc --noEmit` = 0 erros. `eslint .` = 0 erros (1 warning trivial em `scripts/render-cert-samples.tsx`, fora do domínio FE). 131/131 `page.tsx` com `export default`. Nenhuma rota estruturalmente quebrada. **Zero links mortos** em todo o `src/` (incl. notificações e nav). Re-verificação dos 4 achados anteriores: **FE-001, FE-002 e FE-004 CORRIGIDOS** no código atual; **FE-003 segue Aberto**. 2 achados novos nos commits recentes de LMS.

## Resumo
- Itens verificados: 131 telas + 324 componentes + 18 boundaries · Achados: **P0=0 P1=0 P2=1 P3=2** · Nota do domínio: **8.7/10**

## Achados

### [FE-005] Acesso ao curso LMS devolve JSON cru ao aluno em caso de falha (tela "quebrada" no navegador)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/aluno/curso/[enrollmentId]/acessar/route.ts:44,57,75` (respostas `NextResponse.json({error},{status})`) · disparado por navegação `<a>` em `src/app/aluno/page.tsx:102-103` (continue, `target="_blank"`) e `src/app/aluno/cursos/page.tsx:247-248` (por curso, **mesma aba**, sem `target`)
- **Evidência:** o botão "Acessar curso/aulas" de cursos `provider=LMS` é um link de navegação direta (`<a href={`/api/aluno/curso/${id}/acessar`}>`), não um `fetch`. O route handler responde com `NextResponse.json({ error: "..." }, { status: 404|409|502 })` quando: a matrícula não é LMS/ativa (404), o portal do parceiro está indisponível (409, `lmsPortalUrl` nulo) ou a geração do token SSO falha (502, ex.: LMS fora do ar). Como a resposta é `application/json` e o clique é navegação de página, o navegador renderiza o corpo bruto `{"error":"Não foi possível abrir o curso agora..."}`. Em `/aluno/cursos` a navegação é na **mesma aba** → o aluno perde a área e fica preso no JSON.
- **Impacto:** quando o LMS (lms.bmbr.com.br) tiver indisponibilidade — exatamente o momento de maior fricção — o aluno pagante vê uma "tela de erro" em texto cru de API em vez de uma página amigável com instrução/retorno. Equivale a tela branca de produto. Atinge 100% dos alunos de cursos LMS no incidente.
- **Correção:** trocar as respostas de erro de navegação por `NextResponse.redirect` para uma página amigável da área do aluno, preservando o `request.url` como base:
  1. Nos 3 ramos de erro do route (`:44`, `:57`, `:75`), em vez de `NextResponse.json(...)`, fazer `return NextResponse.redirect(new URL("/aluno/cursos?erro=acesso", request.url))` (use querystrings distintas por causa: `?erro=indisponivel`, `?erro=parceiro`, `?erro=sso`).
  2. Em `src/app/aluno/cursos/page.tsx`, ler `searchParams.erro` e renderizar um banner `<div role="alert">` no topo (mesmo padrão visual do banner `payment_failed` em `src/app/loja/checkout/page.tsx:325-329`) com mensagem por causa + botão "Tentar novamente" (link de volta ao `/acessar`) e "Falar com o suporte" (`/aluno/suporte`).
  3. Manter `status 401→/login` como já está (já é redirect).
- **Verificação:** com o LMS mockado para falhar (ou `LMS_API_KEY` inválida em ambiente de teste), clicar "Acessar curso" em `/aluno/cursos` deve cair em `/aluno/cursos?erro=sso` exibindo o banner amigável — `curl -sI` no endpoint deve retornar `3xx Location: /aluno/cursos?erro=...`, nunca `Content-Type: application/json` num ramo de erro.

### [FE-003] `confirmacaoPath` default `/loja/confirmacao` expõe o prefixo interno `/loja` na URL da revenda pós-compra
- **Severidade:** P3
- **Status:** Aberto
- **Local:** defaults em `src/components/loja/asaas-checkout-form.tsx:104` e `src/components/loja/mp-checkout-form.tsx:134` (`confirmacaoPath = "/loja/confirmacao"`); os 3 sites de instanciação **não passam** override: `src/app/loja/checkout/page.tsx:133-138` (`pkgPanelForm`) e `:306-311` (`coursePanelForm`) montam `FormConfig` sem `confirmacaoPath`; `src/app/loja/pagar/[id]/page.tsx:133` instancia `MpCheckoutForm` sem `confirmacaoPath`. Redirect efetivo: `asaas-checkout-form.tsx:239,289` e `mp-checkout-form.tsx:373,423` fazem `window.location.href = successUrlFor(id)` → `/loja/confirmacao?...`.
- **Evidência:** no subdomínio de revenda o proxy (`src/proxy.ts:322` + `src/lib/tenant/vitrine-paths.ts`) reescreve `/confirmacao`→`/loja/confirmacao`, mas `isVitrinePath("/loja/confirmacao")` é `false` (a lista cobre `/confirmacao`, não `/loja/confirmacao`), então a URL literal `/loja/confirmacao` é servida direto (não 404) — porém deixa o prefixo interno `/loja` visível. Inconsistente com o checkout PMB, que usa `/checkout/confirmacao` (ver `src/components/loja/pmb-checkout-form.tsx:255,265,313`).
- **Impacto:** cosmético/consistência de URL (não quebra a confirmação). Vaza nomenclatura interna `/loja` ao cliente da revenda.
- **Correção:** passar `confirmacaoPath: "/confirmacao"` no `FormConfig` dos 3 sites: em `src/app/loja/checkout/page.tsx` adicionar `confirmacaoPath: "/confirmacao"` aos objetos `pkgPanelForm` (kinds asaas/mp) e `coursePanelForm`; em `src/app/loja/pagar/[id]/page.tsx:133` passar `confirmacaoPath="/confirmacao"` ao `MpCheckoutForm`. (O `CheckoutPanel` já repassa `form.confirmacaoPath` em `checkout-panel.tsx:102,113`.) Verificar que `/confirmacao` é vitrine-path (já é) e que o route físico `/loja/confirmacao` segue resolvendo via proxy.
- **Verificação:** após compra numa vitrine de revenda, a URL de confirmação é `https://{slug}.livrecursos.com.br/confirmacao?enrollment_id=...` (sem `/loja`). Adicionar caso ao `src/lib/tenant/vitrine-paths.test.ts` cobrindo `/confirmacao`.

### [FE-006] Botões só-ícone em `security-tab` usam `title` sem `aria-label` (nome acessível inconsistente)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/components/shared/student-management/security-tab.tsx:286,298,482,494` (mostrar/ocultar e copiar senha — LMS por curso e plataforma EA)
- **Evidência:** os `<button type="button">` desses pontos têm apenas conteúdo de ícone (`<Eye/>`, `<Copy/>`) e `title={...}`/`title="Copiar senha"`, sem `aria-label`. `title` é tooltip e só às vezes vira nome acessível; o padrão correto (já adotado nos componentes novos `src/components/admin/api-docs-tab.tsx:157,193` e `src/components/aluno/platform-credentials-card.tsx:44,120`) é `aria-label`.
- **Impacto:** leitor de tela pode anunciar "botão" sem rótulo nesses controles do detalhe do aluno (admin/painel). Audiência interna pequena → impacto baixo, mas é violação WCAG 4.1.2 (Name, Role, Value) e inconsistência com os componentes irmãos.
- **Correção:** adicionar `aria-label` aos 4 botões: nos de mostrar/ocultar (`:286`, `:482`) usar `aria-label={reveal ? "Ocultar senha" : "Mostrar senha"}`; nos de copiar (`:298`, `:494`) `aria-label="Copiar senha"` (pode manter o `title` para tooltip). Padronizar com o restante do arquivo (`platform-credentials-card.tsx`).
- **Verificação:** `npx eslint src/components/shared/student-management/security-tab.tsx` sem novas violações; inspeção manual via axe/leitor de tela: cada botão de ícone anuncia o rótulo. Opcional: ativar a regra `jsx-a11y/control-has-associated-label` para travar regressão.

## Cobertura

**Telas (131/131) — todas com veredito de estados (loading/erro/vazio/sucesso):**
- `(main)` institucional (`/`, `/sobre`, `/contato`, `/cursos`, `/cursos/[slug]`, `/categoria/[slug]`, `/pacotes/[slug]`, `/certificado`, `/validar`, `/validar/[code]`, `/como-funciona`, `/ajuda`, `/termos`, `/privacidade`, `/reembolso`, `/contrato-de-revenda`, `/eja/ir`, `/cursos-tecnicos/ir`) — **OK** (boundary `(main)/loading.tsx`+`(main)/not-found.tsx`; footer/nav links cruzados com rotas reais = todos resolvem; `/certificado` existe em `(main)/certificado`).
- `(auth)`/landing (`/login`, `/forgot-password`, `/reset-password`, `/alterar-senha-inicial`, `/logout`, `/seja-revendedor`, `/seja-revendedor/checkout`, `/seja-revendedor/pre-live`, `/livrecursos`, `/lp-revenda2`) — **OK** (herdam boundary raiz; forms com Label/disabled-on-submit/erro-servidor).
- `admin/*` (47 telas incl. `/admin/configuracoes` com nova aba **API**, treinamentos, indicações, revendedores) — **OK** (boundary `admin/error.tsx`+`admin/loading.tsx`+`admin/not-found.tsx`; nova `api-docs-tab.tsx` com a11y + estado vazio do segredo).
- `painel/*` (incl. **novas** `/painel/revendas`, `/painel/revendas/nova`, `/painel/revendas/[id]`, `/painel/revendas/leads`) — **OK** (guards `redirect`/`notFound` server-side; empty states presentes; `sub-revenda-detail.tsx` com empty state + `rel=noopener` + fallbacks de status; `nova-revenda-form.tsx` com Label/disabled/field-errors/erro-conexão).
- `aluno/*` (`/aluno`, `/aluno/cursos`, `/aluno/comprar`, `/aluno/certificados`, `/aluno/certificados/[id]`, `/aluno/pagamentos`, `/aluno/perfil`, `/aluno/suporte`, `/aluno/notificacoes`) — **OK** salvo **FE-005** (acesso LMS); empty states e branching EA/LMS corretos.
- `loja/*` (`/loja`, `/loja/cursos`, `/loja/curso/[slug]`, `/loja/pacote/[slug]`, `/loja/checkout`, `/loja/pagar/[id]`, `/loja/confirmacao`, `/loja/contato`, `/loja/suspended`) — **OK** salvo **FE-003** (prefixo `/loja` na confirmação); `CheckoutPanel` com cupom ao vivo + 4 estados nos forms.
- `/inadimplente`, `/cobranca/[paymentId]`, `/checkout`, `/checkout/confirmacao`, `/offline`, `/placar` — **OK** (boundaries + retry; `/cobranca/[paymentId]` resolve por Asaas id, casa com link `:183` de `sub-revenda-detail`).

**Componentes (324/324):** varredura exaustiva de `href`/`Link`/`router.push|replace`/`redirect`/`window.location.href`/`createNotification.href`. Resultado:
- Links internos: **todos** os destinos literais e de template-literal cruzam com as 131 rotas reais. **/admin/webhooks não existe mais em lugar nenhum** (FE-001 fechado). Notificações em `src/lib/mercadopago/process.ts:274,316` agora apontam `/admin/configuracoes` (existe).
- `target="_blank"`: **zero** ocorrências sem `rel="noopener noreferrer"` (FE-004 fechado, incl. `onboarding-wizard.tsx:191`).
- `<img>`: só 2 (QR PIX data-URI em `asaas-checkout-form.tsx:610` e `mp-checkout-form.tsx:762`), ambos com `alt` — **N/A** (next/image não otimiza data-URI).
- Estados de fetch: 75 client-components com `useEffect`+`fetch` revisados; padrão consistente de loading/erro(toast)/empty (ex.: `leads-revenda-list.tsx:101`, `leads-revenda-kanban.tsx:240`, `sub-revenda-detail.tsx:158`). Sem spinner-infinito-no-erro detectado.
- a11y: `eslint-config-next/core-web-vitals` (jsx-a11y) ativo e verde; ressalva **FE-006** (4 botões só-ícone com `title` sem `aria-label`).

**Boundaries (18/18):** `error.tsx`+`global-error.tsx`+`not-found.tsx` raiz com retry; `admin`/`aluno`/`loja`/`painel` com error+loading+not-found; `(main)` com loading+not-found. **OK**.

**Re-verificação dos achados de 2026-06-20:**
- **FE-001** `/admin/webhooks` (P2) → **CORRIGIDO** (rota removida das notificações; `grep -rn "admin/webhooks" src` = vazio).
- **FE-002** `CheckoutButton` órfão (P3) → **CORRIGIDO** (`src/components/loja/checkout-button.tsx` não existe mais).
- **FE-003** prefixo `/loja` na confirmação (P3) → **ABERTO** (agora 3 sites de instanciação não passam `confirmacaoPath`).
- **FE-004** `target=_blank` sem `rel` (P3) → **CORRIGIDO**.

**N/A do domínio:** route handlers/crons/webhooks (390 métodos) → veredito de auth/Zod/idempotência é dos domínios **seguranca**/**api**/**saas**, não FE. Exceção: `api/aluno/curso/[enrollmentId]/acessar` entra em FE por ser alvo de navegação `<a>` (FE-005). Models/migrations/enums → fora do escopo FE.

## ⚠️ MIGRAÇÃO Vercel→VPS (sinalização do domínio FE)
- `src/components/admin/api-docs-tab.tsx:15` fixa `WEBHOOK_URL = "https://profissionalizamaisbrasil.com.br/api/webhooks/lms"` como constante de documentação. Se o domínio público mudar na VPS, este texto exibido ao SUPER_ADMIN/integrador do LMS ficará desatualizado (não quebra runtime; é doc copiável). Recomendado derivar de `NEXT_PUBLIC_APP_URL`/`appUrl()` numa próxima iteração.
- Demais itens FE não dependem de Edge/Upstash/Storage diretamente; sem outras quebras de migração no domínio frontend. (Boundaries, links, estados e forms são agnósticos de infra.)
