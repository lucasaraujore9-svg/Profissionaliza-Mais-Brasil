# QA — Perfis e fronteiras de acesso

Checklist manual executado apos `npx prisma db seed`.

## Credenciais (pos-seed)

| Papel                | Email                     | Senha        | Escopo                                  |
|----------------------|---------------------------|--------------|-----------------------------------------|
| SUPER_ADMIN          | super@pmb.com.br          | super123     | Tudo                                    |
| SUPER_ADMIN (legado) | admin@pmb.com.br          | admin123     | Tudo                                    |
| PMB_SALES            | vendas@pmb.com.br         | vendas123    | Vendas diretas, cap cupom 50%           |
| PMB_RESELLER_MGR     | gerente@pmb.com.br        | gerente123   | Tenant1 (atribuido); Tenant2 invisivel  |
| PMB_RESELLER_DIRECTOR| diretor@pmb.com.br        | diretor123   | TODAS as unidades; sem financeiro global|
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

### PMB_RESELLER_DIRECTOR (Diretor de unidades)

O gerente acima SEM o recorte de carteira. E o unico papel alem do SUPER_ADMIN
cujo preset carrega `unidades.viewAll` — declarado em `SUPER_EXCLUSIVE_BY_PRESET`
(`src/lib/auth/admin-permissions.ts`), com teste de igualdade exata.

- [ ] /admin/revendedores lista revenda1 E revenda2 (nenhuma atribuida a ele)
- [ ] GET /api/admin/revendedores/<id-tenant2> -> 200 (o gerente toma 403 no mesmo id)
- [ ] Coluna "Gerente de conta" aparece e o botao "Atribuir" funciona
      (usa /api/admin/revendedores/gerentes, nao /api/admin/equipe)
- [ ] Muda a mensalidade em Cobranca (planValue) de qualquer unidade
- [ ] Troca a senha do titular e usa "Entrar como" em qualquer unidade
- [ ] Cancela unidade e edita a politica de contrato (governanca)
- [ ] Busca aluno de qualquer unidade em /admin/alunos e gere o acesso dele
- [ ] Sidebar SEM: Vendas diretas, Vitrine, Equipe, Configuracoes, Automacao
- [ ] /admin/financeiro abre so na aba "Comissoes a pagar" (sem Visao geral nem
      Mensalidades a receber)
- [ ] POST /api/admin/revendedores/<id>/anonimizar -> 403 (LGPD segue com o super)
- [ ] PATCH /api/admin/configuracoes (ou integracoes) -> 403
- [ ] /admin/equipe -> redirect (nao gerencia a propria equipe)
- [ ] Em /admin/equipe (como super), o checkbox "Ver todas as unidades da rede"
      aparece MARCADO e travado, com o rotulo "(vem do papel)"

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

## Permissoes da equipe interna PMB (/admin/equipe)

Desde 2026-07-28 o admin usa o mesmo modelo da unidade: o `UserRole` define um
PRESET de permissoes (`src/lib/auth/admin-permissions.ts`) e o super admin
ajusta pessoa a pessoa em **/admin/equipe → abrir a pessoa → Permissoes
avancadas**. Os presets reproduzem a matriz anterior, entao este checklist
continua valendo — o que muda e que agora da para conceder/revogar item a item.

### Roteiro do ajuste fino

- [ ] Abrir um vendedor de curso e marcar `financeiro.view` em Permissoes
      avancadas. Salvar. O menu "Financeiro" aparece para ele **sem relogar**
      (as permissoes sao resolvidas por request, nao vem do JWT).
- [ ] Desmarcar `cupons.manage` do mesmo vendedor. `POST /api/admin/cupons`
      passa a responder 403; a listagem continua abrindo (`cupons.view`).
- [ ] Trocar o papel da pessoa. Os ajustes finos sao zerados (o preset novo vale
      inteiro) — a UI limpa e a API tambem, para nenhum override do papel
      anterior sobreviver.
- [ ] Selo "(ajustado)" aparece na linha da pessoa em /admin/equipe assim que
      houver ao menos um ajuste.
- [ ] Suspender a pessoa (status INATIVO) derruba o acesso na proxima
      requisicao, mesmo com o token ainda valido.

### Fronteiras que precisam continuar fechadas

```
# Escalada de privilegio via ajuste fino (a unica permissao exclusiva)
PATCH /api/admin/equipe/<id> body={"extraPermissions":["equipe.manage"]}
Esperado: 400 (exclusiva do Super Admin)

# Designer: so o banco de artes
GET  /api/admin/alunos/global                 -> 403
POST /api/admin/alunos/<id>/reset-password    -> 403
GET  /api/admin/dashboard                     -> 403
GET  /admin                                   -> redirect para /admin/artes

# Comercial de revenda: sem aluno, sem dinheiro
GET  /api/admin/referrals/commissions/export  -> 403
GET  /api/admin/financeiro/referral-payouts   -> 403
POST /api/admin/alunos/<id>/enrollments/<e>/cancelar -> 403

# Financeiro: dinheiro sim, unidade e catalogo nao
PATCH /api/admin/revendedores/<id>/status     -> 403
PATCH /api/admin/catalogo/<id>                -> 403
GET   /api/admin/relatorios/<tipo>            -> 403 (export nunca o atendeu)

# Gerente de unidades: administra a carteira, nao o contrato
PATCH /api/admin/revendedores/<id>/policy            -> 403
PATCH /api/admin/tenants/<id>/can-sell-resellers     -> 403
PATCH /api/admin/revendedores/<id>/manager           -> 403
PATCH /api/admin/revendedores/<id>/status  (unidade nao atribuida) -> 403
```

### Regressoes fechadas na revisao (rodar em homologacao antes do deploy)

Cinco escaladas reais foram introduzidas quando a autorizacao virou permissao e
as travas internas ficaram no papel. Cada linha abaixo e o cenario exato:

```
# 1. Cobranca de unidade fora da carteira (era SUPER_ADMIN-only e ficou sem
#    checagem de dono — `deletePayment` bate na chave Asaas da MAE)
como PMB_RESELLER_MGR:
DELETE /api/admin/revendedores/<unidade-que-ele-NAO-gerencia>/payments/<id> -> 403
PATCH  /api/admin/revendedores/<unidade-dele>/payments/<id-de-outra-unidade> -> 404

# 2. Desconto de 100% ao receber `vendas.create` por ajuste fino
conceda "Registrar nova venda" a um PMB_RESELLER_MGR e poste:
POST /api/admin/vendas {"manualDiscountPercent": 100, ...} -> 403 (cap 50%)

# 3. Cupom de 100% ao receber `cupons.manage` por ajuste fino
POST /api/admin/cupons {"discountType":"PERCENTAGE","discountValue":100} -> 403
PATCH /api/admin/cupons/<cupom-de-OUTRO-vendedor>/toggle -> 403

# 4. Clawback fora do publico (era super + financeiro)
como PMB_RESELLER_MGR:
POST /api/admin/referrals/clawback/resolve -> 403

# 5. REVOGAR permissao ampliava o acesso (derivacao invertida)
em /admin/equipe, desmarque "Ver as unidades atribuidas" de um PMB_RESELLER_MGR
que mantem "Ver as comissoes a pagar", e chame:
GET /api/admin/financeiro/referral-payouts -> 403 (antes: PIX de TODA a rede)

# 6. IDOR na pagina de comissoes da unidade
como PMB_RESELLER_MGR, abra
/admin/revendedores/<unidade-que-ele-NAO-gerencia>/comissoes -> 404

# 7. Token do gateway sem a permissao de credencial
com `configuracoes.manage` e SEM `integracoes.manage`:
PATCH /api/admin/config {"pmbMpAccessToken":"..."} -> 403

# 8. `unidades.viewAll` nao e concedivel (viraria super admin de fato)
PATCH /api/admin/equipe/<id> {"extraPermissions":["unidades.viewAll"]} -> 400
```
