# Issue 061 — Expansao de Roles + Schema + Guards

**Tipo:** infra
**Escopo:** `prisma/schema.prisma` + `src/lib/auth/*` + middleware
**Depende de:** 055
**Prioridade:** P0

## Objetivo

Introduzir a nova hierarquia de papeis que suporta equipe interna PMB (vendas diretas e gestao de revendedores) e consultores proprios dos revendedores.

## Modelagem

### Enum `UserRole`
```prisma
enum UserRole {
  SUPER_ADMIN        // PMB owner — tudo
  PMB_SALES          // vendas diretas na vitrine principal, cupom ate 50%
  PMB_RESELLER_MGR   // acompanha revendedores atribuidos
  RESELLER           // dono de tenant
}
```
Migration: mapear `ADMIN` existente -> `SUPER_ADMIN`.

### Ajustes de modelos

- `Tenant.accountManagerId String?` — FK para User (role PMB_RESELLER_MGR). Atribuicao de gerente de conta.
- `TenantMember.maxDiscount Int?` — cap de desconto que um consultor do revendedor pode aplicar.
- `Coupon.createdByUserId String?` + `createdByRole UserRole?` — auditoria e validacao de cap.
- Confirmar `Enrollment.tenantId` e `Payment.tenantId` ja sao **nullable** (vendas da vitrine principal PMB nao pertencem a tenant). Se nao forem, migration para nullable.

## Guards (src/lib/auth/guards.ts)

```ts
requireSuperAdmin(): session | 403
requirePmbTeam(): session | 403  // SUPER_ADMIN | PMB_SALES | PMB_RESELLER_MGR
requirePmbSales(): session | 403
requirePmbResellerMgr(): session | 403
requireResellerOwner(tenantId): session | 403
requireResellerMember(tenantId): session | 403
```

## Criterios de Aceite

- [ ] Migration aplicada sem perda de dados
- [ ] Seed atualizado: SUPER_ADMIN + 1 PMB_SALES + 1 PMB_RESELLER_MGR + RESELLER existente
- [ ] Guards implementados e cobertos por teste basico
- [ ] Grep no codigo por `role === "ADMIN"` atualizado para `SUPER_ADMIN` (ou helper)
- [ ] Middleware/layouts de `/admin` aceitam os 3 papeis internos com filtro de menu
- [ ] `npm run build` verde
