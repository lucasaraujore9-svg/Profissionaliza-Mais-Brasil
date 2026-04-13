# Issue 034 — Vitrine: Catálogo + Busca + Filtros

**Tipo:** behavior
**Página:** /loja
**Depende de:** 005, 020, 021
**Prioridade:** P1

## O Que Fazer

Implementar comportamentos vitrine: carregar catálogo cursos do revendedor, filtrar por categoria, buscar por título, todas queries filtradas por tenant_id.

## Componentes Envolvidos
- CourseGrid (do proto 005) com dados reais
- GET /api/loja/courses — listar cursos do tenant
- CategoryPills com filtro real
- Search bar com filtro real

## Comportamentos
- `load-catalog` — GET /api/loja/courses filtrado por tenant_id
- `filter-by-category` — GET /api/loja/courses?category=X
- `search-courses` — GET /api/loja/courses?search=X
- `pagination` — implementar limit/offset se muitos cursos
- `visible-only` — mostrar só cursos com visibility=true

## Critério de Aceite
- [ ] GET /api/loja/courses implementado
- [ ] Middleware fornece tenant_id em request context
- [ ] Query Prisma WHERE tenant_id = context.tenant_id
- [ ] Query WHERE visibility = true
- [ ] Retorna array de courses com { id, title, price, image, category }
- [ ] CategoryPills com click filtra courses real
- [ ] Search input filtra courses por title
- [ ] URL params sync (?category=X&search=Y)
- [ ] CourseGrid atualiza em tempo real com filtros
- [ ] Sem console errors
- [ ] Pagination se >20 cursos (limit 20 por padrão)
