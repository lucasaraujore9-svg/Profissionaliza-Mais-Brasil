# Re-Analise 002 — Links e Caminhos
**Data:** 2026-05-23

## Sumario
- ~210 ocorrencias `href=` em `.tsx` auditadas
- 49 hrefs literais unicos + 36 template-string unicos cruzados contra 91 rotas reais
- **3 P0** quebradas no UI publico · **5 P1** com risco de UX/seguranca · **4 P2** cosmeticas

## P0 — bloqueia lancamento

### [LINK-P0-001] Ancoras quebradas no header da landing livrecursos
**Onde:** `src/components/livrecursos/header.tsx:11` (`#beneficios`) e linha 18 (`#cadastro`)
**Atual:** `<Link href="#beneficios">Como funciona</Link>` e `<Link href="#cadastro">Quero ser revendedor</Link>`
**Problema:** Nenhuma secao na `livrecursos/page.tsx` (nem nos componentes renderizados — `HeroCTA`, `VantagensQuadrinhos`, `ComoFuncionaSection`, `FormularioInteresse`, etc.) possui `id="beneficios"` ou `id="cadastro"`. Clique nos dois principais CTAs do header da landing nao rola para lugar nenhum.
**Fix:** Trocar `#beneficios` → `#planos` (existe em `plano-unico.tsx` ou `planos-section.tsx`) e `#cadastro` → `#formulario` (existe em `formulario-interesse.tsx:83`).

### [LINK-P0-002] FeaturedSection da loja aponta para rota inexistente
**Onde:** `src/components/loja/featured-section.tsx:49`
**Atual:** `href={`/curso/${item.slug}`}`
**Problema:** Componente exporta `FeaturedSection` com link para `/curso/[slug]` (singular). Em tenant subdomain o `src/proxy.ts` reescreve `/curso/*` para `/loja/curso/*`, entao funciona em subdomain — porem em apex/PMB cai 404. Inconsistente com `course-card.tsx` que usa `/loja/curso/${curso.slug}`. Componente esta orfao (nenhum `page.tsx` o importa) mas e dead code com link errado pronto pra ser usado.
**Fix:** Padronizar para `href={`/loja/curso/${item.slug}`}` ou remover o componente se nao for usado.

### [LINK-P0-003] Forms `action="/cursos"` quebram em subdomain de tenant
**Onde:** `src/components/shared/layouts/navbar-main.tsx:143` e `src/components/main/home/hero-banner.tsx:52`
**Atual:** `<form role="search" action="/cursos" method="get">`
**Problema:** `loja/layout.tsx` usa `NavbarMain` na vitrine do tenant. `/cursos` NAO esta em `VITRINE_PATH_PREFIXES` (apenas `/curso`, `/checkout`, `/confirmacao`), entao a busca cai no `(main)/cursos` do site PMB — fora do contexto do revendedor (perde tenant). Mesmo problema com links `<Link href="/cursos">` na navbar usada em tenant (linhas 130, 180, 201).
**Fix:** Criar variante `NavbarLoja` real para usar em `loja/layout.tsx` apontando para `/loja`, OU adicionar `/cursos` em `VITRINE_PATH_PREFIXES` e criar rota equivalente em `/loja/cursos`.

## P1 — corrigir antes go-live

### [LINK-P1-001] `target="_blank"` sem `noopener` (tab-nabbing)
**Onde:** 8 ocorrencias com apenas `rel="noreferrer"` (falta `noopener`):
- `src/app/inadimplente/page.tsx:104`
- `src/components/admin/new-reseller-dialog.tsx:346`
- `src/components/admin/financeiro-tenant-payments.tsx:495`
- `src/components/admin/reseller-support-notes.tsx:73`
- `src/components/shared/layouts/footer-main.tsx:151, 162, 173` (Instagram/Facebook/YouTube)
- `src/components/painel/painel-nova-venda-client.tsx:116`
**Problema:** `noreferrer` esconde Referer mas nao previne `window.opener` em browsers antigos.
**Fix:** trocar `rel="noreferrer"` por `rel="noopener noreferrer"`.

### [LINK-P1-002] Footer loja usa apenas `rel="noopener"` (falta noreferrer)
**Onde:** `src/components/shared/layouts/footer-loja.tsx:20`
**Atual:** `rel="noopener"` no link "Powered by PMB"
**Fix:** `rel="noopener noreferrer"` para coerencia.

### [LINK-P1-003] `NavbarLoja` orfa com hrefs invalidos para contexto tenant
**Onde:** `src/components/shared/layouts/navbar-loja.tsx` (componente nao importado em lugar nenhum)
**Atual:** `href="/cursos"`, `/sobre`, `/contato`
**Problema:** Componente nao usado mas se reintroduzido, todos os 4 links de navegacao falham (mesmo motivo de P0-003). Dead code com armadilha.
**Fix:** Remover arquivo OU alinhar com layout do loja (links para `/loja`, etc.).

### [LINK-P1-004] Links institucionais cross-domain hardcoded (livrecursos footer)
**Onde:** `src/components/livrecursos/footer.tsx:10,19,25`
**Atual:** `https://profissionalizamaisbrasil.com.br/termos` etc.
**Problema:** URL fixa nao usa `appUrl()` de `src/lib/tenant/urls.ts`. Em ambientes staging/preview o link cai em prod.
**Fix:** Usar helper `appUrl()` ou env `NEXT_PUBLIC_APP_URL`.

### [LINK-P1-005] APIs hardcoded com `www.profissionalizamaisbrasil.com.br`
**Onde:** `src/app/api/admin/vendas/route.ts:287`, `src/app/api/aluno/comprar/route.ts:207`, `src/app/api/painel/vendas/route.ts:299`
**Atual:** Fallback hardcoded `"https://www.profissionalizamaisbrasil.com.br/..."`
**Problema:** Quando `NEXT_PUBLIC_APP_URL` nao setado, MP volta para prod mesmo em dev/staging.
**Fix:** Substituir por `appUrl()` ou validar env obrigatoria.

## P2 — nice to have

### [LINK-P2-001] `/loja/curso/[slug]` vs `/curso/[slug]` inconsistente
**Onde:** Mistura em `src/components/loja/course-card.tsx:63` (`/loja/curso/`) vs `src/components/loja/featured-section.tsx:49` (`/curso/`). Apesar do rewrite cuidar disso em tenant, escolher um padrao reduz confusao.

### [LINK-P2-002] Componentes `FeaturedSection`, `NavbarLoja` sao dead code
**Onde:** `src/components/loja/featured-section.tsx`, `src/components/shared/layouts/navbar-loja.tsx`
**Fix:** Remover ou usar de fato.

### [LINK-P2-003] `categoria/[slug]` existe mas links usam querystring `/cursos?categoria=`
**Onde:** Toda navegacao por categoria usa `/cursos?categoria=${slug}` (em `navbar-main.tsx`, `categories-grid.tsx`, `footer-main.tsx`). A rota `(main)/categoria/[slug]/page.tsx` existe mas nao e linkada de lugar nenhum.
**Fix:** Decidir entre `/categoria/[slug]` (mais SEO) ou remover a rota dedicada se a querystring e canonica.

### [LINK-P2-004] Email sender `bem-vindo@bmbr.com.br` em lib/email
**Onde:** `src/lib/email/mailer.ts:164`
**Problema:** Dominio `bmbr.com.br` diferente de `profissionalizamaisbrasil.com.br` — pode disparar SPF/DKIM se nao alinhado. Apenas verificar config DNS, nao e bug de link.
