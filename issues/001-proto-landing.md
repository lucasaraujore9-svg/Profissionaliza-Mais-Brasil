# Issue 001 — Landing Page Prototype

**Tipo:** proto
**Página:** /
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar a página de landing (/) com todos os componentes de UI renderizados com dados hardcoded. Foco em design system, responsividade e visual clean.

## Componentes Envolvidos
- NavbarMain — navegação com logo, links (Landing, Seja Revendedor, Login)
- HeroSection — headline, subheadline, CTA "Seja Revendedor", imagem destaque
- ComoFunciona — 3 steps com ícones (Cadastra, Vende, Ganha)
- NumerosBento — 4 cards com métricas (Revendedores, Cursos, Alunos, Receita)
- CatalogoPreview — grid 3 cursos com imagem, título, preço
- PlanosSection — 3 cards de planos (Starter, Growth, Enterprise)
- DepoimentosSection — 3 depoimentos com avatar, nome, citação
- FooterMain — links footer, copyright, redes sociais

## Comportamentos
- `render-landing` — exibir todos os componentes
- `responsive-mobile-tablet-desktop` — testar em 3 breakpoints
- `design-system-colors` — usar cores do Tailwind/shadcn definidas no blueprint

## Critério de Aceite
- [ ] Navbar renderiza com logo e links navegáveis (links não precisam funcionar ainda)
- [ ] HeroSection exibida com tipografia correta (H1, H2) e imagem placeholder
- [ ] ComoFunciona mostra 3 steps com ícones
- [ ] NumerosBento exibe 4 cards com números hardcoded
- [ ] CatalogoPreview mostra 3 cursos com imagem, título, preço
- [ ] PlanosSection exibe 3 cards com features e preços
- [ ] DepoimentosSection mostra 3 depoimentos
- [ ] FooterMain renderiza com links e copyright
- [ ] Layout é responsivo em mobile (320px), tablet (768px), desktop (1024px+)
- [ ] Cores seguem design system (primary, secondary, accent)
- [ ] Tipografia usa fontes corretas (Inter ou definida no blueprint)
- [ ] Não há console errors
