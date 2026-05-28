# Issue 101 — Escopar autorização dos papéis PMB sobre revendedores e certificados

**Tipo:** sec (remediação)
**Escopo:** `src/app/api/admin/revendedores/[id]/status/route.ts` · `/policy/route.ts` · `/billing/route.ts` · `/manager/route.ts` · `/comissoes/*` · `src/app/api/admin/certificates/[id]/revoke/route.ts` · `src/lib/auth/guards.ts`
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R4 (Alto) + R24 (Médio)

## Contexto / Evidência
`requirePmbTeam`/`requireAdminSession` autoriza qualquer membro PMB (SALES, RESELLER_MGR) a alterar
`status`, `policy` e `billing` de **qualquer** revendedor — sem checar `Tenant.accountManagerId`.
Cenários confirmados pelo Red Team: PMB_SALES suspende/reativa a loja de qualquer tenant; flipar
`billingMode` para MANUAL **desliga o auto-block de inadimplência**. Além disso,
`admin/certificates/[id]/revoke` faz `findUnique({id})` sem filtrar escopo → PMB_SALES revoga
certificado de revendedor (R24).

## O Que Fazer
1. Criar helper `requireResellerManagementAccess(tenantId, session)` em `guards.ts`:
   - `SUPER_ADMIN` → sempre ok.
   - `PMB_RESELLER_MGR` → ok somente se `tenant.accountManagerId === session.userId`.
   - `PMB_SALES` → **negar** ações de `status`/`policy`/`billing` (ou definir explicitamente o que pode).
2. Aplicar o helper em `status`, `policy`, `billing`, `manager`, `comissoes/*`.
3. **Restringir `policy` e `billing` a `SUPER_ADMIN`** (decidir; billing afeta segurança/cobrança).
4. Em `certificates/[id]/revoke`, filtrar por escopo do solicitante (tenant do revendedor ou `null` para PMB) antes do revoke.

## Decisão humana necessária
- PMB_SALES deve poder suspender/reativar revendedores? (provavelmente não)
- `billingMode` deve ser editável por alguém além de SUPER_ADMIN?

## Critério de Aceite
- [ ] PMB_RESELLER_MGR só altera revendedores onde é `accountManagerId`.
- [ ] `policy`/`billing` restritos conforme decisão (default: SUPER_ADMIN).
- [ ] Revoke de certificado respeita escopo do solicitante.
- [ ] Teste de autorização (negado) para cada rota (Etapa 2 cobre, mas adicionar caso aqui se viável).
- [ ] R4/R24 atualizados em `audit/MATRIZ_DE_RISCOS.md` e `MATRIZ_DE_PERMISSOES.md`.
- [ ] `npm run typecheck` + `lint` verdes.
