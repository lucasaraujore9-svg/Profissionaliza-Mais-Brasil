# Issue 065 — Area PMB Reseller Manager (Gestao de Revendedores)

**Tipo:** behavior + UI
**Escopo:** `src/app/admin/revendedores/*` + `src/app/api/admin/revendedores/*`
**Depende de:** 061
**Prioridade:** P1

## Objetivo

PMB_RESELLER_MGR acompanha **apenas os revendedores atribuidos a ele** (`Tenant.accountManagerId = self`). SUPER_ADMIN ve todos e atribui gerentes de conta.

## Paginas

### `admin/revendedores/page.tsx` — Lista
- Tabela: nome, dominio, plano, status (ATIVO/INADIMPLENTE/SUSPENSO), MRR, ultima atividade, gerente de conta, acoes
- Filtros: status, plano, gerente de conta (so SUPER_ADMIN)
- PMB_RESELLER_MGR ve **apenas** linhas com `accountManagerId = self`
- SUPER_ADMIN ve todos + dropdown atribuir gerente

### `admin/revendedores/[id]/page.tsx` — Perfil do revendedor
Tabs:
1. **Visao geral** — dados do tenant, dominio, plano, MRR, total alunos, GMV mes
2. **Receita** — vendas no MP do revendedor (ja existente em /admin/financeiro mas filtrado por tenant)
3. **Asaas** — historico de cobrancas mensais (status, valor, data, link boleto)
4. **Equipe** — consultores cadastrados pelo revendedor (read-only)
5. **Suporte** — botao WhatsApp (deep link `https://wa.me/<phone>?text=...`), historico de notas internas

### Modal "Atribuir gerente" (so SUPER_ADMIN)
- Select com PMB_RESELLER_MGR ativos
- Salva `Tenant.accountManagerId`

## API

- `GET /api/admin/revendedores` — lista filtrada por accountManagerId (PMB_RESELLER_MGR) ou todos (SUPER_ADMIN)
- `GET /api/admin/revendedores/[id]` — detalhe (guard: SUPER_ADMIN OU manager atribuido)
- `GET /api/admin/revendedores/[id]/asaas` — proxy do historico Asaas (subscription + payments)
- `PATCH /api/admin/revendedores/[id]/manager` — atribuir gerente (guard: SUPER_ADMIN)
- `POST /api/admin/revendedores/[id]/notes` — nota interna de suporte
- `GET /api/admin/revendedores/[id]/notes` — lista notas

## Schema ajustes

```prisma
model TenantSupportNote {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  authorId  String   @map("author_id")
  body      String   @db.Text
  createdAt DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  author User   @relation("SupportNotes", fields: [authorId], references: [id])

  @@index([tenantId, createdAt])
  @@map("tenant_support_notes")
}
```

## Guards

- Todas as rotas: `requirePmbTeam()` (qualquer um dos 3 papeis internos)
- `GET /[id]` e subrotas: SUPER_ADMIN OU `tenant.accountManagerId === session.user.id` → caso contrario 403
- `PATCH /[id]/manager`: `requireSuperAdmin()`

## Sidebar

- Item "Revendedores" visivel para SUPER_ADMIN e PMB_RESELLER_MGR
- PMB_SALES NAO ve

## Criterios de Aceite

- [ ] PMB_RESELLER_MGR ve apenas tenants atribuidos a ele
- [ ] Tentativa de acessar `/admin/revendedores/[outro-id]` retorna 403
- [ ] SUPER_ADMIN atribui gerente e revendedor passa a aparecer no painel do gerente
- [ ] Aba Asaas exibe historico de cobrancas mensais corretamente
- [ ] Botao WhatsApp abre conversa com numero do contato
- [ ] Notas internas persistem com autor e timestamp
- [ ] `npm run build` verde
