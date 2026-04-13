# Issue 002 — Seja Revendedor Page Prototype

**Tipo:** proto
**Página:** /seja-revendedor
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de captação de revendedores (/seja-revendedor) com componentes de venda e CTA. Dados hardcoded, design atraente e responsivo.

## Componentes Envolvidos
- HeroCTA — headline, subheadline, CTA "Começar Agora", background destaque
- BeneficiosZigZag — 5 benefícios em layout alternado (imagem-texto-imagem-texto-imagem)
- TimelineDetalhada — 5 etapas do onboarding em timeline vertical
- PlanosComparativo — tabela comparativa 3 planos (features, preço)
- FAQAccordion — 5 perguntas frequentes com expand/collapse
- FormularioInteresse — form com campos: email, nome empresa, telefone, submit "Quero Começar"

## Comportamentos
- `render-page` — exibir layout completo
- `expand-faq-item` — clicar em FAQ expande resposta
- `responsive-design` — testar em mobile/tablet/desktop

## Critério de Aceite
- [ ] HeroCTA renderiza com headline impactante
- [ ] BeneficiosZigZag exibe 5 benefícios em zigzag layout
- [ ] TimelineDetalhada mostra 5 etapas com números
- [ ] PlanosComparativo tabela com 3 planos e features checkmarks
- [ ] FAQAccordion com 5 items, todos fechados por padrão
- [ ] Formulário tem campos: email, nome empresa, telefone (inputs vazios)
- [ ] Botão "Quero Começar" visível e estilizado
- [ ] Layout responsivo mobile, tablet, desktop
- [ ] Cores e tipografia seguem design system
