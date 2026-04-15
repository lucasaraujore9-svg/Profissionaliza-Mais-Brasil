# Issue 056 — Redesign Vitrine/Loja (Fase 2A)

**Tipo:** design
**Escopo:** `src/app/loja/*` + `src/components/loja/*`
**Depende de:** 055 (tokens globais aplicados)
**Prioridade:** P1

## Objetivo

Alinhar a vitrine publica de cada revendedor com a identidade da home: mesmo tom povao, mesma paleta, mesma densidade de preco/certificado/garantia. Lembrar que cada revendedor tem configuracao propria (cor de destaque, logo, banner) — o design system precisa acomodar essa personalizacao sem perder a identidade PMB.

## Paginas Alvo

### `loja/page.tsx` — Vitrine home do revendedor
- Hero banner (HeroBanner-style) com titulo/subtitulo customizavel pelo revendedor, CTA "Ver cursos"
- TrustBar (selos identicos a home)
- CategoryPills alinhado com CategoriesGrid mini
- FeaturedSection usando CourseRow + CourseCard padronizado

### `loja/curso/[slug]/page.tsx` — Detalhe do curso
- CourseHero com thumb grande (CourseThumb-style), preco grande, badges
- LessonAccordion alinhado com paleta
- PriceDisplay + StickyCta em ouro
- Breadcrumb verde-escuro

### `loja/checkout/page.tsx` + `confirmacao/page.tsx`
- StudentForm em card branco
- OrderSummary lateral fixo com paleta verde + preco destaque
- PaymentInfo com selos de confianca (Pix, cartao, garantia)
- ConfirmationCard com SuccessIcon em lime + proximos passos claros

## Componentes a Ajustar

| Componente | Ajuste |
|------------|--------|
| `loja/course-card.tsx` | Adotar estilo de `main/home/course-card.tsx` (thumb SVG, badge selos, preco grande) |
| `loja/course-grid.tsx` | Grid 2/3/5 cols responsivo igual a home |
| `loja/hero-banner.tsx` | Verde-escuro com gradiente + chips + trust checklist |
| `loja/category-pills.tsx` | Pills arredondados com hover lime |
| `loja/course-hero.tsx` | Thumb hero gigante + preco em destaque + parcelamento |
| `loja/price-display.tsx` | Preco grande + riscado + parcelas 12x + selo "10% no Pix" |
| `loja/sticky-cta.tsx` | Botao ouro fixo no bottom mobile |
| `loja/confirmation-card.tsx` | Mensagem acolhedora tom povao + CTA acesso ao curso |

## Personalizacao por Tenant

- Respeitar `tenant.cor_principal` quando definido, caindo pra `--color-pmb-green` como default
- Logo do revendedor no navbar-loja (ja existente)
- Nome da escola em vez de "Profissionaliza Mais Brasil"

## Criterios de Aceite

- [ ] Vitrine com paleta PMB por default, personalizavel por tenant
- [ ] Cards de curso com mesmo padrao da home
- [ ] Checkout e confirmacao com identidade consistente
- [ ] Mobile responsivo (80% do trafego)
- [ ] Selos de confianca (Pix, certificado, garantia, WhatsApp) presentes em todas as paginas
- [ ] `npm run build` verde
