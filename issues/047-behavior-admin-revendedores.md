# Issue 047 — Admin Gestão Revendedores: Listagem + Detalhe

**Tipo:** behavior
**Página:** /admin/revendedores, /admin/revendedores/[id]
**Depende de:** 017, 020, 028
**Prioridade:** P1

## O Que Fazer

Implementar gestão revendedores admin: carregar lista, buscar/filtrar, ver detalhe completo, suspender/ativar, cancelar assinatura. Invalidar Redis cache ao atualizar.

## Componentes Envolvidos
- GET /api/admin/revendedores — listar revendedores
- GET /api/admin/revendedores/[id] — detalhe revendedor
- PATCH /api/admin/revendedores/[id]/status — suspender/ativar
- DELETE /api/admin/revendedores/[id] — cancelar assinatura
- lib/redis invalidate ao atualizar

## Comportamentos
- `load-resellers` — GET /api/admin/revendedores
- `search-resellers` — filtrar por nome/email
- `filter-by-status` — filtrar status revendedor
- `view-reseller-detail` — GET /api/admin/revendedores/[id]
- `suspend-reseller` — PATCH /api/admin/revendedores/[id]/status { status: SUSPENDED }
- `activate-reseller` — PATCH /api/admin/revendedores/[id]/status { status: ACTIVE }
- `cancel-subscription` — DELETE /api/admin/revendedores/[id] (Asaas + DB)
- `update-policy` — PATCH /api/admin/revendedores/[id]/policy { billing_mode, ... }

## Critério de Aceite
- [ ] GET /api/admin/revendedores implementado
- [ ] Query Prisma Tenant com User (status, email, company)
- [ ] Retorna lista com MRR, students count
- [ ] ResellerTable renderiza 20+ revendedores
- [ ] Search filtra por nome/email
- [ ] Filter status funciona
- [ ] GET /api/admin/revendedores/[id] com detalhes completos
- [ ] ResellerProfile renderiza informações
- [ ] PaymentHistory mostra transações Asaas
- [ ] PATCH /api/admin/revendedores/[id]/status atualiza status
- [ ] DELETE /api/admin/revendedores/[id] cancela Asaas subscription
- [ ] Redis invalidate tenant:{id} após atualizar
- [ ] PolicyConfig toggle modo bloqueio funciona
