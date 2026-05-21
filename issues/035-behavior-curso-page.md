# Issue 035 — Página do Curso: Detalhes + Cupom + Matricular

**Tipo:** behavior
**Página:** /loja/curso/[slug]
**Depende de:** 006, 024
**Prioridade:** P1

## O Que Fazer

Implementar página curso com dados reais: carregar curso DB + lições API da plataforma, aplicar cupom desconto, calcular preço final, botão "Matricular-se" redireciona checkout.

## Componentes Envolvidos
- GET /api/loja/cursos/[slug] — carregar curso do tenant
- GET plataforma cursos/listar — listar lições/módulos
- POST /api/loja/cupom/validar — validar e calcular desconto
- CourseHero, CourseDescription, LessonAccordion com dados reais
- StickyCTA "Matricular-se" → /loja/checkout

## Comportamentos
- `load-course` — GET /api/loja/cursos/[slug]
- `load-lessons-from-ea` — GET plataforma cursos/listar para idcurso
- `apply-coupon` — POST /api/loja/cupom/validar { code, course_id }
- `remove-coupon` — remover cupom aplicado
- `calculate-final-price` — preço - desconto cupom
- `click-matricular` — navegar /loja/checkout com course_id

## Critério de Aceite
- [ ] GET /api/loja/cursos/[slug] implementado
- [ ] Middleware resolve tenant_id
- [ ] Query Prisma WHERE tenant_id E slug = params.slug
- [ ] Retorna { id, title, description, price, image, category }
- [ ] GET plataforma cursos/listar usando lib/plataforma-cursos client
- [ ] LessonAccordion renderiza com módulos/aulas de verdade
- [ ] POST /api/loja/cupom/validar implementado
- [ ] Zod schema validar { code, course_id, tenant_id }
- [ ] Query Coupon WHERE code E tenant_id E ativo
- [ ] Validar datas validade cupom
- [ ] Retorna { valid, discount_value, discount_percent }
- [ ] PriceDisplay atualiza com preço final (price - discount)
- [ ] Botão "Matricular-se" navega /loja/checkout?course_id=X
