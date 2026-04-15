# Issue 057 — Redesign Seja Revendedor + Checkout (Fase 2B)

**Tipo:** design
**Escopo:** `src/app/(main)/seja-revendedor/*` + `src/components/main/*` (nao-home)
**Depende de:** 055 (tokens globais)
**Prioridade:** P2

## Objetivo

A pagina `/seja-revendedor` e a contrapartida B2B da home: captura empreendedores que querem abrir uma escola. Deve ter identidade PMB mas com tom mais profissional (sem perder a calorosa) — o publico aqui e classe B/C que quer empreender, nao classe C/D/E estudando.

## Paginas e Componentes

### `(main)/seja-revendedor/page.tsx`
- HeroCta: verde-escuro + "Monte sua escola em 24h" + CTA gold
- ComoFunciona: 3 passos em cards com icones lucide (ja existe, so reestilizar)
- NumerosBento: kpis grid com numeros em destaque (alunos, revendedores, faturado)
- BeneficiosZigzag: alternado imagem/texto com paleta PMB
- PlanosComparativo: tabela de pricing com destaque no plano recomendado (badge gold)
- DepoimentosSection: cards de revendedores bem-sucedidos
- FormularioInteresse: form lead capture com CTA gold
- FaqAccordion: com cores PMB

### `(main)/seja-revendedor/checkout/page.tsx`
- CheckoutWizard: steps progress com acento gold/lime
- CheckoutFormEmpresa + CheckoutFormPessoal: inputs com bordas PMB
- CheckoutResumoPlano + CheckoutPaymentPreview: card lateral com preco destaque
- CheckoutConfirmacao: sucesso com lime + proximos passos claros

## Criterios de Aceite

- [ ] Hero + secoes alinhadas com paleta e tipografia da home
- [ ] Tabela de planos com badge "Recomendado" em gold
- [ ] Wizard de checkout com progress em PMB
- [ ] Tom profissional-caloroso (nao "povao", mas nao engomado)
- [ ] Responsivo
- [ ] `npm run build` verde
