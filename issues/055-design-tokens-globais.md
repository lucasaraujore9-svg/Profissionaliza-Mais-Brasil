# Issue 055 — Tokens Globais + Layouts Compartilhados (Fase 1)

**Tipo:** design
**Escopo:** `src/app/globals.css` + `src/components/shared/layouts/*` + `src/app/(auth)/*`
**Depende de:** 054 (home aprovada como referencia)
**Prioridade:** P0

## Objetivo

Propagar a identidade visual da home nova (paleta PMB + DM Sans + logo oficial) para 100% do app via tokens globais + layouts compartilhados. Esta fase sozinha ja impacta ~80% das telas porque todo shadcn/ui consome os tokens.

## Referencia de Identidade

| Elemento | Valor |
|----------|-------|
| Primary | `var(--color-pmb-green)` `#025918` |
| Accent/CTA | `var(--color-pmb-gold)` `#F2B705` |
| Links/info | `var(--color-pmb-cyan)` `#07B2D9` |
| Success | `var(--color-pmb-lime)` `#C0D904` |
| Danger editorial | `var(--color-pmb-terracotta)` `#8C3A27` |
| Canvas | `#FFFFFF` (claro) / `var(--color-pmb-mist)` `#F4F4EE` (neutro) |
| Font sans | DM Sans (variable `--font-sans` ja aplicada) |
| Font mono | Geist Mono |
| Radius base | `0.75rem` (consistente com home) |

## Arquivos a Alterar

### 1. `src/app/globals.css`
- Remapear tokens shadcn (`--primary`, `--primary-foreground`, `--ring`, `--accent`, `--accent-foreground`, `--border`, `--input`, `--destructive`, `--muted`, `--muted-foreground`) para valores PMB
- `--chart-1..5` = verde / ouro / cyan / lime / terracotta
- `--sidebar*` = verde-escuro com foreground branco + accent ouro
- Classe utilitaria `.font-display` (opcional) pra headings com tracking apertado

### 2. `src/components/shared/layouts/navbar-loja.tsx`
- Logo oficial (Image `/images/logo.png`)
- Paleta PMB (fundo branco ou verde sutil, CTA ouro)
- Altura consistente com navbar-main (80/92px)

### 3. `src/components/shared/layouts/footer-loja.tsx`
- Fundo verde-escuro, logo em container branco
- Texto "Powered by Profissionaliza Mais Brasil" com estilo

### 4. `src/components/shared/layouts/sidebar-admin.tsx`
- Fundo verde-escuro `var(--color-pmb-green)`
- Item ativo: fundo `var(--color-pmb-lime)` com texto verde-escuro (como badge da home)
- Logo no topo (vertical ou versao compacta)

### 5. `src/components/shared/layouts/sidebar-painel.tsx`
- Mesmo padrao do admin, tonalidade sutilmente diferente (verde-700)
- Indicador de tenant (nome da escola do revendedor)

### 6. `src/components/shared/layouts/header-dashboard.tsx`
- Busca + user menu com estetica PMB (bordas verde-sutil, hover lime-50)

### 7. `src/app/(auth)/login/page.tsx`, `forgot-password`, `reset-password`
- Card branco central sobre fundo verde-escuro com gradiente sutil (igual hero da home)
- Logo oficial centralizada
- CTA gold
- Links em cyan

## Criterios de Aceite

- [ ] Todos os componentes shadcn/ui (Button, Input, Card, Badge, Tabs, etc) ja exibem cores PMB sem alterar os componentes individualmente
- [ ] Navbar loja e navbar main tem altura e logo consistentes
- [ ] Sidebars admin e painel tem visual alinhado (verde-escuro + acento lime)
- [ ] Paginas de auth tem identidade igual a home (fundo verde + CTA ouro)
- [ ] `npm run build` verde
- [ ] Spot check: abrir `/painel`, `/admin`, `/loja`, `/login` e confirmar que nada ficou com cor antiga (azul/cinza shadcn default)

## Fora do Escopo

- Redesenho de heros e cards de pagina (vai na Fase 2/3)
- Mudanca de layout/estrutura das paginas internas
- Refactor de componentes de admin/painel (vai na Fase 3)
