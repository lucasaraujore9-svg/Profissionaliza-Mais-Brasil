# Issue 060 — Validacao Cross-Page + Acessibilidade (Fase Final)

**Tipo:** design + qa
**Escopo:** todo app
**Depende de:** 055, 056, 057, 058, 059
**Prioridade:** P3

## Objetivo

Apos aplicar o design system em todas as areas, fazer uma passada transversal pra garantir consistencia, contraste adequado e responsividade.

## Tarefas

### Visual consistency
- [ ] Spot check em cada uma das 25 paginas: screenshot e conferir se todas usam paleta PMB
- [ ] Confirmar que nao sobrou nenhum azul/cinza shadcn default
- [ ] Confirmar logo oficial presente e com tamanho correto em todos os layouts

### Acessibilidade
- [ ] Contraste AA em todos os textos sobre fundos PMB (verde sobre branco, branco sobre verde, gold sobre verde)
- [ ] Focus rings visiveis (usar `--color-pmb-gold` no `--ring` token)
- [ ] Aria-labels em botoes de icone puro
- [ ] Skip-link funcional no layout main

### Responsividade
- [ ] Mobile (360-414px): navbars colapsam corretamente, CTAs full-width onde preciso
- [ ] Tablet (768px): grids adaptam, sidebars colapsaveis no painel/admin
- [ ] Desktop (1280px+): max-width respeitado

### Performance
- [ ] Logo otimizada (WebP opcional, next/image priority onde aplicavel)
- [ ] Fonts com `display: swap` (ja configurado)
- [ ] Bundle size check: `npm run build` e ver se nao passou de ~250kb First Load JS

### Documentacao
- [ ] Atualizar `docs/references/design-system.md` com paleta PMB definitiva, exemplos de uso, do's e dont's
- [ ] Screenshot de cada pagina principal em `docs/design/screenshots/`

## Criterios de Aceite

- [ ] `npm run build` verde
- [ ] `npm run lint` sem warnings novos
- [ ] Lighthouse acessibilidade >= 90 em home, login, loja
- [ ] Doc de design system atualizado
