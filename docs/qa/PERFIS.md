# QA — Perfis e fronteiras de acesso

Checklist manual executado apos `npx prisma db seed`.

## Credenciais (pos-seed)

| Papel                | Email                     | Senha        | Escopo                                  |
|----------------------|---------------------------|--------------|-----------------------------------------|
| SUPER_ADMIN          | super@pmb.com.br          | super123     | Tudo                                    |
| SUPER_ADMIN (legado) | admin@pmb.com.br          | admin123     | Tudo                                    |
| PMB_SALES            | vendas@pmb.com.br         | vendas123    | Vendas diretas, cap cupom 50%           |
| PMB_RESELLER_MGR     | gerente@pmb.com.br        | gerente123   | Tenant1 (atribuido); Tenant2 invisivel  |
| RESELLER owner 1     | revenda1@teste.com        | teste123     | /painel tenant1                         |
| RESELLER owner 2     | revenda2@teste.com        | teste123     | /painel tenant2                         |
| Consultor tenant1    | consultor1@teste.com      | teste123     | /painel tenant1 (cap desconto 20%)      |

Tenants:
- `revenda1` — accountManagerId = gerente@pmb.com.br
- `revenda2` — sem gerente

Cupons:
- `SUPER50` (tenantId=null, 50%, criado por SUPER_ADMIN)
- `VENDAS30` (tenantId=null, 30%, criado por PMB_SALES)
- `CONSULT10` (tenantId=tenant1, 10%, criado por consultor)

## Checklist por perfil

### SUPER_ADMIN
- [ ] Acessa /admin (todas as secoes)
- [ ] Edita curso (botao Editar visivel)
- [ ] Cria cupom 100% sem erro
- [ ] Lista TODOS os revendedores
- [ ] Atribui/remove gerente de tenant

### PMB_SALES
- [ ] Acessa /admin/vendas, /admin/vendas/cupons, /admin/vendas/alunos
- [ ] Sidebar sem "Equipe", sem "Configuracoes"
- [ ] Nao acessa /admin/revendedores (403 ou redirect)
- [ ] Catalogo read-only
- [ ] Cria cupom 50% OK
- [ ] Tenta cupom 60% -> 403 com mensagem "Seu cap de desconto e 50%"
- [ ] /admin/vendas lista apenas proprias vendas
- [ ] /admin/vendas/alunos lista apenas alunos cujas enrollments dele ele criou

### PMB_RESELLER_MGR
- [ ] Acessa /admin/revendedores
- [ ] Ve apenas `revenda1` (atribuido); `revenda2` nao aparece
- [ ] GET /api/admin/revendedores/<id-tenant2> -> 403
- [ ] Aba Asaas carrega para revenda1
- [ ] Pode adicionar notas de suporte no detalhe de revenda1
- [ ] Sidebar sem /admin/vendas, sem /admin/equipe
- [ ] Nao ve botao "Editar" no catalogo

### RESELLER (owner revenda1)
- [ ] Acessa /painel completo
- [ ] /painel/equipe disponivel; cadastra consultor novo
- [ ] Cria cupom 100% sem cap
- [ ] NAO acessa /admin (redirect /login)
- [ ] Nao ve dados de revenda2

### RESELLER consultor (consultor1)
- [ ] Acessa /painel (owner do TenantMember)
- [ ] Sidebar sem "Equipe" (ownerOnly=true)
- [ ] Sidebar sem "Dominio", "Vitrine", "Configuracoes"
- [ ] Cria cupom 20% OK
- [ ] Tenta cupom 25% -> 403 com mensagem "Seu cap de desconto e 20%"
- [ ] Ve apenas proprias vendas no painel
- [ ] Nao acessa dados de outro tenant

## Fronteiras de API (curl/DevTools)

Com o session cookie de cada perfil:

```
# PMB_SALES tenta criar cupom 60%
POST /api/admin/cupons body={"code":"X60","discountType":"PERCENTAGE","discountValue":60,...}
Esperado: 403

# PMB_RESELLER_MGR tenta acessar tenant sem atribuicao
GET /api/admin/revendedores/<tenant2-id>
Esperado: 403

# Consultor tenta criar cupom 30%
POST /api/painel/cupons body={"code":"Y30","discountType":"PERCENTAGE","discountValue":30,...}
Esperado: 403

# RESELLER owner cria cupom 80%
POST /api/painel/cupons body={"code":"Z80","discountType":"PERCENTAGE","discountValue":80,...}
Esperado: 200
```
