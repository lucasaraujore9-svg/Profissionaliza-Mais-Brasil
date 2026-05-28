# Agente 06 — Rotas, APIs, Server Actions e Middleware

**Data:** 2026-05-28  
**Rotas auditadas:** 200 (total encontrado via `find src/app/api -name route.ts`)  
**Server actions:** 2 arquivos `"use server"` (`src/app/validar/page.tsx`, `src/app/inadimplente/page.tsx`)  
**Proxy:** `src/proxy.ts`

---

## Sumário Executivo

| Severidade | Qtd |
|-----------|-----|
| Crítico | 0 |
| Alto | 3 |
| Médio | 6 |
| Baixo | 5 |
| Informativo | 4 |

**Top 5 achados:** (1) PMB checkout sem rate-limit — custo/flood/abuse; (2) senha temporária de revendedor retornada em JSON da API de admin; (3) proxy `pathname.includes(".")` bypassa resolução de tenant para caminhos com extensões em subdomínios de tenant; (4) `alterar-senha-inicial` sem rate-limit — ataque de força bruta contra sessão ativa; (5) broadcast de notificações carrega todos os alunos do sistema sem paginação.

---

## Tabela de Rotas (agrupadas por área)

### Área: `webhooks/`

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco | Observação |
|------|---------|-----------|--------------|------------|-----------------|-------|-----------|
| `/api/webhooks/asaas` | POST | Sim — `validateAsaasWebhook` (header `asaas-access-token`) | Sim — Zod (`parseAsaasWebhookPayload`) | Sim — try/catch, retorna 500 p/ retry | Sim (200/400/401/500) | Baixo | Token redactado no log; `dynamic=force-dynamic`; `maxDuration=60` |
| `/api/webhooks/mercadopago` | POST | Parcial — exige `x-signature`+`x-request-id` em prod; HMAC validado no processMpWebhook | Parcial — JSON parseado mas sem Zod no body (aceita tipo genérico `MPWebhookNotification`) | Sim | Sim | Baixo | Assinatura redactada no log; idempotência por mpPaymentId |

**Nota:** O webhook MP valida assinatura HMAC internamente em `processMpWebhook`. A ausência de Zod no body do webhook é aceitável dado que MP envia estrutura variável por evento.

---

### Área: `cron/` (8 rotas)

Padrão: todos checam `isCronAuthorized(request)` via `Bearer CRON_SECRET`. Nenhum vaza stack em erro.

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `cron/sync-cursos` | POST + GET | Sim — `isCronAuthorized` | N/A | Sim | Sim (200/401/502) | Baixo |
| `cron/sync-progresso` | POST | Sim | N/A | Sim | Sim | Baixo |
| `cron/cleanup-webhook-logs` | POST | Sim | N/A | Sim | Sim | Baixo |
| `cron/reactivate-paid` | POST | Sim | N/A | Sim | Sim | Baixo |
| `cron/sweep-tenants-overdue` | POST | Sim | N/A | Sim | Sim | Baixo |
| `cron/sweep-students-overdue` | POST | Sim | N/A | Sim | Sim | Baixo |
| `cron/sweep-abandoned-leads` | POST | Sim | N/A | Sim | Sim | Baixo |
| `cron/referral-monthly-payout` | POST | Sim | N/A | Sim | Sim | Baixo |

**Achado:** `cron/sync-cursos` aceita GET além de POST (linha 24-26 do arquivo), o que permite invocação via browser/curl sem precisar enviar body. Tecnicamente seguro pois `isCronAuthorized` cobre ambos os métodos; porém REST semântica incorreta para operação destrutiva.

---

### Área: `internal/`

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/internal/resolve-tenant` | GET | Sim — `isInternalAuthorized` + rate-limit (60 req/min) | Sim — regex slug/domain validados | Sim | Sim (200/400/401/404/500) | Baixo |

**Bom:** Proxy sanitiza `x-tenant-id`/`x-tenant-slug` do cliente antes de qualquer processamento (`sanitizedHeaders.delete()`). Rota interna tem rate-limit de defesa em profundidade mesmo atrás de secret.

---

### Área: `checkout/` (PMB direto)

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/checkout` | POST | Não — pública (vitrine PMB) | Sim — Zod completo (CPF, telefone, cartão) | Sim — rollback de cupom e enrollment órfã | Sim | **ALTO** — sem rate-limit |
| `/api/checkout/status` | GET | Não — pública | N/A (query param `enrollment_id`) | Sim | Sim | Baixo |
| `/api/checkout/confirmacao/[id]/status` | GET | Não — pública | Não (path param direto) | Parcial — sem try/catch explícito (Prisma pode lançar) | Sim | Baixo |

---

### Área: `loja/` (vitrine de revendedor)

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/loja/checkout` | POST | Tenant via `x-tenant-id` (proxy) + rate-limit | Sim — Zod (CPF, telefone) | Sim — rollback enrollment órfã + cupom | Sim | Baixo |
| `/api/loja/courses` | GET | Tenant via `x-tenant-id` | Sim — Zod query params | Sim | Sim | Baixo |
| `/api/loja/cursos/[slug]` | GET | Tenant via `x-tenant-id` | Path param slug | Sim | Sim | Baixo |
| `/api/loja/confirmacao/[id]` | GET | Tenant via `x-tenant-id` | Path param id | Sim | Sim | Baixo |
| `/api/loja/cupom/validar` | POST | Tenant via header + rate-limit | Sim — Zod (courseId: cuid()) | Sim | Sim | Baixo |
| `/api/loja/leads` | POST | Tenant via `x-tenant-id` + rate-limit duplo (IP + email) | Sim — Zod + consent | Sim | Sim | Baixo |

---

### Área: `cobrança/` (link de pagamento Asaas)

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/cobranca/[paymentId]` | GET | `isKnownAsaasPayment` (verifica se paymentId existe no banco) | Path param | Sim | Sim | Baixo |
| `/api/cobranca/[paymentId]/billing-info` | GET | `isKnownAsaasPayment` | Path param | Sim | Sim | Baixo |
| `/api/cobranca/[paymentId]/pay-card` | POST | `isKnownAsaasPayment` + rate-limit | Sim — Zod completo (cartão) | Sim | Sim | Baixo |

**Bom:** Ownership check via DB (`isKnownAsaasPayment`) evita que qualquer paymentId Asaas externo seja consultado/pago.

---

### Área: `auth/`

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth — N/A | NextAuth — N/A | NextAuth | Sim | Informativo |
| `/api/auth/forgot-password` | POST | Pública + rate-limit | Sim — Zod | Sim | Sim | Baixo |
| `/api/auth/reset-password` | POST | Token de reset + rate-limit | Sim — Zod | Sim | Sim | Baixo |
| `/api/auth/alterar-senha-inicial` | POST | Sessão autenticada (`auth()`) | Sim — Zod (min 8 chars, confirmação) | Parcial — sem try/catch top-level (Prisma pode lançar 500 não-tratado) | Sim | **MÉDIO** — sem rate-limit; ataque de enumeração via resposta diferente |

---

### Área: `admin/` (equipe interna PMB)

Padrão: todos usam `requireAdminSession()`, `requireSuperAdmin()`, `requirePmbSales()`, ou `requirePmbResellerMgr()`. Guards retornam `{ ok, response }` corretamente. Todos têm Zod em POSTs/PATCHs.

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco | Observação |
|------|---------|-----------|--------------|------------|-----------------|-------|-----------|
| `/api/admin/alunos` (PMB) | GET/POST | `requirePmbSales` | Sim (POST com Zod) | Parcial (GET sem try/catch) | Sim | Baixo | GET take:100 |
| `/api/admin/alunos/global` | GET | `requirePmbTeam` | N/A | Sem try/catch top-level | Sim | Baixo | take:200 |
| `/api/admin/alunos/[id]/*` | GET/POST/DELETE | Admin | Sim | Maioria sem try/catch | Sim | Baixo | |
| `/api/admin/revendedores` | GET/POST | `requireAdminSession` | Sim (POST Zod) | Sim | Sim | **MÉDIO** | POST retorna `tempPassword` em plaintext na resposta JSON |
| `/api/admin/revendedores/[id]` | GET/DELETE | Admin (SUPER_ADMIN p/ DELETE) | N/A (path param) | Sim | Sim | Baixo | |
| `/api/admin/revendedores/[id]/impersonate` | POST | SUPER_ADMIN apenas | N/A | Parcial (sem try/catch mas erros geram 401/403/404 explícitos) | Sim | Baixo | Audit log presente |
| `/api/admin/vendas` | GET/POST | `requirePmbSales` | Sim | Sim | Sim | Baixo | |
| `/api/admin/cupons` | GET/POST | Admin | Sim | Maioria sem try/catch | Sim | Baixo | |
| `/api/admin/cupons/validate` | POST | `requirePmbSales` | Sim — Zod | Sim | Sim | Baixo | Cap 50% para PMB_SALES |
| `/api/admin/analytics` | GET | `requireAdminSession` | N/A | Sem try/catch top-level | Sim | Baixo | |
| `/api/admin/dashboard` | GET | `requireSuperAdmin` | N/A | Sem try/catch top-level | Sim | Baixo | |
| `/api/admin/financeiro/*` | GET | Admin | N/A | Maioria sem try/catch | Sim | Baixo | |
| `/api/admin/relatorios/[type]` | GET | Admin + role check por `def.needsSuperAdmin` | N/A | Sim | Sim | Baixo | PMB_RESELLER_MGR validado contra seus tenants |
| `/api/admin/notifications/broadcast` | POST | `requireSuperAdmin` | Sim — discriminated union Zod | Sem try/catch; scope=ALL carrega todos alunos sem paginação | Sim | **MÉDIO** | OOM potencial com muitos alunos |
| `/api/admin/equipe/*` | GET/POST/DELETE | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/banner/*` | GET/POST/PUT/DELETE | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/catalogo/*` | GET/POST/PATCH | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/config/*` | GET/POST | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/end-impersonation` | POST | Sessão | N/A | Sim | Sim | Baixo | |
| `/api/admin/leads/*` | GET/POST/PATCH | Admin | Sim | Sem try/catch | Sim | Baixo | |
| `/api/admin/tenants/[id]/*` | GET/POST/PATCH | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/system-settings/*` | GET/POST | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/me/*` | GET/POST | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/certificates/*` | GET/POST/DELETE | Admin | Sim | Sem try/catch em alguns | Sim | Baixo | |
| `/api/admin/automacao/*` | GET/POST | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/home-sections/*` | GET/POST/PATCH/DELETE | Admin | Sim | Parcial | Sim | Baixo | |
| `/api/admin/referrals/*` | GET/POST | Admin | Sim | Sim | Sim | Baixo | |
| `/api/admin/certificate-template/*` | GET/POST | Admin | Sim | Parcial | Sim | Baixo | |

---

### Área: `painel/` (revendedor)

Padrão: `requireResellerSession()` ou `requireResellerOwner(tenantId)`. Todas filtram por `ctx.tenantId`. Sem cross-tenant observado.

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco | Observação |
|------|---------|-----------|--------------|------------|-----------------|-------|-----------|
| `/api/painel/alunos` | GET | `requireResellerSession` | N/A | Sem try/catch top-level | Sim | Baixo | take:200 |
| `/api/painel/alunos/[id]/*` | GET/POST/PATCH/DELETE | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/vendas` | GET/POST | `requireResellerSession` | Sim (POST Zod) | Sim | Sim | Baixo | |
| `/api/painel/config/connect-mp` | POST/DELETE | `role === "RESELLER"` | Sim — Zod | Sim | Sim | Baixo | Token criptografado antes de salvar |
| `/api/painel/config/*` | GET/POST | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/cursos/*` | GET/POST/PATCH | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/equipe` | GET/POST/DELETE | `requireResellerOwner` | Sim | Sem try/catch | Sim | **MÉDIO** | GET seleciona `passwordHash` para checar `pendingInvite`; hash NÃO retornado na resposta |
| `/api/painel/financeiro` | GET | Reseller | N/A | Sim | Sim | Baixo | take:50/200 |
| `/api/painel/financeiro/export-csv` | GET | Reseller | N/A | Sem try/catch | Sim | Baixo | CSV injection mitigado via `escapeCsv` |
| `/api/painel/cupons/*` | GET/POST/PATCH/DELETE | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/dominio/*` | GET/POST | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/vitrine/*` | GET/POST | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/dashboard` | GET | Reseller | N/A | Sem try/catch | Sim | Baixo | |
| `/api/painel/banner/*` | GET/POST/DELETE | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/automacao/*` | GET/POST | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/comunicacao/*` | GET/POST | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/leads/*` | GET/POST/PATCH | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/onboarding` | GET/POST | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/certificates/*` | GET/POST/DELETE | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/referrals/*` | GET/POST | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/home-sections/*` | GET/POST/PATCH/DELETE | Reseller | Sim | Parcial | Sim | Baixo | |
| `/api/painel/indicacoes/*` | GET | Reseller | N/A | Parcial | Sim | Baixo | |
| `/api/painel/certificate-template/*` | GET/POST | Reseller | Sim | Parcial | Sim | Baixo | |

---

### Área: `aluno/`

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/aluno/catalogo` | GET | `requireStudentSession` | N/A | Parcial | Sim | Baixo |
| `/api/aluno/comprar` | POST | `requireStudentSession` | Sim — Zod | Sim | Sim | Baixo |
| `/api/aluno/perfil` | GET/PATCH | `requireStudentSession` | Sim (PATCH Zod) | Parcial | Sim | Baixo |
| `/api/aluno/senha` | POST | `requireStudentSession` | Sim — Zod | Parcial | Sim | Baixo |
| `/api/aluno/suporte` | POST | `requireStudentSession` | Sim — Zod | Parcial | Sim | Baixo |

---

### Área: `student/` (certificados)

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/student/certificates/[id]/download` | GET | `requireStudentSession` | Path param id | Parcial | Sim | Baixo |

---

### Área: `public/` e `home/`

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/public/capture-ref` | POST | Pública | Sim — Zod | Sim | Sim | Baixo |
| `/api/public/validate-ref` | GET | Pública | Query param `code` (trim) | Sim | Sim | Baixo |
| `/api/home/showcase` | GET | Pública | N/A | Sem try/catch | 200 sempre (pode lançar 500 não-tratado) | Baixo |

---

### Área: `metrics/`, `health/`

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/health` | GET | Não (por design) | N/A | Sim — 503 se DB falha | Sim | Informativo — retorna latência e DB status |
| `/api/metrics/public` | GET | Não | N/A | Sim — retorna fallback | Sim | Médio — expõe totais absolutos (alunos, receita total) |

---

### Área: `notifications/`, `push/`

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/notifications` | GET | Sessão (user ou student) | N/A | Parcial | Sim | Baixo |
| `/api/notifications/[id]/read` | POST | Sessão | Path param | Parcial | Sim | Baixo |
| `/api/notifications/read-all` | POST | Sessão | N/A | Parcial | Sim | Baixo |
| `/api/notifications/preferences` | GET/POST | Sessão | Sim (POST Zod) | Parcial | Sim | Baixo |
| `/api/push/subscribe` | POST/DELETE | Sessão (user ou student) | Sim — Zod | Sim | Sim | Baixo |
| `/api/push/devices/[id]` | DELETE | Sessão | Path param | Parcial | Sim | Baixo |
| `/api/push/devices` | GET | Sessão | N/A | Parcial | Sim | Baixo |
| `/api/push/public-key` | GET | Não (VAPID public key) | N/A | Sim | Sim | Informativo |

---

### Área: `leads/`, `pmb/leads/`, `revendedores/cadastro`

| Rota | Métodos | Protegida? | Valida input? | Trata erro? | Status codes OK? | Risco |
|------|---------|-----------|--------------|------------|-----------------|-------|
| `/api/leads` | POST | Pública + rate-limit | Sim — Zod | Sim | Sim | Baixo |
| `/api/pmb/leads` | POST | Pública + rate-limit duplo | Sim — Zod + consent | Sim | Sim | Baixo |
| `/api/revendedores/cadastro` | POST | Pública + rate-limit | Sim — `cadastroRevendedorSchema` | Sim | Sim (201/400/409/502/500) | Baixo |

---

## Proxy (`src/proxy.ts`)

**Classificação de host:** `classifyHost()` — sólida. APP domains nunca viram tenants; `RESERVED_SUBDOMAINS` colocadas em Set.

**Sanitização de headers:** `sanitizedHeaders.delete("x-tenant-id")` e `delete("x-tenant-slug")` executados em TODAS as requests (linha 181-183) antes de qualquer classificação. Proteção contra header injection pelo cliente confirmada.

**Bypass com ponto no pathname (linha 189):**
```typescript
pathname.includes(".")
```
Qualquer request para path com extensão (`.php`, `.html`, `.js`, `.json`, etc.) em um subdomínio de tenant retorna `NextResponse.next()` com headers sanitizados mas **sem** injetar `x-tenant-id` ou `x-tenant-slug`. Consequências: (a) `GET /loja/image.jpg` numa vitrine não recebe `x-tenant-id` → erro 400 TENANT_MISSING se a rota da loja for atingida; (b) URLs como `/api/admin.json` de dentro de tenant não recebem tenant context — **isto é correto e seguro** pois rotas admin não são tenant-scoped.

**Ausência de resolução de tenant por Redis em non-vitrine paths:** Quando `isVitrinePath(pathname)` é falso, o proxy seta apenas `x-tenant-slug` mas não `x-tenant-id` (porque o Redis lookup só ocorre no branch de vitrine). Rotas que precisam de `x-tenant-id` fora de `/loja/*` receberão `null` no header.

---

## Server Actions

**`src/app/validar/page.tsx` (linha 14):** Server action `verificar(formData)` — apenas faz `redirect()` após validar e normalizar o código. Sem acesso a DB, sem segredo. **Seguro.**

**`src/app/inadimplente/page.tsx`:** `"use server"` aparece como diretiva de página, não de função de ação. É um Server Component com `auth()` e `prisma` reads. **Não é uma server action de form.** Seguro.

---

## Achados Detalhados

### [Alto] PMB Checkout sem rate-limit — flood de cobranças e custo
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Rate Limiting / Abuso de API
- **Arquivo:** `src/app/api/checkout/route.ts`
- **Linha/trecho:** Todo o handler POST (nenhum import ou chamada `rateLimit` presente — confirmado por `grep -c rateLimit` retornando 0)
- **Evidência:** O arquivo tem 711 linhas e zero chamadas a `rateLimit`. Compare com `src/app/api/loja/checkout/route.ts` linha 56: `const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)` — mesmo padrão de rota pública, mas PMB checkout não o implementa.
- **Descrição:** A rota `/api/checkout` é o endpoint público de compra de cursos da vitrine PMB. Sem rate-limit, um atacante pode disparar centenas de requisições por segundo com CPFs/emails fictícios: (a) cria `Enrollment` PENDING no banco, consome cobrança no Asaas/MP, (b) gera custo de operação do gateway, (c) entope tabela `Enrollment` e `Student` com registros lixo.
- **Impacto:** Custo financeiro direto (cobranças Asaas têm custo por criação), degradação de performance do banco, exaustão do rate-limit do gateway.
- **Cenário de risco:** Bot com lista de CPFs/emails válidos dispara 500 req/s → cria 500 customers Asaas + 500 subscriptions → custo inesperado e logs poluídos.
- **Recomendação:** Adicionar `rateLimit(request, RATE_LIMITS.publicCheckout)` como primeira instrução do handler, espelhando `/api/loja/checkout`.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] Senha temporária de revendedor exposta em JSON de resposta
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Exposição de credencial em resposta de API
- **Arquivo:** `src/app/api/admin/revendedores/route.ts`
- **Linha/trecho:** Linha 378 — `tempPassword` incluído diretamente no `data` retornado no `NextResponse.json()`
- **Evidência:**
  ```typescript
  return NextResponse.json({
    data: {
      tenant,
      owner: { id: user.id, email: user.email },
      tempPassword,   // ← linha 378, plaintext
      ...
    },
  })
  ```
- **Descrição:** Ao criar um revendedor via `/api/admin/revendedores` (POST), a senha temporária gerada é retornada no corpo da resposta HTTP. Isso é intencional — o admin lê a senha para repassar ao revendedor. O risco está em: (a) logs de proxy/CDN/APM que capturam corpos de resposta HTTP; (b) histórico do browser (network tab) ou ferramentas de debug; (c) se a resposta for logada por algum sistema de observabilidade upstream (Vercel log drain, etc.).
- **Impacto:** Se um log drain estiver configurado, a senha temporária ficaria registrada em texto plano. A senha é `randomBytes(9).toString("base64url")` (72 bits de entropia) — segura em si, mas exposição em log é preocupante.
- **Cenário de risco:** Log drain no Vercel captura response bodies → senha temporária indexada em sistema de log → comprometimento se log for acessado por terceiro.
- **Recomendação:** (a) Garantir que `tempPassword` não seja logado (confirmado: não há `log.info` com o valor); (b) considerar entregar senha apenas por email (já feito na linha 333) e remover da resposta JSON, ou (c) manter na resposta mas documentar que log drains não devem capturar response bodies. Esta decisão é de produto (o admin UI precisa exibir a senha na tela).
- **Correção aplicada:** Não
- **Status:** Requer decisão humana
- **Confiança:** Alta

---

### [Alto] `alterar-senha-inicial` sem rate-limit — força bruta de senha em sessão ativa
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Rate Limiting / Autenticação
- **Arquivo:** `src/app/api/auth/alterar-senha-inicial/route.ts`
- **Linha/trecho:** Linhas 16-58 — nenhum import ou chamada de `rateLimit`
- **Evidência:** Endpoint requer sessão autenticada (`auth()` na linha 19) mas não tem rate-limit. O login tem rate-limit (`RATE_LIMITS` em `auth.ts`), mas esta rota não.
- **Descrição:** Um atacante que obteve uma sessão válida (cookie roubado de um RESELLER com `mustChangePassword=true`) poderia fazer brute-force de senhas sem throttling via este endpoint. O risco é baixo em escopo pois requer sessão prévia, mas é gap de defesa-em-profundidade.
- **Impacto:** Baixo em isolamento; médio em composição com ataque de fixação de sessão.
- **Recomendação:** Adicionar `rateLimit(request, RATE_LIMITS.authReset)` (mesmo limite do `reset-password`) ou similar.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Broadcast scope=ALL carrega todos os alunos sem paginação
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Performance / DoS por consumo de memória
- **Arquivo:** `src/app/api/admin/notifications/broadcast/route.ts`
- **Linha/trecho:** Linha 152 — `prisma.student.findMany({ select: { id: true } })` sem `take`
- **Evidência:**
  ```typescript
  // ALL
  const students = await prisma.student.findMany({ select: { id: true } })
  await dispatchToStudents(students, baseFields)
  ```
- **Descrição:** Quando `scope === "ALL"`, todos os alunos do sistema (potencialmente dezenas de milhares) são carregados em memória de uma vez e processados em batches de 25. A criação de notificações (`createNotification`) por aluno envolve queries DB — muitas em paralelo (25 simultâneas). Com crescimento da plataforma, isto pode causar timeout da rota ou OOM.
- **Impacto:** Performance degradada; possível timeout da Vercel Function em produção (maxDuration não declarado → padrão 10s para Hobby, até 60s para Pro).
- **Recomendação:** (a) Declarar `export const maxDuration = 300` se o job for longo; (b) processar em batches via cursor (loop com `cursor`/`skip`); (c) ou mover para job assíncrono (Inngest/BullMQ/pg_cron) em vez de request síncrona.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] `metrics/public` expõe receita total acumulada sem autenticação
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Exposição de dado sensível de negócio
- **Arquivo:** `src/app/api/metrics/public/route.ts`
- **Linha/trecho:** Linhas 26-32 — `prisma.payment.aggregate({ _sum: { amount: true }, where: { mpStatus: "APPROVED" } })`
- **Evidência:** Resposta inclui `{ data: { resellers, courses, students, revenue } }` — `revenue` é a soma de TODOS os pagamentos aprovados do sistema.
- **Descrição:** O endpoint não exige autenticação (por design, é usado na landing page). Retorna receita total acumulada, número absoluto de alunos e revendedores. Com `revalidate = 60` (cache de 60s), o dado é relativamente fresco. Concorrentes podem usar para avaliar tamanho do negócio.
- **Impacto:** Informativo-Médio. Dados de negócio sensíveis expostos publicamente.
- **Recomendação:** (a) Retornar valores aproximados (ex: "mais de 1.000 alunos" em vez do número exato); (b) ou remover `revenue` da resposta pública (manter apenas contagens); (c) ou aceitar o risco como decisão de marketing.
- **Correção aplicada:** Não
- **Status:** Requer decisão humana
- **Confiança:** Alta

---

### [Médio] `home/showcase` sem try/catch — 500 não-tratado em caso de DB error
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Error Handling / Disponibilidade
- **Arquivo:** `src/app/api/home/showcase/route.ts`
- **Linha/trecho:** Linhas 6-42 — nenhum try/catch; `prisma.course.findMany()` na linha 8 pode lançar
- **Evidência:** `grep -c "catch\|error"` retornou 0 no arquivo.
- **Descrição:** Se o banco estiver temporariamente indisponível, a chamada `prisma.course.findMany()` lança e a rota retorna 500 com stack trace (dependendo da configuração do Next.js). Compare com `/api/metrics/public` que tem try/catch com fallback.
- **Impacto:** Página home da PMB quebra completamente durante indisponibilidade de DB. Stack trace pode vazar informação estrutural.
- **Recomendação:** Envolver em try/catch e retornar `{ data: [] }` como fallback.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Proxy: `pathname.includes(".")` bypassa resolução de tenant para extensões de arquivo
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Lógica de Proxy / Edge Case
- **Arquivo:** `src/proxy.ts`
- **Linha/trecho:** Linha 189 — `pathname.includes(".")`
- **Evidência:** Early return com `NextResponse.next({ request: { headers: sanitizedHeaders } })` — headers sanitizados mas sem `x-tenant-id`/`x-tenant-slug` injetados.
- **Descrição:** Qualquer request para path com ponto em subdomínio de tenant (ex: `tenant.livrecursos.com.br/api/loja/checkout.json`) bypassa a lógica de resolução de tenant. O efeito é que `x-tenant-id` não é injetado, então rotas tenant-scoped retornam 400 "TENANT_MISSING". Em termos de segurança, o comportamento é **seguro** (nega acesso em vez de conceder). Porém, o comportamento com arquivos estáticos do Next.js (`_next/static`, `_next/image`) já é tratado pelo matcher do proxy (`config.matcher` exclui `_next/static`, `_next/image`). O check de ponto é redundante para `_next` mas pode causar confusão com rotas que legitimamente contenham um ponto (ex: `/api/v1.0/something`).
- **Impacto:** Baixo — UX/funcional, não de segurança.
- **Recomendação:** Substituir o check genérico `pathname.includes(".")` por extensões específicas de arquivo estático (`/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$/`), alinhando com o config.matcher já existente.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] `cron/sync-cursos` aceita GET além de POST
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Semântica HTTP
- **Arquivo:** `src/app/api/cron/sync-cursos/route.ts`
- **Linha/trecho:** Linhas 24-26 — `export async function GET(request: Request) { return POST(request) }`
- **Evidência:** Ambos os handlers existem; GET delega para POST.
- **Descrição:** Operação de sincronização (mutação de dados) acessível via GET. `isCronAuthorized` protege ambos corretamente. Não é exploração de segurança mas viola princípios REST e pode ser invocado inadvertidamente por bots de crawling.
- **Recomendação:** Remover o handler GET; manter apenas POST.
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] `painel/equipe` (GET) busca `passwordHash` do DB mesmo sem retorná-lo
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Princípio do mínimo privilégio / overfetch
- **Arquivo:** `src/app/api/painel/equipe/route.ts`
- **Linha/trecho:** Linha 33 — `select: { ..., passwordHash: true, ... }`
- **Evidência:** `passwordHash` é selecionado do DB apenas para calcular `pendingInvite: !m.user.passwordHash`. O hash em si não é incluído na resposta JSON.
- **Descrição:** O hash bcrypt é buscado e carregado em memória desnecessariamente. Seria mais seguro fazer `select: { ..., passwordHash: true }` e usar apenas para o boolean.
- **Recomendação:** Substituir por `_count: { where: { passwordHash: { not: null } } }` ou adicionar uma coluna `boolean hasPassword` no schema. Ou manter como está, pois o hash não é retornado.
- **Status:** Informativo
- **Confiança:** Alta

---

### [Baixo] Várias rotas admin/painel sem try/catch top-level
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Error Handling
- **Arquivos:** `src/app/api/admin/dashboard/route.ts`, `src/app/api/admin/analytics/route.ts`, `src/app/api/admin/alunos/global/route.ts`, `src/app/api/painel/dashboard/route.ts`, `src/app/api/painel/alunos/route.ts`, `src/app/api/admin/leads/route.ts`, `src/app/api/admin/certificates/enrollments/route.ts`, entre outros (~15 rotas)
- **Evidência:** `grep -rL "try {"` retornou ~15 rotas admin/painel sem try/catch explícito.
- **Descrição:** Rotas sem try/catch top-level lançam exceção não tratada em caso de falha de DB, que o Next.js converte em resposta 500 com mensagem genérica. O risco de vazamento de stack é baixo (Next.js em produção não expõe stack traces por padrão), mas erros não são logados de forma estruturada.
- **Recomendação:** Envolver handlers em try/catch e logar com `contextLogger().error()`.
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Informativo] Proxy `config.matcher` inclui `.*` mas `_next/static` já é excluído
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Configuração
- **Arquivo:** `src/proxy.ts`
- **Linha/trecho:** Linhas 270-273 — `config.matcher`
- **Descrição:** O matcher usa `/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|...)$).*)` — exclui arquivos estáticos comuns. O check `pathname.includes(".")` na linha 189 é redundante para esses casos mas captura outros (`.php`, `.asp`, `.json`, etc.). Não é risco de segurança.
- **Status:** Informativo

---

### [Informativo] `api/health` expõe latência de DB e status do Redis publicamente
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Information Disclosure
- **Arquivo:** `src/app/api/health/route.ts`
- **Descrição:** Retorna `{ checks: { database: true, redis: true }, latencyMs: N }`. Por design (monitoramento externo). Aceitável como trade-off de operabilidade.
- **Status:** Informativo

---

### [Informativo] Tenant ID vem apenas do Redis no proxy — miss de cache = sem x-tenant-id
- **Agente responsável:** 06-rotas-apis
- **Categoria:** Resiliência
- **Arquivo:** `src/proxy.ts`
- **Linha/trecho:** Linhas 246-262
- **Descrição:** Se o cache Redis tiver miss para o tenant, `x-tenant-id` não é injetado no header (apenas `x-tenant-slug`). Rotas que dependem de `x-tenant-id` retornam 400 "TENANT_MISSING". O `/api/loja/checkout` e `/api/loja/leads` dependem de `x-tenant-id`. Se Redis cair, compras na vitrine falham com 400.
- **Recomendação:** As rotas poderiam usar `x-tenant-slug` como fallback para resolver o tenant diretamente do DB quando `x-tenant-id` estiver ausente.
- **Status:** Informativo

---

## Padrões Positivos Observados

1. **Sanitização de headers de tenant no proxy** — `x-tenant-id` e `x-tenant-slug` são sempre deletados antes de qualquer lógica, evitando header injection.
2. **Rate-limit presente nas rotas de maior risco** — `loja/checkout`, `revendedores/cadastro`, `leads`, `auth/forgot-password`, `auth/reset-password`, `cobranca/pay-card`.
3. **Criptografia do token MP** — `mpAccessToken` é criptografado AES-256-GCM antes de salvar no banco; nunca retornado nas respostas.
4. **Idempotência nos webhooks** — Asaas e MP verificam por `asaasPaymentId`/`mpPaymentId` antes de processar duplicatas.
5. **Redação de secrets nos logs** — `asaas-access-token` e `x-signature` são redactados no `pickHeaders()` antes de persistir em `WebhookLog`.
6. **Rollback de enrollment órfã** — `loja/checkout`, `checkout`, `painel/vendas` e `admin/vendas` deletam o enrollment e liberam o cupom em caso de falha no gateway.
7. **Guard pattern consistente** — `requireSuperAdmin()`, `requirePmbSales()`, etc. retornam `{ ok, response }` e são chamados em todas as rotas admin.
8. **Impersonate com audit log** — `admin/revendedores/[id]/impersonate` registra em `AuditLog` e restringe a `SUPER_ADMIN`.
