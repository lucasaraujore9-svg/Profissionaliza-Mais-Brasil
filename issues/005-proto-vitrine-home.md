# Issue 005 — Homepage Vitrine Prototype

**Tipo:** proto
**Página:** /loja
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar homepage da vitrine do revendedor (/loja). Componentes: navbar, hero banner, category pills, course grid com cards, featured section, footer. Dados hardcoded.

## Componentes Envolvidos
- NavbarLoja — logo customizado, search bar, cart icon, user menu
- HeroBanner — imagem de destaque customizada por revendedor
- CategoryPills — 5 categorias clicáveis (filtro visual)
- CourseGrid — grid 6 cursos
- CourseCard — imagem, título, preço, rating, botão "Ver Mais"
- FeaturedSection — seção "Cursos em Destaque" com 3 cards diferentes
- FooterLoja — footer com links, copyright

## Comportamentos
- `render-vitrine` — exibir todos componentes
- `click-category-pill` — marca como ativo visualmente (sem filtro real)
- `hover-course-card` — efeito hover com sombra/elevação
- `responsive-grid` — grid ajusta para mobile/tablet/desktop

## Critério de Aceite
- [ ] NavbarLoja renderiza com logo, search, cart, user menu
- [ ] HeroBanner exibida no topo com imagem placeholder
- [ ] CategoryPills mostra 5 categorias, primeira selecionada por padrão
- [ ] CourseGrid exibe 6 CourseCards em grid responsivo
- [ ] CourseCard tem imagem, título, preço, rating (⭐⭐⭐⭐⭐)
- [ ] Botão "Ver Mais" em cada card clicável
- [ ] FeaturedSection com 3 cards em layout diferente
- [ ] FooterLoja renderizada no final
- [ ] Layout responsivo mobile (1 col), tablet (2 col), desktop (3 col)
- [ ] Hover effects funcionam
