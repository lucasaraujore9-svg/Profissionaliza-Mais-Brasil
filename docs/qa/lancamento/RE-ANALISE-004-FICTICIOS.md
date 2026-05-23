# Re-Analise 004 — Dados Ficticios Remanescentes
**Data:** 2026-05-23

## Sumario
- ~60 arquivos auditados em `src/components/main`, `src/components/loja`, `src/components/shared`, `src/components/admin`, `src/components/painel`, `src/app/**`, `src/lib/catalog`, `src/lib/email/templates`, `public/`
- 8 findings P0 ainda em UI publica
- 1 finding P1 em UI interna (preview de certificado — aceitavel)
- Mock data em `prisma/seed.ts` confirmado como dev-only (esperado)
- PreviewProps em emails: dev-only (anexo, nao vaza)

## P0 — visivel ao publico

| ID | Path:linha | Atual | Sugerido |
|---|---|---|---|
| F-P0-001 | `src/components/main/hero-cta.tsx:6,11,14` | `FALLBACK_CURSOS = 100`; hero diz "mais de 100 cursos" mesmo com DB vazio | Trocar fallback por copy qualitativo ("centenas") ou retornar `null` e ocultar o numero quando `real === 0` |
| F-P0-002 | `src/components/main/home/hero-banner.tsx:46` | `a partir de R$ 47,00` hardcoded | Calcular `min(price)` do catalogo real ou trocar por copy sem valor |
| F-P0-003 | `src/components/main/home/showcase-cards.tsx:48-78` | `FALLBACK` com 3 cursos fakes ("Manicure", "Eletricista", "Confeitaria") + precos R$ 47/97/89 + selos "+ Vendido"/"Novo" — renderiza quando DB vazio | Quando `cards.length !== 3`, retornar `null` ou exibir CTA "Catalogo em curadoria" — nao inventar produtos |
| F-P0-004 | `src/components/main/home/testimonials.tsx:27` | "Milhares de alunos confiam na PMB para aprender uma nova profissao." — copy publica fora do bloco vazio | Reescrever subtitulo neutro ("Em breve, historias de quem ja faz parte da nossa rede.") |
| F-P0-005 | `src/components/loja/course-grid.tsx:40` | `rating: 4.8` hardcoded em todo curso (renderiza estrela em `loja/course-card.tsx:43-44`) | Componente sem consumidor — remover `loja/course-grid.tsx`, `loja/course-card.tsx`, `loja/course-hero.tsx` (dead code); ou tornar `rating` opcional e esconder quando ausente |
| F-P0-006 | `src/lib/catalog/home.ts:39,332` e `src/app/loja/page.tsx:31-32` | `rating: "4.9"` e `instrutor: "Equipe PMB"` em TODOS os cursos | Campos sao dead (nao renderizados em `main/home/course-card.tsx`), porem ainda viajam no tipo `Course`. Remover ambos do tipo + dos `toCourse()` para evitar regressao futura |
| F-P0-007 | `src/components/shared/layouts/navbar-main.tsx:9-15` | `FALLBACK_CATEGORIAS` (5 categorias inventadas com slug fixo) renderiza quando DB nao retorna categorias | Quando `categorias.length === 0`, ocultar menu de categorias na navbar em vez de mostrar fakes |
| F-P0-008 | `src/components/main/manifesto-fundador.tsx:113` | Citacao atribuida a "Leonardo V. \| Idealizador do GBMB" — depoimento real? Validar autoria com cliente | Confirmar identidade real do idealizador antes do go-live |

## P1 — visivel a admin/revendedor logado

| ID | Path:linha | Atual | Sugerido |
|---|---|---|---|
| F-P1-001 | `src/components/painel/certificate-template-editor.tsx:493-503` | Preview sample com `nome: "Maria da Silva"`, `cpf: "123.456.789-00"`, `codigo: "EXEMPLO-12345"`, `unidade: "Sua Escola"` | Aceitavel — eh preview de wireframe explicito ("sample"), nunca vai pro PDF final. Manter |

## Limpos (verificados, OK)

- `src/components/main/numeros-bento.tsx` — fallback retorna `—`, nao numeros
- `src/components/main/depoimentos-section.tsx` — arrays vazios (`featured = null`, `secundarios = []`)
- `src/components/main/home/testimonials.tsx` — `DEPOIMENTOS = []` (so falta arrumar subtitulo, F-P0-004)
- `src/app/(main)/sobre/page.tsx` — sem numeros inflados ("milhares" agora qualitativo)
- `src/components/main/hero-cta.tsx` — proof strip qualitativo (so o FALLBACK_CURSOS sobrou)
- `src/components/main/autoridade-pmb.tsx` — CNPJ real do GBMB, "10 anos" verificado
- `src/components/main/hero-mockup.tsx` — "Escola Maria" comentado como mockup intencional
- `src/components/shared/course-detail-view.tsx` — sem estrelas 4.9
- `public/` — apenas `logo.png`, sem avatares ou capas fakes
- `prisma/seed.ts` — dev fixtures, comportamento esperado

## Dead code identificado (recomenda remover)

- `src/components/loja/course-grid.tsx` + `course-card.tsx` + `course-hero.tsx` — sem importadores em `src/app/**`
- `src/components/main/anim/count-up.tsx` — sem consumidores

## Anexo: PreviewProps de email templates (apenas dev)

Sao parametros do React Email para preview no Storybook/dev — nao chegam ao remetente final. Manter:

- `enrollment.tsx`: Beatriz Souza
- `invite.tsx`: Ana Costa, "Lucas Araujo"
- `payment.tsx`: Maria Silva, "Plano Starter" (inconsistencia leve com `Plano Profissionaliza`)
- `reseller-onboarding.tsx`: Joao Pereira, "Cursos Pro Joao"
- `reset-password.tsx`: Carlos Mendes
- `student-welcome.tsx`: Pedro Henrique Oliveira, `pedro.henrique@email.com`
- `welcome.tsx`: Maria Silva
- `lead-confirmation.tsx`: "Escola Profissional XYZ Ltda"
