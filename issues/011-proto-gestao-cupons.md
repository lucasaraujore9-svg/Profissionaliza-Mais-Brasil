# Issue 011 — Gestão de Cupons Prototype

**Tipo:** proto
**Página:** /painel/cupons
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Criar página de gestão de cupons de desconto. Componentes: header com botão criar, grid cupons, modal criação, tabela uso cupom. Dados hardcoded.

## Componentes Envolvidos
- CouponHeader — titulo "Cupons", botão "+ Novo Cupom"
- CouponGrid — grid 12 cupons em cards com código, desconto, validade, status
- CreateCouponModal — form: código, desconto (% ou R$), data início, data fim, uso máximo, cursos aplicáveis
- CouponCard — exibe código destaque, desconto, data validade, toggle ativo/inativo
- UsageTable — tabela uso de um cupom: aluno, valor desconto, data uso

## Comportamentos
- `render-coupon-grid` — exibir 12 cupons em grid
- `click-novo-cupom` — abrir CreateCouponModal
- `toggle-cupom` — ativar/desativar cupom
- `click-cupom-card` — expandir/ver detalhes e usage table
- `close-modal` — fechar modal criação

## Critério de Aceite
- [ ] CouponHeader com titulo e botão "+ Novo Cupom"
- [ ] CouponGrid exibe 12 cupons em grid responsivo
- [ ] CouponCard mostra código grande, desconto, data validade
- [ ] Toggle ativo/inativo em cada card
- [ ] Clicar cupom expande para mostrar UsageTable
- [ ] CreateCouponModal com campos: código, desconto, datas, máx uso
- [ ] Modal pode ser aberto/fechado visualmente
- [ ] UsageTable mostra histórico uso cupom
- [ ] Layout responsivo (grid ajusta mobile)
- [ ] Tipografia e cores corretas
