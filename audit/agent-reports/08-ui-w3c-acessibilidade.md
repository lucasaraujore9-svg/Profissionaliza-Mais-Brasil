# Relatório 08 — UI, Layout, W3C e Acessibilidade

> Agente: UI / W3C / Acessibilidade  
> Data: 2026-05-28  
> Escopo: JSX/TSX estático — 108 páginas, 253 componentes (sem browser)  
> Referência: WCAG 2.2 AA

---

## Resumo Executivo

| Severidade   | Qtd |
|--------------|-----|
| Alto         |  5  |
| Médio        |  9  |
| Baixo        |  6  |
| Informativo  |  3  |

Problemas estruturais concentram-se em: (1) erro de foco/contraste em formulários de checkout/contato que usam `focus:outline-none` sem anel visível; (2) ausência de `role="alert"` em mensagens de erro crítico (login, senha, wizard de cadastro) — AT não anuncia; (3) slideshow com auto-rotação sem mecanismo de pausa; (4) formulários de compra sem atributos `autocomplete`; (5) hierarquia de headings quebrada em múltiplas páginas públicas.

---

## Achados

### [Alto] Foco visível insuficiente em formulários de checkout e contato
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Teclado / Foco
- **Arquivos:**
  - `src/app/cobranca/[paymentId]/checkout-client.tsx` linhas 338, 349, 364, 378, 392, 411, 421, …
  - `src/components/main/contact-form.tsx` linhas 94, 105, 115, 126
  - `src/app/alterar-senha-inicial/page.tsx` linhas 113, 122 (inputs de senha)
- **Trecho:** `className="... focus:border-[var(--color-pmb-green)] focus:outline-none"` — sem `focus-visible:ring-*`
- **Evidência:** Inputs nativos `<input>` com `outline-none` e somente mudança de cor de borda no foco. Mudança de borda de 1 px não constitui indicador de foco adequado (mínima área 2 px contornando o componente, com contraste 3:1).
- **Impacto:** Usuários de teclado não conseguem ver qual campo está focado nos formulários de pagamento (cobrança Asaas), contato e redefinição de senha.
- **Recomendação:** Substituir `focus:outline-none` por `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)]` ou usar o componente `<Input>` shadcn/ui (que já tem `focus-visible:ring-3`).
- **Correção:** Simples (atributo de classe).
- **Status:** Recomendado
- **WCAG:** 2.4.7 (AA) e 2.4.11 (AA, novo em 2.2)
- **Confiança:** Alta

---

### [Alto] Mensagens de erro não anunciadas por leitores de tela
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Estados / ARIA
- **Arquivos:**
  - `src/components/auth/login-form.tsx:159`
  - `src/app/alterar-senha-inicial/page.tsx:125`
  - `src/components/main/checkout-wizard.tsx:178` (submitError)
  - `src/components/loja/student-form.tsx:238` (errorMsg)
- **Trecho:** `{state.kind === "error" && (<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 …">{state.message}</div>)}`
- **Evidência:** Divs de erro renderizados condicionalmente sem `role="alert"` ou `aria-live="assertive"`. Leitores de tela (NVDA, VoiceOver) não percebem o surgimento do conteúdo.
- **Impacto:** Usuário cego envia credenciais erradas ou formulário inválido mas não recebe feedback; fica preso em loop sem saber o porquê.
- **Recomendação:** Adicionar `role="alert"` (ou `aria-live="assertive"` + `aria-atomic="true"`) ao container do erro. Para o caso de erros de campos individuais, adicionar `aria-describedby` no input apontando para o `<p>` de erro.
- **Correção:** Simples (atributo).
- **Status:** Recomendado
- **WCAG:** 4.1.3 (AA), 3.3.1 (A)
- **Confiança:** Alta

---

### [Alto] Ausência de mecanismo de pausa no slideshow com auto-rotação
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Movimento / Animação
- **Arquivo:** `src/components/main/home/hero-slides.tsx:26-34`
- **Trecho:** `window.setInterval(() => { setIndex(…) }, intervalMs)` — `intervalMs` padrão 6000 ms; nenhum botão de pause.
- **Evidência:** O componente rotaciona slides automaticamente e expõe apenas botões de navegação (pontos). Não há controle de pausa/parar/ocultar.
- **Impacto:** Usuários com dificuldades cognitivas, epilepsia fotossensível ou que usam tecnologia assistiva (como Switch Access) não conseguem parar o movimento.
- **Recomendação:** Adicionar botão "pausar" (ou usar `prefers-reduced-motion` para desativar auto-rotação). Implementar `aria-live="off"` na região do carrossel e `aria-roledescription="carousel"` no container.
- **Correção:** Estrutural (pequena — media query + botão pause).
- **Status:** Recomendado
- **WCAG:** 2.2.2 (A)
- **Confiança:** Alta

---

### [Alto] Formulários de compra sem atributos `autocomplete`
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Formulários
- **Arquivos:**
  - `src/components/main/checkout-form-pessoal.tsx` (campos: nome, email, telefone, cpf, senha)
  - `src/components/main/checkout-form-empresa.tsx` (campos: razão social, CNPJ, cidade)
  - `src/components/loja/student-form.tsx` (campos: nome, email, telefone, CPF)
- **Evidência:** Nenhum dos campos de Input desses componentes possui o atributo `autoComplete`. O login (`login-form.tsx`) e o formulário de contato possuem, mas os formulários de compra de maior impacto não possuem.
- **Impacto:** Usuários com deficiência motora dependem fortemente de autocomplete do browser para preencher formulários. Sem o atributo, o mecanismo não funciona de forma confiável.
- **Recomendação:** Adicionar `autoComplete` nos inputs: `"name"`, `"email"`, `"tel"`, `"given-name"`, `"family-name"`, `"postal-code"`, `"organization"`.
- **Correção:** Simples (atributo em Input).
- **Status:** Recomendado
- **WCAG:** 1.3.5 (AA)
- **Confiança:** Alta

---

### [Alto] Hierarquia de headings quebrada em páginas públicas
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Semântica / Estrutura
- **Arquivos e evidências:**
  - `src/app/(main)/como-funciona/page.tsx:52-59`: `PageHero` renderiza `<h1>` (via `page-hero.tsx:14`), depois os cards usam `<h3>` (linha 52), e o CTA final usa `<h3>` (linha 59) — nenhum `<h2>` intermediário. Salto h1→h3.
  - `src/app/(main)/sobre/page.tsx:39,46`: grid de benefícios usa `<h3>` (linha 39), depois `<h2>` "Nossa história" (linha 46) — heading de nível superior aparece após heading de nível inferior dentro do mesmo `<PageBody>`.
  - `src/app/(main)/contato/page.tsx:40,67,81,95`: cards de contato usam `<h3>` sem nenhum `<h2>` pai (a página só tem o `<h1>` do `PageHero`). Salto h1→h3.
  - `src/app/(main)/certificado/page.tsx:44,51`: mesmo padrão — `<h3>` em cards e `<h2>` "Acessar meu certificado" fora de ordem.
- **Impacto:** Leitores de tela navegam por headings (`H`). Saltos h1→h3 quebram o mapa de documento; usuários cegos não conseguem navegar eficientemente.
- **Recomendação:** Ajustar hierarquia: cards dentro de `PageBody` devem usar `<h2>` para títulos de seção e `<h3>` para sub-itens. CTA banners como subsections devem usar `<h2>`.
- **Correção:** Simples (trocar tag).
- **Status:** Recomendado
- **WCAG:** 1.3.1 (A), 2.4.6 (AA)
- **Confiança:** Alta

---

### [Médio] Menu mobile sem landmark `<nav>`
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Landmarks / Semântica
- **Arquivo:** `src/components/shared/layouts/navbar-main.tsx:221-273`
- **Trecho:** `{mobileOpen && (<div className="lg:hidden border-t …">…links…</div>)}`
- **Evidência:** O menu desktop tem `<nav className="hidden lg:flex …">` (linha 186), mas o menu mobile expandido é apenas uma `<div>` sem `role="navigation"` ou `<nav>`. O `aria-expanded` no botão de hambúrguer está correto (linha 213), mas o conteúdo expandido não é identificável como região de navegação.
- **Impacto:** Usuários de AT que navegam por landmarks não encontram a navegação mobile.
- **Recomendação:** Envolver o conteúdo mobile em `<nav aria-label="Menu mobile">`.
- **Correção:** Simples.
- **Status:** Recomendado
- **WCAG:** 2.4.1 (A), 1.3.6 (AAA)
- **Confiança:** Alta

---

### [Médio] Botão de método de pagamento sem `aria-pressed`
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Estados / ARIA
- **Arquivo:** `src/components/loja/pmb-checkout-form.tsx:635-660`
- **Trecho:** `<button type="button" onClick={onClick} className={…active ? "border-[var(…)]" : …}>` — sem `aria-pressed={active}`.
- **Evidência:** O `MethodButton` (PIX / Boleto / Cartão) altera visualmente o estado ativo mas não expõe o estado selecionado via ARIA. O componente é usado como toggle exclusivo (radio behavior) mas sem `role="radio"` + `aria-checked`, nem `aria-pressed`.
- **Impacto:** Usuário de leitor de tela não sabe qual método de pagamento está selecionado.
- **Recomendação:** Adicionar `aria-pressed={active}` para o comportamento toggle, ou reescrever como `role="radiogroup"` + `role="radio"` + `aria-checked`.
- **Correção:** Simples (atributo).
- **Status:** Recomendado
- **WCAG:** 4.1.2 (A)
- **Confiança:** Alta

---

### [Médio] Breadcrumb sem `aria-current="page"` e separador sem `aria-hidden`
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Semântica
- **Arquivo:** `src/components/loja/breadcrumb.tsx:18-32`
- **Evidência:** Último item do breadcrumb renderiza `<span className="font-medium …">{item.label}</span>` sem `aria-current="page"`. O ícone `<ChevronRight>` em cada item separador não tem `aria-hidden="true"`.
- **Impacto:** AT anuncia o separador como conteúdo; não identifica o item atual.
- **Recomendação:** Adicionar `aria-current="page"` no span do último item. Adicionar `aria-hidden="true"` no `ChevronRight`.
- **Correção:** Simples.
- **Status:** Recomendado
- **WCAG:** 2.4.8 (AAA), 1.1.1 (A para ícone)
- **Confiança:** Alta

---

### [Médio] Links do slideshow com `aria-label` baseado em URL
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Links / Texto Acessível
- **Arquivo:** `src/components/main/home/hero-slides.tsx:64`
- **Trecho:** `<Link href={slide.linkUrl} aria-label={\`Ir para ${slide.linkUrl}\`}>`
- **Evidência:** O `aria-label` usa a URL bruta (ex.: `/cursos/marketing-digital`) como texto acessível para o link que envolve a imagem do slide. URLs não são textos descritivos.
- **Impacto:** Leitor de tela anuncia "Ir para /cursos/marketing-digital" sem contexto do que é o curso ou campanha.
- **Recomendação:** Adicionar campo `title` ou `altText` no tipo `HeroSlide` e usar como `aria-label`.
- **Correção:** Estrutural leve (adicionar campo de dados).
- **Status:** Recomendado
- **WCAG:** 2.4.4 (A), 2.4.6 (AA)
- **Confiança:** Alta

---

### [Médio] Ausência de skip link ("Pular para o conteúdo")
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Navegação por Teclado
- **Arquivos:** `src/app/(main)/layout.tsx`, `src/app/loja/layout.tsx`, `src/app/layout.tsx`
- **Evidência:** Busca por "skip" em todos os layouts e navbar retornou zero ocorrências. Há `<main>` com `id` ausente em vários layouts.
- **Impacto:** Usuários de teclado e AT precisam tabular por todos os itens do navbar (logo + busca + categorias + links + botão CTA + hambúrguer) antes de alcançar o conteúdo principal em cada navegação.
- **Recomendação:** Adicionar no topo do `RootLayout` (ou de cada layout com navbar): `<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 …">Pular para o conteúdo</a>` e `id="main-content"` no `<main>`.
- **Correção:** Simples.
- **Status:** Recomendado
- **WCAG:** 2.4.1 (A)
- **Confiança:** Alta

---

### [Médio] Erros de campo sem `aria-describedby` ligando input à mensagem de erro
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Formulários / ARIA
- **Arquivos:**
  - `src/components/main/checkout-form-pessoal.tsx:65` (`errors.nome` → `<p>` sem id)
  - `src/components/loja/student-form.tsx:156-158` (idem)
  - `src/components/main/formulario-interesse.tsx:180-183` (`aria-invalid` presente, mas sem `aria-describedby`)
- **Evidência:** Mensagem de erro renderizada como `<p className="mt-1 text-xs text-red-600">{errors.nome}</p>` após o input mas sem `id` no `<p>` e sem `aria-describedby` no `<Input>`. `aria-invalid` está presente em `formulario-interesse` mas não nos outros formulários.
- **Impacto:** AT anuncia o campo como inválido (quando `aria-invalid` existe) mas não lê a mensagem de erro específica automaticamente; o usuário precisa navegar manualmente até o parágrafo.
- **Recomendação:** Padrão: `<Input id="nome" aria-invalid={!!errors.nome} aria-describedby={errors.nome ? "nome-error" : undefined} />` + `<p id="nome-error" role="alert">…</p>`.
- **Correção:** Médio (refatorar todos os campos nos 3+ formulários afetados).
- **Status:** Recomendado
- **WCAG:** 3.3.1 (A), 3.3.3 (AA), 4.1.2 (A)
- **Confiança:** Alta

---

### [Médio] `<Label>` sem `htmlFor` em campos de PIX e Boleto
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Formulários
- **Arquivo:** `src/components/loja/pmb-checkout-form.tsx:715, 775`
- **Trecho:** `<Label>Código PIX copia e cola</Label>` e `<Label>Linha digitável</Label>` — sem `htmlFor`.
- **Evidência:** Os `<Input>` subsequentes não têm `id`. Consequentemente o label não está associado programaticamente ao campo.
- **Impacto:** Leitor de tela não anuncia o label ao focar o input de código PIX ou linha digitável.
- **Recomendação:** Adicionar `id="pix-payload"` no Input e `htmlFor="pix-payload"` no Label (idem boleto).
- **Correção:** Simples.
- **Status:** Recomendado
- **WCAG:** 1.3.1 (A), 4.1.2 (A)
- **Confiança:** Alta

---

### [Médio] Checkbox "Lembrar-me" sem atributo `name`
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Formulários
- **Arquivo:** `src/components/auth/login-form.tsx:152-156`
- **Trecho:** `<input type="checkbox" className="…" />` — sem `name`, `id`, nem `value`.
- **Evidência:** O checkbox está funcionalmente decorativo (não enviado ao servidor, sem handler), mas ocupa tab stop e é anunciado pelo AT como "caixa de seleção, desmarcado" sem nome.
- **Impacto:** Leve (o checkbox não tem efeito real ainda), mas confunde AT. Se for implementado, faltará `name`.
- **Recomendação:** Adicionar `id="remember-me"` e usar o `<label>` pai com `htmlFor="remember-me"`. Se não for implementado, remover do DOM até ter funcionalidade.
- **Correção:** Simples.
- **Status:** Recomendado
- **WCAG:** 4.1.2 (A)
- **Confiança:** Alta

---

### [Baixo] Skeleton de loading sem `aria-hidden` ou `role="status"`
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Estados de Loading
- **Arquivo:** `src/components/ui/skeleton.tsx`
- **Trecho:** `<div data-slot="skeleton" className="animate-pulse rounded-md bg-muted" …/>`
- **Evidência:** Skeletons em `src/app/admin/loading.tsx`, `src/app/(main)/loading.tsx`, etc. são renderizados pelo Next.js `loading.tsx` mas o componente não informa AT que é conteúdo de carregamento.
- **Impacto:** AT pode anunciar divs vazias animate-pulse como conteúdo vazio confuso.
- **Recomendação:** Envolver grupo de skeletons em `<div role="status" aria-label="Carregando…">` ou adicionar `aria-hidden="true"` nos elementos individuais + um span `sr-only` com "Carregando".
- **Correção:** Simples.
- **Status:** Recomendado
- **WCAG:** 4.1.3 (AA)
- **Confiança:** Média

---

### [Baixo] `dangerouslySetInnerHTML` com JSON-LD — sem sanitização explícita
- **Agente responsável:** UI/Acessibilidade (cruzar com Segurança)
- **Categoria:** Markup / Segurança
- **Arquivos:**
  - `src/app/(main)/seja-revendedor/page.tsx:42`
  - `src/app/livrecursos/page.tsx:46`
- **Trecho:** `dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}`
- **Evidência:** JSON.stringify de objeto tipado — risco de XSS é baixo pois não há interpolação de dados de usuário visível neste contexto, mas não há sanitização explícita (ex: caracteres `<`, `>`, `&` dentro de strings do schema poderiam ser problemas). Cruzar com agente de segurança.
- **Impacto:** Baixo — dados vêm de constantes ou config server-side. Mas se `faqSchema` passar a incluir dados dinâmicos (ex: perguntas de usuário), há risco.
- **Recomendação:** Usar `JSON.stringify(faqSchema).replace(/</g, '\\u003c')` para escape seguro de caracteres HTML dentro de script tags.
- **Correção:** Simples.
- **Status:** Recomendado
- **WCAG:** N/A (HTML5 security)
- **Confiança:** Média

---

### [Baixo] `aria-hidden` sem valor explícito (shorthand JSX)
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** ARIA
- **Exemplos:** `src/app/aluno/cursos/page.tsx:163`, `src/app/(main)/como-funciona/page.tsx:51`
- **Evidência:** Uso de `aria-hidden` (sem `="true"`) em ícones Lucide. Em JSX, a prop booleana sem valor equivale a `aria-hidden={true}`, o que é correto. Porém o HTML gerado será `aria-hidden=""` em alguns frameworks, que é interpretado como `false` por alguns parsers ARIA antigos.
- **Impacto:** Baixo — React serializa corretamente como `aria-hidden="true"`. Mas vale uniformizar.
- **Recomendação:** Preferir `aria-hidden="true"` explícito para máxima compatibilidade e clareza.
- **Correção:** Simples.
- **Status:** Informativo
- **WCAG:** 1.1.1 (A)
- **Confiança:** Média

---

### [Baixo] Imagem de hero slide com `alt=""` — decorativa, mas sem `aria-hidden` no link wrapper
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Imagens
- **Arquivo:** `src/components/main/home/hero-slides.tsx:50-54`
- **Trecho:** `<img src={slide.mobileUrl} alt="" …/>` dentro de `<Link href={slide.linkUrl} aria-label={…}>`
- **Evidência:** `alt=""` é correto para imagem decorativa. O `aria-label` no Link sobrescreve o nome acessível — OK. Porém quando `slide.linkUrl` é vazio o fallback não tem `aria-label`, e a imagem fica sem descrição.
- **Impacto:** Baixo — depende de dado de configuração (se linkUrl for sempre preenchido quando existe link, está OK).
- **Recomendação:** Confirmar que `HeroSlide.linkUrl` sempre tem texto de destino descritivo; adicionar `aria-label` de fallback.
- **Correção:** Simples.
- **Status:** Informativo
- **WCAG:** 2.4.4 (A)
- **Confiança:** Média

---

### [Baixo] Suspeita de contraste insuficiente — `rgba(2,89,24,0.55)` em branco
- **Agente responsável:** UI/Acessibilidade
- **Categoria:** Contraste
- **Arquivo:** `src/components/shared/layouts/navbar-main.tsx:126, 254`
- **Trecho:** `<span className="text-[11px] text-[rgba(2,89,24,0.55)]">` (contagem de cursos no dropdown) e `<p className="text-[11px] … text-[rgba(2,89,24,0.55)]">` (label de categorias no mobile).
- **Evidência:** Cor efetiva de `rgba(2,89,24,0.55)` sobre `#FFFFFF` ≈ `rgb(116,164,128)`. Luminância relativa ≈ 0.30. Contraste contra branco ≈ 2.5:1. Para texto pequeno (11px bold) WCAG AA exige 4.5:1. **Falha WCAG 1.4.3.**
- **Impacto:** Texto de suporte (contagem de cursos, label "Categorias") ilegível para usuários com baixa visão.
- **Recomendação:** Usar `rgba(2,89,24,0.75)` (contraste ≈ 4.0:1 — borderline) ou `var(--color-pmb-green)` (7.8:1). Confirmar com ferramenta de contraste no browser.
- **Correção:** Simples.
- **Status:** Recomendado
- **WCAG:** 1.4.3 (AA)
- **Confiança:** Média

---

## Itens Positivos (conformidade verificada)

| Item | Arquivo | Nota |
|------|---------|------|
| `<html lang="pt-BR">` | `src/app/layout.tsx:99` | Correto |
| `<main>` em todos os layouts | `(main)/layout.tsx`, `admin/layout-shell.tsx`, `loja/layout.tsx`, `livrecursos/layout.tsx` | Correto |
| `<header>` e `<footer>` semânticos | `navbar-main.tsx:62`, `footer-main.tsx:72` | Correto |
| `<aside>` + `<nav>` no sidebar admin | `sidebar-admin.tsx:79,98` | Correto |
| `aria-label` no botão hambúrguer | `navbar-main.tsx:212` | Correto |
| `aria-expanded` no dropdown Categorias | `navbar-main.tsx:97` | Correto |
| `role="menu"` + `role="menuitem"` no dropdown | `navbar-main.tsx:112,121` | Correto |
| `sr-only` em botão Sair icon-only | `header-dashboard.tsx:68` | Correto |
| `<label htmlFor>` + `<Input id>` padrão | `login-form.tsx`, `checkout-form-pessoal.tsx`, `student-form.tsx` | Correto |
| `aria-label="Breadcrumb"` com `<ol>/<li>` | `loja/breadcrumb.tsx:15` | Correto |
| QR Code PIX com `alt="QR Code PIX"` | `checkout-client.tsx:98`, `pmb-checkout-form.tsx:706` | Correto |
| Dialog base-ui (focus trap nativo) | `components/ui/dialog.tsx` | Base-UI gerencia focus trap |
| Tabs base-ui (role=tablist/tab/tabpanel) | `components/ui/tabs.tsx` | Base-UI gerencia ARIA |
| `autoComplete` em login | `login-form.tsx:121,146` | Correto |
| Icons decorativos com `aria-hidden` | Múltiplos arquivos | Majoritariamente correto |
| `role="search"` no form da navbar | `navbar-main.tsx:166` | Correto |
| `<label htmlFor="navbar-search">` sr-only | `navbar-main.tsx:170` | Correto |
| `<nav aria-label="Breadcrumb">` | `loja/breadcrumb.tsx:15` | Correto |
| Viewport `maximumScale=5` (não trava zoom) | `layout.tsx:88` | Correto |

---

## Top 5 Problemas Prioritários

1. **Foco invisível em checkout/contato** (WCAG 2.4.11 Alto) — afeta todos os usuários de teclado nos fluxos de pagamento mais críticos.
2. **Erros sem `role="alert"`** (WCAG 4.1.3 Alto) — erros de login e compra não são anunciados por AT; usuário cego não recebe feedback de falha.
3. **Formulários de compra sem `autocomplete`** (WCAG 1.3.5 Alto) — impede auto-preenchimento para usuários com deficiência motora nos formulários de maior conversão.
4. **Hierarquia de headings h1→h3** (WCAG 1.3.1 Alto) — múltiplas páginas públicas com estrutura de documento quebrada, impactando navegação por leitores de tela.
5. **Slideshow sem pausa** (WCAG 2.2.2 Alto) — conteúdo em movimento automático sem controle de pausa na homepage.
