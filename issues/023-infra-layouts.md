# Issue 023 — Layouts (Auth, Main, Admin, Painel, Loja)

**Tipo:** infra
**Página:** global
**Depende de:** 022
**Prioridade:** P0

## O Que Fazer

Criar layouts Next.js App Router para cada seção. Layout (auth) para login/reset, (main) para landing/seja-revendedor, admin layout com SidebarAdmin, painel layout com SidebarPainel, loja layout com NavbarLoja+FooterLoja.

## Componentes Envolvidos
- app/(auth)/layout.tsx — layout login/reset (sem navbar, centered)
- app/(main)/layout.tsx — layout landing (NavbarMain, FooterMain)
- app/admin/layout.tsx — layout admin (SidebarAdmin + main content)
- app/painel/layout.tsx — layout revendedor (SidebarPainel + main content)
- app/loja/layout.tsx — layout vitrine (NavbarLoja, FooterLoja)
- components/shared/layouts/ — layout components reutilizáveis

## Comportamentos
- `render-auth-layout` — (auth) layout sem navbar
- `render-main-layout` — (main) layout com navbar principal
- `render-admin-layout` — admin layout com sidebar
- `render-painel-layout` — painel layout com sidebar
- `render-loja-layout` — loja layout com navbar customizada

## Critério de Aceite
- [ ] app/(auth)/layout.tsx criado
- [ ] app/(main)/layout.tsx criado com NavbarMain
- [ ] app/admin/layout.tsx criado com SidebarAdmin
- [ ] app/painel/layout.tsx criado com SidebarPainel
- [ ] app/loja/layout.tsx criado com NavbarLoja
- [ ] (auth) layout centralizado, sem navbar
- [ ] (main) layout renderiza NavbarMain em todas páginas
- [ ] admin layout sidebar esquerda + main conteúdo direita
- [ ] painel layout sidebar esquerda + main conteúdo direita
- [ ] loja layout navbar topo + footer rodapé
- [ ] Metadata correto para SEO (title, description)
- [ ] Responsive em mobile/tablet/desktop
