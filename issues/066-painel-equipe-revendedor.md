# Issue 066 — Equipe Propria do Revendedor (Consultores)

**Tipo:** behavior + UI
**Escopo:** `src/app/painel/equipe/*` + `src/app/api/painel/equipe/*`
**Depende de:** 061
**Prioridade:** P1

## Objetivo

Revendedor (RESELLER, owner do tenant) cadastra **consultores proprios** do tenant — pessoas que ajudam a vender na vitrine dele. Cada consultor tem login proprio, cap de desconto definido pelo dono e enxerga apenas as proprias vendas.

## Modelagem (reusa TenantMember de 061)

```prisma
model TenantMember {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  userId      String   @map("user_id")
  role        String   // "owner" | "consultant"
  maxDiscount Int?     @map("max_discount")  // % cap, vindo de 061
  status      String   @default("ATIVO")
  createdAt   DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id])

  @@unique([tenantId, userId])
  @@map("tenant_members")
}
```

`User.role` do consultor = `RESELLER` (mesmo papel global, escopo do tenant fica no TenantMember).

## Paginas

### `painel/equipe/page.tsx`
- Tabela: nome, email, cap desconto, vendas no mes, status, acoes
- Botao "Convidar consultor"
- Filtro por status

### `painel/equipe/[id]/page.tsx`
- Perfil do consultor: dados, cap desconto editavel, historico de vendas
- Botao suspender/reativar
- Botao reenviar convite

## API

- `GET /api/painel/equipe` — lista membros do tenant atual
- `POST /api/painel/equipe` — convida novo consultor (cria User + TenantMember, dispara email)
- `GET /api/painel/equipe/[id]` — detalhe (membro do mesmo tenant)
- `PATCH /api/painel/equipe/[id]` — editar maxDiscount/status
- `DELETE /api/painel/equipe/[id]` — remove vinculo (soft delete TenantMember)
- `POST /api/painel/equipe/[id]/resend-invite`

## Guards

- Todas as rotas: `requireResellerOwner(tenantId)` — apenas o dono do tenant
- Consultor (membro nao-owner) NAO acessa `/painel/equipe`
- Sidebar do painel: item "Equipe" so visivel para `role=owner`
- Nas vendas/cupons do painel: consultor ve apenas as proprias (`soldByUserId = self`); owner ve tudo do tenant
- Cupom criado por consultor: cap = `TenantMember.maxDiscount`; cap de cupom criado por owner = sem limite (validar zod)

## Email template

`src/lib/email/templates/invite-consultant.tsx` — convite com nome do tenant, papel, link set-password.

## Criterios de Aceite

- [ ] Owner cadastra consultor e ele recebe email de convite
- [ ] Consultor entra com login proprio e ve apenas painel limitado (sem `/painel/equipe`)
- [ ] Consultor cria cupom respeitando `maxDiscount`; cap maior retorna 403
- [ ] Owner ve todas as vendas; consultor ve apenas as suas
- [ ] Consultor de tenant A NAO consegue acessar dados de tenant B
- [ ] `npm run build` verde
