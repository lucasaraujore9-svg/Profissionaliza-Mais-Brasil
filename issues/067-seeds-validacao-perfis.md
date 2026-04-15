# Issue 067 — Seeds + Validacao de Perfis

**Tipo:** infra + qa
**Escopo:** `prisma/seed.ts` + smoke tests
**Depende de:** 061, 062, 063, 064, 065, 066
**Prioridade:** P1

## Objetivo

Atualizar seed para criar todos os perfis e validar via smoke tests que cada papel ve exatamente o menu correto e respeita os 403 de fronteira.

## Seed (prisma/seed.ts)

Criar:
- 1 SUPER_ADMIN — `super@pmb.com.br` / `super123`
- 1 PMB_SALES — `vendas@pmb.com.br` / `vendas123`
- 1 PMB_RESELLER_MGR — `gerente@pmb.com.br` / `gerente123`
- 2 RESELLER (owners) — `revenda1@teste.com` e `revenda2@teste.com` / `teste123`
- 1 RESELLER_CONSULTANT do tenant 1 — `consultor1@teste.com` / `teste123` (TenantMember role=consultant, maxDiscount=20)
- Atribuir `Tenant1.accountManagerId = gerente@pmb.com.br`; deixar Tenant2 sem gerente
- 3 cupons: 1 criado por SUPER_ADMIN (50%), 1 por PMB_SALES (30%), 1 por consultor (10%)
- 5 cursos do catalogo; 2 com `destaqueHome=true` e overrides

## Smoke tests (manual checklist em docs/qa/PERFIS.md)

Para cada perfil, verificar:

### SUPER_ADMIN
- [ ] Acessa /admin (todas as secoes)
- [ ] Edita curso (botao Editar visivel)
- [ ] Cria cupom 100% sem erro
- [ ] Lista TODOS os revendedores

### PMB_SALES
- [ ] Acessa /admin/vendas, /admin/vendas/cupons, /admin/vendas/alunos
- [ ] NAO ve item "Equipe", "Revendedores", "Configuracoes" no sidebar
- [ ] Catalogo read-only (sem botao Editar)
- [ ] Cria cupom 50% OK; tentar 60% retorna 403
- [ ] Ve apenas proprias vendas/alunos

### PMB_RESELLER_MGR
- [ ] Acessa /admin/revendedores
- [ ] Ve apenas Tenant1 (atribuido); Tenant2 nao aparece
- [ ] GET /admin/revendedores/<id-tenant2> retorna 403
- [ ] Aba Asaas carrega
- [ ] NAO ve /admin/vendas, /admin/equipe, /admin/catalogo edit

### RESELLER (owner)
- [ ] Acessa /painel completo
- [ ] /painel/equipe disponivel; cadastra consultor
- [ ] Cria cupom sem cap
- [ ] NAO acessa /admin

### RESELLER_CONSULTANT
- [ ] Acessa /painel mas sem item Equipe
- [ ] Cria cupom 20% OK; 25% retorna 403
- [ ] Ve apenas proprias vendas no painel
- [ ] NAO acessa dados de outro tenant

## Criterios de Aceite

- [ ] `npx prisma db seed` cria todos os perfis sem erro
- [ ] Checklist manual completo passa para os 5 perfis
- [ ] `docs/qa/PERFIS.md` documenta credenciais e fluxos esperados
- [ ] `npm run build` verde
