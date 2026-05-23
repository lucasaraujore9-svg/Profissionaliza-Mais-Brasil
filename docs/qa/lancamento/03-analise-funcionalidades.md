# Analise de Funcionalidades — Pre-Lancamento
**Data:** 2026-05-23
**Autor:** QA (varredura estatica do codigo)

## Sumario
- **Total de paginas/features mapeadas:** ~90 (paginas + route handlers principais)
- **Funcionando OK (sem bug aparente):** ~65
- **Com problemas / incompletas:** ~22
- **Faltando completamente:** ~10
- **Achados detalhados abaixo:** 39

### Top 5 bugs que travam lancamento (P0)
1. **Formulario `/contato` envia campos incompativeis com `/api/leads`** — todo lead via "Fale com a gente" cai em VALIDATION_ERROR 400. Captacao quebrada na pagina mais obvia para suporte.
2. **Onboarding do revendedor nao captura dado nenhum** — wizard so mostra texto pedindo para abrir outras telas; nao salva progresso intermediario, nao integra com vitrine/dominio. Tenant fica `ACTIVE` mesmo sem ter configurado nada.
3. **Consultor (TenantMember) nao consegue acessar o painel** — usuario consultor e criado com `User.tenantId = null`, mas `requireResellerSession` exige `session.user.tenantId`. JWT nao popula tenantId via membership. Bug ja documentado em CLAUDE.md, sem fix.
4. **Cadastro PIX inexistente no painel** — pagina de indicacoes redireciona para `/painel/configuracoes` para o revendedor cadastrar PIX, mas nao ha campo nem endpoint para salvar `pixKey/pixKeyType`. Cron mensal nao consegue pagar comissoes que nao tem PIX.
5. **Cron sweep-tenants-overdue / sweep-students-overdue / reactivate-paid nao estao agendados** em `vercel.json` — bloqueio/desbloqueio so funciona via webhook em tempo real; se webhook do Asaas falhar, sistema fica inconsistente para sempre.

---

## Inventario por area

### `(auth)` — Login / Registro / Recuperar

| Feature | Arquivo | Estado | Notas |
|---|---|---|---|
| Login User+Student | `src/app/(auth)/login/page.tsx`, `src/lib/auth.ts` | OK | Cookie "Lembrar-me" sem implementacao (sem name/onChange) — apenas decorativo |
| Forgot password | `src/app/(auth)/forgot-password/page.tsx`, `src/app/api/auth/forgot-password/route.ts` | OK | Token expira em 5min (curto para revendedor casual). Envia email se SMTP/Resend configurado. |
| Reset password (User+Student) | `src/app/(auth)/reset-password/page.tsx`, `src/app/api/auth/reset-password/route.ts` | OK | Funciona para User e Student. Sem invalidacao de sessoes ativas. |
| Alterar senha inicial obrigatoria | `src/app/alterar-senha-inicial/page.tsx`, `src/app/api/auth/alterar-senha-inicial/route.ts` | Bug | API so atualiza User, nao Student. Se Student tiver `mustChangePassword=true` o flow quebra. (Student nao tem essa coluna no schema, mas a UI nao checa role.) |
| Registro revendedor (publico) | `src/app/(main)/seja-revendedor/checkout/page.tsx`, `src/app/api/revendedores/cadastro/route.ts` | OK | Cria Asaas customer+subscription. Sem mensagem clara se Asaas falhar no meio (retorna 502 generico). Senha do owner cobrada em ate 5min de token. |
| Logout | `src/app/logout/page.tsx` | OK | (presumido — arquivo existe) |

### `admin` — Painel admin master

| Feature | Arquivo | Estado | Notas |
|---|---|---|---|
| Dashboard global | `src/app/admin/page.tsx`, `src/app/api/admin/dashboard/route.ts` | OK | Calculos de MRR/ARR/crescimento corretos. |
| Revendedores (lista) | `src/app/admin/revendedores/page.tsx`, `src/app/api/admin/revendedores/route.ts` | OK | Escopo por PMB_RESELLER_MGR funciona. Filtros por status. |
| Criar novo revendedor | mesmo arquivo (POST) | OK | Cria customer+subscription Asaas, envia email com senha temporaria. Falha email nao bloqueia criacao. |
| Detalhe revendedor | `src/app/admin/revendedores/[id]/page.tsx` | OK | |
| Comissoes do revendedor | `src/app/admin/revendedores/[id]/comissoes/page.tsx` | OK | |
| Impersonar revendedor | `src/app/api/admin/revendedores/[id]/impersonate/route.ts` | OK | Backup de JWT no cookie. Sem logging de impersonation events. |
| Editar % indicacao do revendedor | `src/app/api/admin/tenants/[id]/referral-percent/route.ts` | OK | Sem AuditLog. |
| Equipe PMB | `src/app/admin/equipe/page.tsx`, `src/app/api/admin/equipe/route.ts` | OK | Convite por email funcional. `passwordHash=""` marca pending. |
| Detalhe membro equipe | `src/app/admin/equipe/[id]/page.tsx` | OK | |
| Vendas diretas (dashboard) | `src/app/admin/vendas/page.tsx` | OK | Filtrado por role. |
| Nova venda direta | `src/app/admin/vendas/nova/page.tsx`, `src/app/api/admin/vendas/route.ts` | OK | Verifica cap de 50% para PMB_SALES. |
| Cupons vitrine PMB | `src/app/admin/vendas/cupons/page.tsx`, `src/app/api/admin/cupons/route.ts` | OK | |
| Alunos da vitrine PMB | `src/app/admin/vendas/alunos/page.tsx` | OK | |
| Alunos global (todos) | `src/app/admin/alunos/page.tsx`, `src/app/api/admin/alunos/global/route.ts` | OK | Filtra por tenant. |
| Vincular curso a aluno (admin) | `src/app/api/admin/alunos/[id]/cursos/route.ts` | OK | Integra com plataforma parceira. |
| Bloquear/desbloquear aluno | `src/app/api/admin/alunos/[id]/bloquear/route.ts` | OK (presumido) | |
| Catalogo master | `src/app/admin/catalogo/page.tsx`, `src/app/api/admin/catalogo/sync/route.ts` | OK | Sync manual + cron. |
| Financeiro | `src/app/admin/financeiro/page.tsx`, `src/app/api/admin/financeiro/*` | OK | Tabs: tenant-payments + referral-payouts. |
| Marcar tenant-payment como pago manualmente | `src/app/api/admin/financeiro/tenant-payments/[id]/mark-paid/route.ts` | OK | Sem AuditLog. |
| Indicacoes (visao global) | `src/app/admin/indicacoes/page.tsx` | OK | |
| Comissoes (lista) | `src/app/admin/indicacoes/comissoes/page.tsx` | OK | |
| Saques (pagamentos) | `src/app/admin/indicacoes/saques/page.tsx` | OK | Marcar pago manualmente OK. |
| Relatorios | `src/app/admin/relatorios/page.tsx`, `src/app/api/admin/relatorios/[type]/route.ts` | OK | 14 reports definidos, 14 runners implementados, exporta CSV/JSON. |
| Certificados (lista) | `src/app/admin/certificados/page.tsx`, `src/app/api/admin/certificates/route.ts` | OK | |
| Emitir certificado manual | `src/app/admin/certificados/emitir/page.tsx` | OK (presumido) | |
| Configuracoes certificados | `src/app/admin/certificados/configuracoes/page.tsx` | OK | |
| Analytics | `src/app/admin/analytics/page.tsx`, `src/app/api/admin/analytics/route.ts` | OK | |
| Configuracoes globais | `src/app/admin/configuracoes/page.tsx` | OK | Teste de Asaas/MP/Plataforma funciona. |
| Configuracoes indicacoes | `src/app/admin/configuracoes/indicacoes/page.tsx` | OK | |
| Notificacoes admin | `src/app/admin/notificacoes/page.tsx` | OK | |
| Meu perfil | `src/app/admin/meu-perfil/page.tsx`, `src/app/api/admin/me/route.ts` | OK | |

### `painel` — Painel revendedor

| Feature | Arquivo | Estado | Notas |
|---|---|---|---|
| Dashboard | `src/app/painel/page.tsx` | OK | |
| Cursos | `src/app/painel/cursos/page.tsx`, `src/app/api/painel/cursos/route.ts` | OK | `ensureTenantCourses` cria TenantCourse para todo curso ATIVO global. |
| Alunos | `src/app/painel/alunos/page.tsx`, `src/app/api/painel/alunos/route.ts` | OK | |
| Cupons | `src/app/painel/cupons/page.tsx`, `src/app/api/painel/cupons/route.ts` | OK | Cap por consultor (maxDiscount) respeitado. |
| Financeiro | `src/app/painel/financeiro/page.tsx`, `src/app/api/painel/financeiro/route.ts` | OK | Export CSV funciona. |
| Vitrine (config) | `src/app/painel/vitrine/page.tsx`, `src/app/api/painel/vitrine/*` | OK | Upload de logo/banner funciona. |
| Dominio | `src/app/painel/dominio/page.tsx`, `src/app/api/painel/dominio/*` | OK | Integra Vercel API. |
| Configuracoes (Conta+Pagamento+Seguranca) | `src/app/painel/configuracoes/page.tsx` | Bug | **Nao tem cadastro de PIX**, embora a pagina de indicacoes mande o revendedor cadastrar la. Sem campo para WhatsApp/Instagram/Facebook (esses vivem so no painel/vitrine). |
| Conectar Mercado Pago | `src/app/api/painel/config/connect-mp/route.ts` | OK | Token cifrado AES-256-GCM. Nao usa OAuth Connect. |
| Onboarding wizard | `src/app/painel/onboarding/page.tsx`, `src/app/api/painel/onboarding/route.ts` | Bug | **Wizard nao captura nada** — so mostra texto. POST so flipa tenant para ACTIVE no passo 5. Estado nao persiste — ao sair e voltar, comeca do zero. |
| Equipe (consultores) | `src/app/painel/equipe/page.tsx`, `src/app/api/painel/equipe/route.ts` | Bug | Consultor convidado nao consegue logar como reseller (ver FUNC-P0-003). |
| Vendas diretas | `src/app/painel/vendas/page.tsx`, `src/app/api/painel/vendas/route.ts` | OK | |
| Nova venda direta | `src/app/painel/vendas/nova/page.tsx` | OK | |
| Certificados | `src/app/painel/certificados/page.tsx` | OK | |
| Indicacoes | `src/app/painel/indicacoes/page.tsx` | Parcial | Demonstrativo PDF funciona; link "Cadastrar PIX" leva a pagina sem o form. |
| Indicacoes materiais | `src/app/painel/indicacoes/materiais/page.tsx` | OK (presumido) | |
| Indicacoes sacar | `src/app/painel/indicacoes/sacar/page.tsx` | Removida | Redireciona para /painel/indicacoes — endpoint POST retorna 410 GONE. |
| Notificacoes | `src/app/painel/notificacoes/page.tsx` | OK | |

### `aluno` — Painel do aluno

| Feature | Arquivo | Estado | Notas |
|---|---|---|---|
| Dashboard | `src/app/aluno/page.tsx` | OK | |
| Cursos | `src/app/aluno/cursos/page.tsx` | OK | Sincroniza progresso ao abrir. |
| Comprar curso | `src/app/aluno/comprar/page.tsx`, `src/app/api/aluno/comprar/route.ts` | OK | Reutiliza customer Asaas existente. |
| Pagamentos | `src/app/aluno/pagamentos/page.tsx` | OK | |
| Certificados | `src/app/aluno/certificados/page.tsx`, `src/app/api/student/certificates/[id]/download/route.ts` | OK | Gera PDF on-demand se ausente. |
| Perfil | `src/app/aluno/perfil/page.tsx`, `src/app/api/aluno/perfil/route.ts` | OK | Sincroniza com plataforma parceira. |
| Senha do aluno | `src/components/aluno/student-password-form.tsx`, `src/app/api/aluno/senha/route.ts` | OK | |
| Notificacoes | `src/app/aluno/notificacoes/page.tsx` | OK | |

### `loja` — Vitrine multi-tenant

| Feature | Arquivo | Estado | Notas |
|---|---|---|---|
| Home loja | `src/app/loja/page.tsx` | OK | Mistura tenant curado + global. |
| Curso detail | `src/app/loja/curso/[slug]/page.tsx` | OK | Falls back para WhatsApp se MP nao configurado. |
| Checkout aluno (subdominio) | `src/app/loja/checkout/page.tsx`, `src/app/api/loja/checkout/route.ts` | OK | Cria enrollment + MP preference/preapproval. |
| Validar cupom (publico) | `src/app/api/loja/cupom/validar/route.ts` | OK | |
| Confirmacao | `src/app/loja/confirmacao/page.tsx` | OK | |
| Suspended | `src/app/loja/suspended/page.tsx` | OK | |

### `(main)` — Site institucional PMB

| Feature | Arquivo | Estado | Notas |
|---|---|---|---|
| Landing publica | `src/app/(main)/page.tsx` | OK | |
| Seja revendedor (landing) | `src/app/(main)/seja-revendedor/page.tsx` | OK | |
| Cursos (catalogo publico) | `src/app/(main)/cursos/page.tsx` | OK | |
| Curso detalhe | `src/app/(main)/cursos/[slug]/page.tsx` | OK | |
| Categoria (redirect) | `src/app/(main)/categoria/[slug]/page.tsx` | OK | |
| Checkout publico PMB | `src/app/(main)/checkout/page.tsx`, `src/app/api/checkout/route.ts` | OK | |
| Confirmacao checkout | `src/app/(main)/checkout/confirmacao/page.tsx` | OK (presumido) | |
| Sobre | `src/app/(main)/sobre/page.tsx` | OK | "50 mil alunos formados" — verificar se nao e exagero falso. |
| Contato | `src/app/(main)/contato/page.tsx` | **Bug P0** | Form de contato envia campos `nome/email/telefone/mensagem` para `/api/leads` que so aceita `email/companyName/phone`. **Toda submissao falha com 400.** Phone tambem placeholder `(11) 4000-0000`. |
| Ajuda | `src/app/(main)/ajuda/page.tsx` | OK | WhatsApp placeholder. |
| Certificado (info) | `src/app/(main)/certificado/page.tsx` | Parcial | Menciona PNG para redes sociais mas so PDF e gerado. |
| Como funciona | `src/app/(main)/como-funciona/page.tsx` | OK (presumido) | |
| Reembolso | `src/app/(main)/reembolso/page.tsx` | OK (presumido) | |
| Termos | `src/app/(main)/termos/page.tsx` | OK | Carrega Markdown. |
| Privacidade | `src/app/(main)/privacidade/page.tsx` | OK | Carrega Markdown. |
| Contrato revenda | `src/app/(main)/contrato-de-revenda/page.tsx` | OK | |

### `livrecursos` — Landing captacao

| Feature | Arquivo | Estado | Notas |
|---|---|---|---|
| Landing | `src/app/livrecursos/page.tsx` | OK | Formulario de interesse OK. |
| Captura ref | `src/app/api/public/capture-ref/route.ts` | OK | Cookie referral. |
| Form interesse | `src/components/main/formulario-interesse.tsx` | OK | TODO no codigo: nao persiste interesse/cidade. |

### `validar` — Validacao publica de certificados

| Feature | Arquivo | Estado | Notas |
|---|---|---|---|
| Validar pagina | `src/app/validar/[code]/page.tsx` | OK | UI bonita, suporta revogados. |

### APIs (webhooks/cron/internal)

| Endpoint | Estado | Notas |
|---|---|---|
| `POST /api/webhooks/asaas` | OK | Token via header, retorna 200 imediato. |
| `POST /api/webhooks/mercadopago` | OK | Suporta subscription_authorized_payment. |
| `GET/POST /api/cron/sync-cursos` | OK | Listado em vercel.json (9h diario). |
| `GET/POST /api/cron/sync-progresso` | OK | Listado em vercel.json (7h diario). |
| `GET/POST /api/cron/referral-monthly-payout` | OK | Listado em vercel.json (dia 20 5h). |
| `GET/POST /api/cron/sweep-tenants-overdue` | **Bug P1** | **NAO esta em vercel.json — nao roda automatico.** |
| `GET/POST /api/cron/sweep-students-overdue` | **Bug P1** | **NAO esta em vercel.json.** |
| `GET/POST /api/cron/reactivate-paid` | **Bug P1** | **NAO esta em vercel.json.** |
| `POST /api/leads` | OK | Salva lead + notifica vendas. |
| `GET /api/internal/resolve-tenant` | OK | Protegido por `INTERNAL_SECRET`. |
| `POST /api/public/capture-ref` | OK | Cookie de referral. |
| `POST /api/public/validate-ref` | OK (presumido) | |

---

## Bugs e lacunas detalhados

### [FUNC-P0-001] Formulario `/contato` envia campos incompativeis com API
**Onde:** `src/app/(main)/contato/page.tsx` + `src/app/api/leads/route.ts`
**Tipo:** Bug
**Descricao:** O formulario HTML em `/contato` submete `nome`, `email`, `telefone`, `mensagem` para `/api/leads`. Mas `leadSchema` em `/api/leads/route.ts` valida `email + companyName + phone` (campo `companyName`, nao `nome`). Toda submissao recebe HTTP 400 `VALIDATION_ERROR`. Nao temos coleta de leads do principal canal de suporte/atendimento.
**Como detectado:** Inspecao direta do form `<form action="/api/leads" method="post">` com `name="nome"` versus o Zod schema da API.
**Correcao sugerida:** Trocar o form para um Client Component que renomeia os campos e adicione `mensagem` no schema (estender o model `Lead.message`), OU criar `/api/contato` separado.
**Esforco:** S

### [FUNC-P0-002] Onboarding wizard nao captura dado nenhum
**Onde:** `src/app/painel/onboarding/page.tsx`, `src/components/painel/onboarding-wizard.tsx`, `src/app/api/painel/onboarding/route.ts`
**Tipo:** Lacuna
**Descricao:** O wizard de 5 passos so exibe texto pedindo para o revendedor "abrir a aba Configuracoes" / "abrir Vitrine -> Dominio" / etc. Nao tem nenhum input. A unica acao do POST e setar `tenant.status = ACTIVE` no passo 5. Resultado: o tenant fica ativo mesmo sem ter configurado vitrine/dominio/MP. O CLAUDE.md fala "Prepare sua vitrine em 5 passos rapidos" mas o passo 2 diz "vamos preparar em 4 passos". Tambem nao salva qual passo o usuario chegou, entao se sair, volta para o passo 1.
**Como detectado:** Leitura do componente — toda etapa intermediaria so renderiza texto.
**Correcao sugerida:** Reescrever wizard com forms embutidos (dados pessoais, dominio, vitrine basica) que persistem cada etapa. Adicionar coluna `tenant.onboardingStep`.
**Esforco:** L

### [FUNC-P0-003] Consultor (TenantMember) nao acessa painel
**Onde:** `src/app/api/painel/equipe/route.ts` (POST cria User com role=RESELLER mas sem tenantId), `src/lib/auth.ts` (jwt nao popula tenantId via membership), `src/lib/auth/reseller-session.ts`
**Tipo:** Bug
**Descricao:** Quando o owner de um tenant convida um consultor, o codigo cria um `User` com `role=RESELLER, passwordHash="", status=ATIVO` e SEM `tenantId` setado. Cria `TenantMember(role=consultant)`. No JWT, `tenantId = user.tenantId = null`. Em `requireResellerSession` exige `session.user.tenantId` — retorna null. Consequencia: consultor convidado nunca acessa o painel. Bug ja documentado em CLAUDE.md ("Consultor (TenantMember) nao popula session.user.tenantId no JWT").
**Como detectado:** Cruzamento de `painel/equipe/route.ts` (POST) com `lib/auth.ts` (callback jwt).
**Correcao sugerida:** No callback `jwt`, quando role=RESELLER e tenantId=null, fazer lookup de TenantMember(status=ATIVO).first() e popular tenantId. Adicionar tambem `memberRole` no token para distinguir owner vs consultant.
**Esforco:** M

### [FUNC-P0-004] PIX do revendedor sem UI de cadastro
**Onde:** `src/app/painel/configuracoes/page.tsx` (sem campo PIX), `src/app/api/painel/config/route.ts` (PUT nao aceita pixKey)
**Tipo:** Lacuna
**Descricao:** A pagina `/painel/indicacoes` exibe banner com botao "Cadastrar PIX" linkando para `/painel/configuracoes`. Mas a aba Configuracoes (`ConfigTabs`) so tem Conta/Pagamento/Seguranca, sem nenhum campo de PIX. O endpoint PUT `/api/painel/config` so aceita `name/email/companyName`. O cron `referral-monthly-payout` chama API Asaas /transfers que requer PIX; sem PIX cadastrado, comissoes ficam pendentes indefinidamente.
**Como detectado:** A consulta `tenant.pixKey/pixKeyType` aparece so em `painel/indicacoes/page.tsx` (leitura) e `referral-payout-form.tsx` (form do endpoint descontinuado). Nenhum form atual permite escrita.
**Correcao sugerida:** Adicionar aba "PIX" em ConfigTabs (ou seccao em Conta) que faz PATCH `/api/painel/config` com `pixKey + pixKeyType` (validar tipo).
**Esforco:** M

### [FUNC-P0-005] Crons sweep/reactivate sem agendamento em vercel.json
**Onde:** `vercel.json`, `src/app/api/cron/sweep-tenants-overdue/route.ts`, `src/app/api/cron/sweep-students-overdue/route.ts`, `src/app/api/cron/reactivate-paid/route.ts`
**Tipo:** Lacuna critica
**Descricao:** Tres endpoints de cron implementados mas nao agendados. O modulo do `lib/auto-block.ts` so e chamado pelos webhooks PAYMENT_OVERDUE/RECEIVED. Se webhook do Asaas falhar (rede, dedupe, latencia), tenant fica `ACTIVE` mas devendo, ou `SUSPENDED` mas ja pagou. CLAUDE.md cita esses crons mas nao foram adicionados ao vercel.json.
**Como detectado:** Comparacao direta — vercel.json so tem 3 entradas; existem 6 pastas em `src/app/api/cron/`.
**Correcao sugerida:** Adicionar entradas:
```json
{ "path": "/api/cron/sweep-tenants-overdue",  "schedule": "0 3 * * *" },
{ "path": "/api/cron/sweep-students-overdue", "schedule": "30 3 * * *" },
{ "path": "/api/cron/reactivate-paid",        "schedule": "0 4 * * *" }
```
**Esforco:** S

### [FUNC-P0-006] Cron sync-cursos diverge do CLAUDE.md
**Onde:** `vercel.json` (schedule 0 9 * * *), CLAUDE.md menciona "cron diario 6h"
**Tipo:** Inconsistencia
**Descricao:** Discrepancia de documentacao versus implementacao. Baixa criticidade — provavel update de horario nao refletido na doc.
**Correcao sugerida:** Atualizar CLAUDE.md.
**Esforco:** XS

### [FUNC-P1-007] Telefones e redes sociais com placeholders no site publico
**Onde:** `src/components/shared/layouts/footer-main.tsx`, `src/app/(main)/contato/page.tsx`, `src/app/(main)/ajuda/page.tsx`
**Tipo:** Bug visual/contato
**Descricao:** WhatsApp listado como `(11) 4000-0000` em 3+ paginas. Links de Instagram/Facebook/YouTube apontam para `https://instagram.com`, `https://facebook.com`, `https://youtube.com` (homepages dos sites, nao do canal PMB). Vai expor incompetencia no go-live.
**Como detectado:** Strings literais no JSX.
**Correcao sugerida:** Centralizar contatos em `src/lib/branding.ts` ou env vars; substituir links.
**Esforco:** S

### [FUNC-P1-008] Endpoint `/api/cobranca/[paymentId]/pay-card` sem autenticacao
**Onde:** `src/app/api/cobranca/[paymentId]/pay-card/route.ts`
**Tipo:** Bug de seguranca
**Descricao:** Endpoint que processa cartao de credito (chama Asaas `/payments/{id}/payWithCreditCard`) e publico. Qualquer pessoa que descubra um paymentId pode tentar pagar. Embora precise dados de cartao validos, fica vulneravel a enumeracao e abuse. Sem rate limit.
**Como detectado:** Falta `requireSession`/`requireResellerSession` no handler.
**Correcao sugerida:** Validar que o request inclui um token assinado curto que so o aluno recebe por email/url, OU exigir sessao de aluno.
**Esforco:** M

### [FUNC-P1-009] Endpoint `/api/checkout/confirmacao/[id]/status` sem auth
**Onde:** `src/app/api/checkout/confirmacao/[id]/status/route.ts`
**Tipo:** Inconveniencia/exposicao
**Descricao:** GET publico — qualquer paymentId pode ter seu status lido. Pequeno risco de enumeracao. Tambem aceita request CORS implicitamente.
**Correcao sugerida:** Restringir por sessao do aluno OU exigir token oneshot.
**Esforco:** S

### [FUNC-P1-010] Sem AuditLog em mutacoes sensiveis
**Onde:** Multiplos: `tenants/[id]/referral-percent`, `tenant-payments/[id]/mark-paid`, `referral-payouts/[id]/mark-paid`, `tenants/[id]/policy`, `tenants/[id]/status`, `tenants/[id]/manager`, `equipe/[id]` (alteracao de role).
**Tipo:** Lacuna de compliance
**Descricao:** Mudancas que afetam dinheiro (alterar comissao, marcar pago) e seguranca (alterar role/gerente) nao tem log de auditoria. Falta modelo `AuditLog` no schema (verificado: nao existe). Em caso de disputa, nao da para auditar quem fez o que.
**Correcao sugerida:** Criar modelo `AuditLog { id, actorUserId, action, targetType, targetId, beforeJson, afterJson, ip, ua, createdAt }`. Helper `logAudit()` chamado em todos os endpoints sensiveis.
**Esforco:** M

### [FUNC-P1-011] Sem rate limiting em endpoints publicos
**Onde:** Todos: `/api/leads`, `/api/auth/forgot-password`, `/api/checkout`, `/api/loja/checkout`, `/api/loja/cupom/validar`, `/api/public/capture-ref`, `/api/revendedores/cadastro`.
**Tipo:** Bug de seguranca
**Descricao:** Nenhum endpoint publico tem throttling. `/api/leads` aceita posts ilimitados — qualquer bot enche o banco. `/api/auth/forgot-password` permite enumeracao acelerada de emails. `/api/loja/cupom/validar` permite brute-force de codigos. Upstash Redis ja esta configurado — perfeito para rate-limit, mas nao e usado.
**Correcao sugerida:** Adicionar `@upstash/ratelimit` em endpoints expostos: 5/min para leads, 3/min para forgot-password, 10/min para validate-cupom.
**Esforco:** M

### [FUNC-P1-012] Sem CSRF protection explicita
**Onde:** Todos POST/PATCH/DELETE de paginas autenticadas.
**Tipo:** Bug de seguranca
**Descricao:** NextAuth ja faz CSRF para auth, mas demais rotas (`/api/painel/*`, `/api/admin/*`) confiam apenas no cookie de sessao. Mitigacao parcial via `sameSite=lax` no cookie de sessao, mas para acoes mutacoes sensiveis o ideal seria validar origin/refer ou token CSRF.
**Correcao sugerida:** Helper `requireSameOrigin(req)` em middlewares de rotas mutativas.
**Esforco:** M

### [FUNC-P1-013] "Lembrar-me" inutil no login
**Onde:** `src/components/auth/login-form.tsx:141`
**Tipo:** Bug de UX
**Descricao:** Checkbox "Lembrar-me neste dispositivo" no LoginForm nao tem `name`, `value` ou `onChange`. Nao envia nada para o servidor, nao afeta duracao do JWT. Promessa quebrada.
**Correcao sugerida:** Remover OU passar `rememberMe` como callback URL param e prolongar JWT.
**Esforco:** XS

### [FUNC-P1-014] `Alterar senha inicial` so funciona para User, nao Student
**Onde:** `src/app/api/auth/alterar-senha-inicial/route.ts`
**Tipo:** Bug
**Descricao:** Hardcoded `prisma.user.update`. Schema `Student` nao tem `mustChangePassword`, mas se a UI vier a forcar o student por outra logica, o endpoint quebra.
**Correcao sugerida:** Confirmar invariante (Student nunca cai aqui) ou ramificar baseado em role.
**Esforco:** XS

### [FUNC-P1-015] Sem cookie consent / banner LGPD
**Onde:** Nenhum.
**Tipo:** Lacuna LGPD
**Descricao:** Nao ha banner de consentimento de cookies. Politica de Privacidade existe em `/privacidade` (markdown). LGPD exige opt-in explicito para cookies nao-essenciais (analytics, marketing). Sem banner, possivel multa do Senacon/ANPD.
**Correcao sugerida:** Componente client `CookieBanner` no root layout com 3 opcoes (aceitar/rejeitar/personalizar). Persistir em cookie httponly.
**Esforco:** M

### [FUNC-P1-016] Sem 2FA opcional para admins
**Onde:** Nenhum.
**Tipo:** Lacuna de seguranca
**Descricao:** Sem TOTP, SMS, ou hardware keys. SUPER_ADMIN tem poder total (impersonacao, alterar % comissao, marcar pagamento) — uma credencial vazada e catastrofe.
**Correcao sugerida:** Implementar TOTP via `otplib` para roles PMB_*.
**Esforco:** L

### [FUNC-P1-017] Sem opt-out de email para alunos/revendedores
**Onde:** `src/app/api/notifications/preferences/route.ts` existe mas e fora do alcance LGPD (so notificacoes in-app).
**Tipo:** Lacuna LGPD
**Descricao:** O modelo `NotificationPreference` so controla preferencias dentro do app. Nao ha unsubscribe link em emails transacionais nem opt-out de emails de marketing. CAN-SPAM/LGPD exige.
**Correcao sugerida:** Adicionar `unsubscribeToken` por usuario, link em footer de cada email.
**Esforco:** M

### [FUNC-P1-018] Pagina de certificado promete PNG que nao existe
**Onde:** `src/app/(main)/certificado/page.tsx:29`
**Tipo:** Bug de promessa
**Descricao:** Texto: "Baixe o arquivo em PDF... ou em PNG para suas redes sociais". So existe geracao de PDF (`generateAndUploadPdf`). Aluno entra esperando PNG, nao acha botao.
**Correcao sugerida:** Remover mencao a PNG OU implementar geracao via `puppeteer.screenshot`.
**Esforco:** S (remover texto) / M (gerar PNG)

### [FUNC-P1-019] Sem pagina 404 / error.tsx / global-error customizadas
**Onde:** Nao existem `src/app/not-found.tsx`, `error.tsx`, `global-error.tsx`.
**Tipo:** Lacuna de UX
**Descricao:** URLs erradas mostram o 404 default do Next sem identidade visual. Erros 500 idem.
**Correcao sugerida:** Adicionar `not-found.tsx` e `error.tsx` com identidade PMB.
**Esforco:** S

### [FUNC-P1-020] Sem sitemap.xml / robots.txt
**Onde:** Nao existem `src/app/sitemap.ts`, `src/app/robots.ts`.
**Tipo:** Lacuna SEO
**Descricao:** Crawler nao tem mapa do site. Catalogo de cursos publicos invisivel para o Google indexar individualmente. Sem `robots.txt` para sinalizar disallow em `/admin/*`, `/painel/*`, `/aluno/*`, `/api/*`.
**Correcao sugerida:** Criar `sitemap.ts` listando rotas estaticas + cursos dinamicos. `robots.ts` com disallow das rotas protegidas.
**Esforco:** S

### [FUNC-P2-021] OG image / Twitter cards ausentes
**Onde:** `src/app/layout.tsx` (metadata) — `openGraph` tem so type/siteName/locale, sem images.
**Tipo:** Lacuna de SEO/social
**Descricao:** Compartilhamento em redes sociais nao gera card visual. Sem `images:` em OG, sem twitter card.
**Correcao sugerida:** Criar `src/app/opengraph-image.tsx` com Image Generation, ou estaticos em `public/og-default.png`.
**Esforco:** S

### [FUNC-P2-022] Sem fluxo OAuth Mercado Pago Connect
**Onde:** `src/app/api/painel/config/connect-mp/route.ts`
**Tipo:** UX / robustez
**Descricao:** O revendedor cola manualmente o `access_token` do MP. Risco enorme — usuario nao tecnico nao sabe gerar isso. MP oferece "Connect" OAuth (split payments inclusive). Sem OAuth, conta MP do revendedor pode ser revogada sem aviso.
**Correcao sugerida:** Implementar redirect OAuth `/auth/mp` -> MP -> callback que troca code por access+refresh.
**Esforco:** L

### [FUNC-P2-023] Form de interesse nao persiste cidade / interesse
**Onde:** `src/components/main/formulario-interesse.tsx:38`
**Tipo:** Lacuna marcada com TODO
**Descricao:** Campo "interesse" (profissionaliza vs profissionaliza+tecnico) e "cidade/estado" sao coletados na UI mas descartados — API so persiste email/companyName/phone.
**Correcao sugerida:** Extender model Lead com colunas opcionais + ajustar Zod schema.
**Esforco:** S

### [FUNC-P2-024] Comentario `// TODO: implementar saldo negativo`
**Onde:** `src/lib/referrals/commission.ts:184`
**Tipo:** Edge case
**Descricao:** Comentario diz que reembolsos deveriam gerar comissao negativa, nao implementado. Se aluno indicado pedir reembolso, comissao paga ao indicador nao retorna.
**Correcao sugerida:** Quando webhook gera `Payment.refunded=true`, criar `ReferralCommission` com `amount<0`.
**Esforco:** M

### [FUNC-P2-025] Logo do Grupo Bolsa Mais Brasil exigido em todos os certificados
**Onde:** `src/lib/certificates/template-resolver.ts:26`
**Tipo:** UX deformidade
**Descricao:** Se admin nao subir `groupLogoUrl`, o certificado e gerado sem o logo do grupo (fallback estatico). Comportamento documentado mas pode confundir.
**Correcao sugerida:** Forcar upload na primeira config + erro 400 se ainda nao tiver.
**Esforco:** S

### [FUNC-P2-026] Sem 2FA / verificacao para impersonacao
**Onde:** `src/app/api/admin/revendedores/[id]/impersonate/route.ts`
**Tipo:** Seguranca/compliance
**Descricao:** SUPER_ADMIN/PMB_RESELLER_MGR pode entrar como qualquer revendedor sem confirmar nada. Sem log de inicio/fim. Sem aviso por email para o owner do tenant.
**Correcao sugerida:** Banner ja existe — somar log na AuditLog + envio de email automatico ao tenant owner.
**Esforco:** S

### [FUNC-P2-027] Sem chat / contato whatsapp embutido para suporte ao usuario logado
**Onde:** Nenhuma pagina logada tem widget de suporte.
**Tipo:** Lacuna UX
**Descricao:** Aluno/revendedor com duvida tem que sair do app e ir para `/contato`. Nao ha chat (Tawk.to/Crisp), nem deeplink `wa.me` parametrizado por contexto.
**Correcao sugerida:** Botao flutuante com `wa.me/{phone}?text={contexto}` em layouts /aluno e /painel.
**Esforco:** S

### [FUNC-P2-028] Sem template de email "boas-vindas ao aluno"
**Onde:** `src/lib/email/mailer.ts` (templates: welcome, reset-password, enrollment, payment, lead-confirmation, invite, reseller-onboarding, student-welcome)
**Tipo:** Verificar
**Descricao:** Template `student-welcome` existe mas precisa verificar se e disparado em `provisionStudentAccess`. Conferi `src/lib/students/access.ts` — disparo ocorre, mas sem garantia de retry em falha.
**Esforco:** N/A — investigar.

### [FUNC-P2-029] Painel onboarding com info "5 passos" vs UI "4 passos"
**Onde:** `src/components/painel/onboarding-wizard.tsx:134` ("4 passos") versus PageHeader "5 passos" em `src/app/painel/onboarding/page.tsx`
**Tipo:** Inconsistencia copy
**Esforco:** XS

### [FUNC-P2-030] Manifest.webmanifest e service worker registrados sem oferecer offline real
**Onde:** `public/sw.js` + `public/manifest.webmanifest`
**Tipo:** Verificar
**Descricao:** O app esta marcado como PWA. Precisa validar se o sw.js realmente cacheia, ou se sera fonte de bugs de cache stale.
**Esforco:** S — investigar.

### [FUNC-P2-031] `/admin/configuracoes` PIX e payout config separados de `/admin/configuracoes/indicacoes`
**Onde:** Multiplas rotas
**Tipo:** UX
**Descricao:** Settings espalhados — sub-config indicacoes vive em `/admin/configuracoes/indicacoes`, sub-config certificados foi unificada em `/admin/certificados/configuracoes` (com redirect na rota antiga). Decisao mista — usuario pode se perder.
**Esforco:** M (consolidar)

### [FUNC-P2-032] `Lead` nao tem campo `message`
**Onde:** Schema Prisma `model Lead`
**Tipo:** Lacuna
**Descricao:** Lead so guarda email/companyName/phone (e UTM via referrer cookie talvez). Sem campo livre para o conteudo da mensagem do `/contato` ou do "Por que voce quer ser revendedor?".
**Correcao sugerida:** `message String?` em `Lead`.
**Esforco:** S

### [FUNC-P3-033] Mock de cursos/depoimentos hardcoded
**Onde:** `src/components/main/home/testimonials.tsx`
**Tipo:** Honestidade publicitaria
**Descricao:** Depoimentos com nome/cidade especificos. Verificar se sao reais ou fabricados.
**Esforco:** N/A

### [FUNC-P3-034] Numero "50 mil alunos formados" hardcoded
**Onde:** `src/app/(main)/sobre/page.tsx:34`
**Tipo:** Honestidade publicitaria
**Descricao:** Se for falso/exagerado, viola CDC arts 36-38.
**Esforco:** N/A

### [FUNC-P3-035] Resend hardcoded `from: "Profissionaliza Mais Brasil <bem-vindo@bmbr.com.br>"`
**Onde:** `src/lib/email/mailer.ts:163`
**Tipo:** Configuracao
**Descricao:** Domain `bmbr.com.br` (Grupo Bolsa Mais Brasil) — verificar SPF/DKIM no DNS. Se nao configurado, emails caem em spam.
**Esforco:** S — DevOps.

### [FUNC-P3-036] Footer com social placeholder
**Onde:** `src/components/shared/layouts/footer-main.tsx:81-99`
**Tipo:** Bug de UX
**Descricao:** Ja coberto em FUNC-P1-007.

### [FUNC-P3-037] Aluno "Lembrar-me" / persistencia de sessao
**Onde:** Mesmo de FUNC-P1-013.
**Tipo:** Duplicado.

### [FUNC-P3-038] Pagina `/aluno/cursos` sincroniza progresso a cada GET — risco de N+1 calls
**Onde:** `src/app/aluno/cursos/page.tsx:32`
**Tipo:** Performance
**Descricao:** Cada visita a /aluno/cursos chama `syncStudentProgress` (best-effort). Em horario de pico de cobranca, muitos alunos podem causar 1 call para plataforma por request. Sem cache.
**Correcao sugerida:** Cache de 5min em Redis: `student_progress:{id}` (igual padrao tenant).
**Esforco:** M

### [FUNC-P3-039] Endpoint `/api/admin/end-impersonation` aceita POST sem CSRF check
**Onde:** `src/app/api/admin/end-impersonation/route.ts`
**Tipo:** Seguranca menor
**Descricao:** Atacante com CSRF poderia forcar admin a sair de impersonacao (impacto baixo, mas viola principle of least surprise).
**Esforco:** XS

---

## Resumo executivo

A plataforma esta funcional para o caminho feliz: aluno compra na vitrine, webhook MP confirma, plataforma parceira matricula, certificado e emitido. Admin tem dashboard, relatorios e financeiro completos. Webhook + cron criticos funcionam.

**Mas 5 buracos travam o lancamento sem retrabalho:**
1. `/contato` quebrado — captacao do principal canal de suporte fica zerada
2. Onboarding do revendedor virtual — tenant fica `ACTIVE` sem nada configurado
3. Consultor convidado nao loga
4. PIX do revendedor sem UI — cron de comissao mensal nao paga ninguem
5. Crons de inadimplencia / reativacao nao agendados — sistema fica inconsistente se webhook falhar uma vez

**E ~15 lacunas P1-P2 importantes mas nao impeditivas:**
- Sem rate limiting em endpoints publicos
- Sem AuditLog em mutacoes sensiveis (compliance/disputa)
- Sem 2FA para admins
- Sem cookie consent (risco LGPD)
- Sem 404/error.tsx, sitemap, robots, OG image
- Endpoints publicos sensiveis sem auth (pay-card, status)
- Placeholders em telefones/social

Recomendacao: corrigir os 5 P0 antes do lancamento. Os P1 podem entrar em sprint pos-launch, em ordem de seguranca/compliance.
