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

### Equipe da unidade (TenantMember)

A unidade tem 4 papeis atribuiveis alem do titular. Presets em
`src/lib/auth/painel-permissions.ts` (fonte unica); o dono ajusta permissao a
permissao em /painel/equipe.

| Papel      | Ve                                                                                 | NAO ve / nao faz                                                        |
|------------|------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| Gerente    | Alunos, vendas, leads, catalogo, cupons, financeiro, certificados, vitrine, atendimento, automacao, relatorios | Gateway, dominio, equipe, indicacoes, cobrancas, excluir conta          |
| Vendedor   | Dashboard, catalogo (leitura), cupons (leitura), treinamentos, artes — alunos/vendas/leads **so os dele** | Financeiro, vitrine, dominio, configuracoes, equipe, certificados, comunicacao, relatorios |
| Secretaria | Alunos (todos), atendimento, certificados, comunicacao, catalogo (leitura)          | Financeiro, vendas, cupons, vitrine, dominio, equipe, relatorios         |
| Financeiro | Financeiro, relatorios (sem Indicacoes), cupons, alunos/vendas (leitura, todos)     | Vitrine, dominio, catalogo (edicao), equipe, certificados, atendimento   |

Checklist por papel — logar como cada um e conferir:

- [ ] **Vendedor**: sidebar sem Financeiro/Vitrine/Dominio/Configuracoes/Equipe/Indicacoes/Certificados/Comunicacao
- [ ] **Vendedor**: lista de alunos mostra so os que ele originou (matricula com `soldByUserId` dele)
- [ ] **Vendedor**: abrir `/painel/alunos/<id-de-aluno-de-outro-vendedor>` -> 404
- [ ] **Vendedor**: kanban de leads mostra so os atribuidos a ele
- [ ] **Vendedor**: dashboard soma so as vendas dele (nao o faturamento da unidade)
- [ ] **Vendedor**: cria cupom no cap dele; acima do cap -> 403
- [ ] **Secretaria**: ve todos os alunos, sem nenhum menu de dinheiro
- [ ] **Financeiro**: acessa Financeiro e Relatorios; aba "Indicacoes & rede" ausente
- [ ] **Gerente**: opera a unidade, mas /painel/configuracoes mostra so "Conta" e "Seguranca"
- [ ] **Todos**: /painel/configuracoes permite trocar a propria senha
- [ ] **Titular**: botao do olho em /painel/equipe abre a previa; banner aparece; salvar qualquer
      coisa na previa nao altera nada (modo leitura); "Sair da previa" volta ao normal

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

# Vendedor da unidade tenta tocar no que nao lhe compete (regressao do vazamento
# que motivou os papeis — antes TODAS respondiam 200)
POST /api/painel/config/connect-mp        -> 403
POST /api/painel/dominio                  -> 403
GET  /api/painel/financeiro               -> 403
GET  /api/painel/indicacoes/demonstrativo -> 403
GET  /api/painel/cobrancas                -> 403
POST /api/painel/equipe                   -> 403
GET  /api/painel/alunos/<aluno-de-outro-vendedor> -> 404

# Membro tenta escalar o proprio privilegio via override
PATCH /api/painel/equipe/<id> body={"extraPermissions":["equipe.manage"]}
Esperado: 400 (permissao exclusiva do titular) — e 403 antes disso, porque
so o titular alcanca a rota

# RESELLER owner cria cupom 80%
POST /api/painel/cupons body={"code":"Z80","discountType":"PERCENTAGE","discountValue":80,...}
Esperado: 200
```
