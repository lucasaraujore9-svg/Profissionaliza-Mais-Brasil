# Issue 112 — Acessibilidade: corrigir os 5 itens WCAG nível Alto

**Tipo:** a11y (remediação)
**Escopo:** componentes de formulário (login, checkout, contato, PIX/boleto) · slideshow/banner · páginas públicas `(main)`/`loja`/`livrecursos` · `src/components/ui/*`
**Depende de:** nenhuma
**Prioridade:** P2
**Risco:** R30 (Médio) — WCAG 2.2 AA

## Contexto / Evidência (relatório 08)
1. `focus:outline-none` sem ring de foco em inputs de pagamento/contato — **WCAG 2.4.11 / 2.4.7**.
2. Mensagens de erro sem `role="alert"` (login e formulários de compra) — **4.1.3**.
3. Formulários de compra sem `autocomplete` — **1.3.5**.
4. Hierarquia de headings h1→h3 em páginas públicas — **1.3.1**.
5. Slideshow auto-rotante sem mecanismo de pausa — **2.2.2**.

## O Que Fazer
1. Garantir ring de foco visível (`focus-visible:ring-*`) em todos os inputs/botões; remover `outline-none` solto.
2. Adicionar `role="alert"`/`aria-live="assertive"` nos containers de erro de formulário.
3. Adicionar `autocomplete` apropriado (name, email, tel, cc-*) nos formulários de compra.
4. Corrigir a ordem de headings (um `h1` por página; sem pular níveis).
5. Botão de pausar/parar no slideshow (e respeitar `prefers-reduced-motion`).

## Critério de Aceite
- [ ] Os 5 itens corrigidos nas páginas afetadas.
- [ ] Verificação com axe-core/Lighthouse (sem violações críticas dos itens acima).
- [ ] Navegação por teclado com foco visível no fluxo de checkout.
- [ ] R30 atualizado em `audit/MATRIZ_DE_RISCOS.md` e item no `CHECKLIST_PRODUCAO.md`.
- [ ] `npm run typecheck` + `lint` verdes.
