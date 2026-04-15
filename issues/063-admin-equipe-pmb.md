# Issue 063 — Equipe Interna PMB (CRUD)

**Tipo:** behavior + UI
**Escopo:** `src/app/admin/equipe/*` + `src/app/api/admin/equipe/*`
**Depende de:** 061
**Prioridade:** P1

## Objetivo

Super Admin gerencia os usuarios internos da PMB (SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR). Permite criar, editar, suspender e convidar novos membros por email.

## Paginas

### `admin/equipe/page.tsx`
- Tabela com colunas: nome, email, papel, status, ultima atividade, acoes
- Filtro por papel
- Botao "Convidar novo membro"

### `admin/equipe/[id]/page.tsx`
- Perfil do membro
- Dados pessoais editaveis (nome, email, foto, telefone)
- Alterar papel (dropdown com SUPER_ADMIN/PMB_SALES/PMB_RESELLER_MGR)
- Botao suspender / reativar
- Botao "Reenviar convite" se `passwordHash` ainda nao foi definido

## API

- `GET /api/admin/equipe` — lista (guard: SUPER_ADMIN)
- `POST /api/admin/equipe` — cria + dispara email de convite com link set-password
- `GET /api/admin/equipe/[id]` — detalhe
- `PATCH /api/admin/equipe/[id]` — editar dados/papel/status
- `DELETE /api/admin/equipe/[id]` — soft delete (status=INATIVO)
- `POST /api/admin/equipe/[id]/resend-invite` — reenviar convite

## Fluxo de convite

1. Admin cria membro com email + papel
2. Sistema gera `resetToken` (reaproveita mecanismo existente) com expiracao 7 dias
3. Envia email usando template `invite.tsx` (novo) com link `/reset-password?token=...&invite=1`
4. Primeiro login = definir senha

## Email template (novo)

`src/lib/email/templates/invite.tsx` — boas-vindas da PMB, link pra definir senha, apresentacao do papel.

## Criterios de Aceite

- [ ] Super Admin cria usuarios internos com papeis corretos
- [ ] Email de convite chega e link funciona
- [ ] PMB_SALES e PMB_RESELLER_MGR NAO acessam `/admin/equipe`
- [ ] Item "Equipe" no sidebar-admin aparece apenas pro Super Admin
- [ ] `npm run build` verde
