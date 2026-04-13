# Issue 006 — Página do Curso Prototype

**Tipo:** proto
**Página:** /loja/curso/[slug]
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de detalhes do curso. Componentes: hero com imagem e preço, descrição, accordion de módulos, stats, CTA sticky. Dados hardcoded, layout clean.

## Componentes Envolvidos
- Breadcrumb — navegação "Cursos > Categoria > Título Curso"
- CourseHero — imagem grande curso, headline, subheadline
- PriceDisplay — preço destaque, "Parcelado em 3x"
- CouponField — input cupom desconto com botão "Aplicar"
- CourseDescription — descrição longa do curso
- LessonAccordion — 5 módulos com 3 aulas cada (expandível)
- CourseStats — cards: Horas, Módulos, Alunos, Certificado
- StickyCTA — botão "Matricular-se" fixo no footer (desktop), flutuante (mobile)

## Comportamentos
- `render-course-page` — exibir layout completo
- `expand-module` — clicar em módulo expande aulas
- `apply-coupon-mock` — campo cupom aceitável mas sem validação
- `scroll-sticky-cta` — CTA segue ao scroll

## Critério de Aceite
- [ ] Breadcrumb navegável (links não funcionam)
- [ ] CourseHero com imagem e headline
- [ ] PriceDisplay mostra preço hardcoded e opção de parcelamento
- [ ] CouponField com input e botão Aplicar
- [ ] CourseDescription com texto lorem ipsum
- [ ] LessonAccordion com 5 módulos, todos fechados inicialmente
- [ ] Clicar módulo abre aulas dentro dele
- [ ] CourseStats mostra 4 cards com números
- [ ] StickyCTA visível no footer/flutuante
- [ ] Layout responsivo
- [ ] Tipografia clara e legível
