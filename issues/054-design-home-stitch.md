# Issue 054 — Home Page Premium via Google Stitch

**Tipo:** design + integration
**Página:** `/` (landing publica, rota `src/app/(main)/page.tsx`)
**Depende de:** 001 (proto landing), 023 (layouts), 030 (behavior landing)
**Prioridade:** P1

## O Que Fazer

Redesenhar a home page publica com direcao premium editorial via Google Stitch (MCP) e implantar em Next.js. O alvo e converter **futuros revendedores** (empreendedores interessados em abrir uma escola profissionalizante online sem infraestrutura propria).

Proposta de valor central: "Monte sua escola profissionalizante online em minutos, sem mexer em nenhum curso — a gente cuida da plataforma, voce vende e lucra."

## Calibracao Aprovada

### Dials
- Criatividade: **9** (editorial, assimetrico, personalidade)
- Densidade: **5** (informacao suficiente pra converter, sem cockpit)
- Variancia: **8** (cada secao com identidade propria)
- Motion Intent: **6** (hover + entrance reveals, sem coreografia)

### Palette (5 cores brasileiras — nao virar bandeira obvia)
| Cor | Hex | Papel sugerido |
|-----|-----|----------------|
| Verde escuro | `#025918` | Ink/navy dominante |
| Amarelo ouro | `#F2B705` | CTA primario (alta conversao) |
| Cyan | `#07B2D9` | Acento secundario (links, highlights) |
| Verde-limao | `#C0D904` | Sucesso / detalhes pontuais |
| Terracota | `#8C3A27` | Texto editorial secundario |
| Off-white | `#FAFAF7` | Canvas (nao esta na palette, neutro de fundo) |

**Restricao editorial:** palette inteira NUNCA na mesma secao. Dominante verde-escuro + acento ouro + cyan pontual. Terracota e verde-limao em pontos editoriais isolados.

### Tipografia
- Display: **Fraunces** (serif editorial, pesos 500-700, com variable axis `opsz`)
- Body/UI: **Geist** (400/500)
- Mono: **Geist Mono** (numeros e metadata)

### Estrutura aprovada (8 secoes)

1. **Hero split-assimetrico** — headline Fraunces gigante a esquerda, mockup angulado (laptop vitrine + celular painel) a direita. CTA primario ouro + link secundario sublinhado.
2. **Strip de social proof** — numeros em Geist Mono, formato `[X] revendedores ativos · [Y] cursos · [Z] alunos` com placeholders (sem inventar dados).
3. **Como funciona** em **zig-zag vertical** (nao cards lado a lado) — 4 passos alternando lado: 1) Cadastre-se, 2) Configure sua vitrine, 3) Conecte MP e vendedor, 4) Venda e lucre.
4. **Bento grid assimetrico** de 5-6 diferenciais: "Zero estoque/logistica", "Seu dominio proprio", "MP integrado nativamente", "Cursos prontos certificaveis", "Suporte PT-BR".
5. **Depoimento unico em destaque** — quote grande Fraunces + foto + nome/cidade/nicho. Strip de 3-4 avatares menores abaixo com quotes curtos.
6. **FAQ colapsavel** — 5 perguntas (custo, complexidade tecnica, como recebe, dominio, cancelamento).
7. **CTA final editorial** — sem card, bloco de texto grande + botao + disclaimer mono.
8. **Footer institucional denso** — links, CNPJ placeholder, redes, selo seguranca.

### Identidade / Logo
- Logo final: **icone + nome** "Profissionaliza Mais Brasil"
- Arquivo fisico: `/public/images/logo.png`
- Implementacao: `<Image src="/images/logo.png" ... />` + span com wordmark

## Pre-requisitos (Infra)

- [x] MCP do Stitch configurado em `~/.claude/mcp.json` com chave `AQ.Ab8RN6Jh9kSKnEa_SsvLlkcMCY4E2PnbTd1xEfuHKbEZDD_qlA`
- [ ] Claude Code reiniciado para carregar o MCP do Stitch
- [ ] Agente `stitch-designer` invocado com contexto desta issue

## Fluxo de Execucao

1. **Gerar no Stitch** — criar projeto + screen "home" com a calibracao acima via `mcp__stitch__create_project` + `mcp__stitch__generate_screen_from_text`.
2. **Validar visualmente** — retornar `project_id`, `screen_id`, URL de visualizacao e screenshot para aprovacao do usuario. **NAO IMPLANTAR** sem aprovacao explicita.
3. **Implantar em React/Next** apos aprovacao:
   - `src/app/(main)/page.tsx` — compor a home com os componentes de secao
   - `src/components/main/home/hero.tsx`
   - `src/components/main/home/social-proof.tsx`
   - `src/components/main/home/como-funciona.tsx`
   - `src/components/main/home/bento-diferenciais.tsx`
   - `src/components/main/home/depoimentos.tsx`
   - `src/components/main/home/faq.tsx`
   - `src/components/main/home/cta-final.tsx`
   - Reusar `src/components/shared/layouts/navbar-main.tsx` e `footer-main.tsx`
4. **Tokens no Tailwind** — adicionar as 5 cores da palette BR como CSS variables em `src/app/globals.css` ou `tailwind.config.ts`:
   - `--pmb-green-dark: #025918`
   - `--pmb-gold: #F2B705`
   - `--pmb-cyan: #07B2D9`
   - `--pmb-lime: #C0D904`
   - `--pmb-terracotta: #8C3A27`
   - `--pmb-canvas: #FAFAF7`
5. **Fontes** — adicionar `next/font/google` para Fraunces + Geist no `src/app/layout.tsx` (Geist ja deve estar presente).
6. **Acessibilidade** — contraste AA minimo no texto principal, alt em imagens, heading hierarchy correto.
7. **Responsividade** — mobile-first, testar 360/768/1280.

## Comportamentos

- `view-home-landing` — renderiza home publica no `profissionalizamaisbrasil.com.br`
- `cta-seja-revendedor-primary` — botao ouro no hero navega para `/seja-revendedor`
- `cta-seja-revendedor-footer` — CTA editorial final idem
- `faq-toggle` — abre/fecha items do FAQ (client component, accordion shadcn)
- `smooth-scroll-anchors` — links internos tipo "como funciona" ancoram nas secoes

## Criterio de Aceite

- [ ] Projeto criado no Stitch com calibracao acima (palette BR, Fraunces+Geist, 8 secoes)
- [ ] Screen "home" gerada e aprovada pelo usuario
- [ ] `project_id` e `screen_id` registrados nesta issue
- [ ] `src/app/(main)/page.tsx` recriado com as secoes importadas
- [ ] Componentes modulares em `src/components/main/home/*.tsx`
- [ ] Tokens da palette BR adicionados ao CSS
- [ ] Fraunces carregada via `next/font/google`
- [ ] CTA primario ouro navega para `/seja-revendedor`
- [ ] FAQ funcional (accordion)
- [ ] Logo `/public/images/logo.png` aparece no header e footer
- [ ] Responsivo em 360/768/1280
- [ ] `npm run build` verde
- [ ] Lighthouse mobile >= 85 em Performance/Accessibility
- [ ] Nenhuma das 5 cores aparece em mais de 60% da area total da pagina (balanco editorial)

## Referencias

- `docs/design/STITCH-DESIGN-PLAN.md` — plano geral de design do projeto
- `docs/references/design-system.md` — tipografia, spacing, shadcn
- Issue 001 (proto landing) — UI original que esta sendo substituida
- Issue 030 (behavior landing) — form de captura de lead, manter compatibilidade
