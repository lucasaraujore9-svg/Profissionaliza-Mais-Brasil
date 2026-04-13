# Issue 041 — Gestão de Cupons: CRUD + Validação

**Tipo:** behavior
**Página:** /painel/cupons
**Depende de:** 011, 020
**Prioridade:** P1

## O Que Fazer

Implementar gestão cupons: carregar cupons, criar novo cupom, toggle ativo/inativo, visualizar histórico uso. Validação Zod, auto-gerar código.

## Componentes Envolvidos
- GET /api/painel/cupons — listar cupons do tenant
- POST /api/painel/cupons — criar cupom
- PATCH /api/painel/cupons/[id]/toggle — toggle ativo/inativo
- GET /api/painel/cupons/[id]/usage — histórico uso cupom
- POST /api/painel/cupons/generate-code — gerar código aleatório

## Comportamentos
- `load-coupons` — GET /api/painel/cupons WHERE tenant_id
- `create-coupon` — POST /api/painel/cupons com Zod validation
- `generate-code` — POST /api/painel/cupons/generate-code retorna código aleatório
- `toggle-coupon` — PATCH /api/painel/cupons/[id]/toggle ativo/inativo
- `view-usage` — GET /api/painel/cupons/[id]/usage histórico uso

## Critério de Aceite
- [ ] GET /api/painel/cupons implementado
- [ ] Query Prisma Coupon WHERE tenant_id
- [ ] Retorna { id, code, discount_value, discount_percent, valid_from, valid_to, usage_count }
- [ ] CouponGrid renderiza com 12+ cupons
- [ ] POST /api/painel/cupons implementado
- [ ] Zod schema: { code, discount_value ou discount_percent, valid_from, valid_to, max_usage }
- [ ] POST /api/painel/cupons/generate-code gera código aleatório (ex: PMB2024SPRING)
- [ ] Cria Coupon com código gerado
- [ ] PATCH /api/painel/cupons/[id]/toggle ativa/desativa
- [ ] CouponCard renderiza com toggle
- [ ] GET /api/painel/cupons/[id]/usage retorna histórico
- [ ] UsageTable mostra aluno, desconto, data uso
