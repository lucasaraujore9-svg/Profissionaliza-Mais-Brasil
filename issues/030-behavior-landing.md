# Issue 030 — Landing Page Behavior

**Tipo:** behavior
**Página:** /
**Depende de:** 001, 020
**Prioridade:** P1

## O Que Fazer

Implementar comportamentos dinâmicos landing page: carregar métricas reais do banco, links navegáveis, CTAs funcionais. Sem autenticação requerida.

## Componentes Envolvidos
- Landing page (/) com todos componentes do 001
- API route GET /api/metrics/public — retorna números reais (revendedores, cursos, alunos, receita)
- Links navegação: "Seja Revendedor" → /seja-revendedor, "Login" → /login
- CTA "Começar Agora" → /seja-revendedor/checkout

## Comportamentos
- `view-landing` — carregar landing com metrics reais
- `load-public-metrics` — GET /api/metrics/public (Prisma aggregate queries)
- `click-seja-revendedor` — navegar para /seja-revendedor
- `click-login` — navegar para /login
- `click-cta-checkout` — navegar para /seja-revendedor/checkout

## Critério de Aceite
- [ ] GET /api/metrics/public implementado
- [ ] Query Prisma conta revendedores ativos
- [ ] Query Prisma conta cursos totais
- [ ] Query Prisma conta alunos totais
- [ ] Query Prisma soma receita (soma de payments aprovados)
- [ ] Landing renderiza com números reais em NumerosBento
- [ ] Link "Seja Revendedor" funciona → /seja-revendedor
- [ ] Link "Login" funciona → /login
- [ ] CTA "Começar Agora" funciona → /seja-revendedor/checkout
- [ ] Página ainda renderiza se DB indisponível (com dados fallback)
- [ ] Sem console errors
