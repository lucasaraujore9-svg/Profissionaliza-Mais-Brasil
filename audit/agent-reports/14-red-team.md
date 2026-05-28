# Relatório 14 — Agente Red Team (Adversarial)

> Função: ADVERSARIAL. Desafiar os relatórios 02/03/04/06/07, caçar o que eles
> perderam, e montar cadeias de exploração concretas. READ-ONLY. Cada achado marca
> CONFIRMADO (li o código e a cadeia funciona), PROVÁVEL (forte indício) ou
> REFUTADO/RECALIBRADO (achado de outro agente que considero exagerado ou que
> recalibro). Evidência sempre em `arquivo:linha`.

## Sumário

- **Cenários de ataque montados:** 11
- **Achados NOVOS (não vistos pelos outros agentes):** 4
  - Privilege escalation via `revendedores/[id]/status` (PMB_SALES suspende/reativa qualquer tenant) — **CONFIRMADO**
  - Privilege escalation via `revendedores/[id]/policy` sem `accountManagerId` (qualquer gerente edita tenant de outro gerente; PMB_SALES desliga billing) — **CONFIRMADO**
  - Cross-scope revoke de certificado via `admin/certificates/[id]/revoke` (PMB_SALES revoga certificado de revendedor) — **CONFIRMADO**
  - Entropia do código de certificado é 28 bits (não 32) + 8º hex char descartado — **CONFIRMADO**
- **Achados RECALIBRADOS (severidade alterada vs. outro agente):** 3
- **Achados REFUTADOS / não-exploráveis:** 5

---

## A) CENÁRIOS DE ATAQUE

### Cenário 1 — [CRÍTICO] Raspagem em massa de CPF via bucket público de certificados (amplifica achado 03)

**Status:** CONFIRMADO. Recalibra o Crítico do agente 03 com a cadeia completa + entropia real.

**Pré-condições:** nenhuma. Atacante anônimo. Conhecer o domínio Supabase (público, aparece em qualquer `pdfUrl` ou em `images.remotePatterns` do `next.config.ts`: `*.supabase.co`).

**Passos:**
1. Obter UM código válido (compartilhado em LinkedIn, QR de certificado físico, ou via `/validar/<code>`). O QR/validação expõe o `code` em texto e a página renderiza `<a href={cert.pdfUrl}>` apontando ao Storage público — `src/app/validar/[code]/page.tsx:459-461`.
2. A URL do PDF é **totalmente previsível**: `https://<ref>.supabase.co/storage/v1/object/public/certificates/{tenantId ?? "pmb"}/{code}.pdf` — `src/lib/certificates/generate-pdf.ts:39-41,105`, `src/lib/certificates/storage.ts:84`.
3. O `code` = `{PREFIX}-{7 hex chars}`. PREFIX é `PMB` ou o **slug do tenant** (público, é o subdomínio). Suffix = `randomBytes(4).toString("hex").slice(0,7)` — `src/lib/certificates/code.ts:8-9`. São **7 caracteres hex = 16^7 ≈ 268 milhões (28 bits)**, NÃO os "32 bits" do comentário; pior: o 4º byte gera o 8º hex que é **descartado** pelo `.slice(0,7)`, jogando entropia fora.
4. Enumerar `{tenantId}/PREFIX-XXXXXXX.pdf` direto contra o Storage. **Não há rate-limit no Storage** (o `RATE_LIMITS.certificateValidate` de 30/min só protege a rota `/validar` do nosso app; o Storage do Supabase é acessado direto, fora do nosso app). Cada PDF contém `studentName` + `studentCpf` (snapshot, `schema.prisma:1206`).

**Impacto:** vazamento em massa de PII sensível (nome + CPF) de todos os formandos. Violação direta de LGPD.

**Por que mais grave que o reportado por 03:** o agente 03 marcou "enumeração de códigos amplia o vazamento" como hipótese. Eu confirmo que (a) o Storage não tem rate-limit, (b) a entropia efetiva é 28 bits com prefixo público conhecido, tornando a enumeração viável (não acadêmica), e (c) o `/validar` rate-limit NÃO protege porque a URL pública é acessada fora do app.

**Correção:** bucket `certificates` PRIVADO; servir só via rota autenticada com signed URL curta; na `/validar`, gerar signed URL on-demand em vez de linkar a URL pública; aumentar o suffix para ≥ 16 hex chars (`randomBytes(8)`); remover CPF do PDF público (manter só na via autenticada do aluno). 
**Severidade:** Crítico. **Confiança:** Alta.

---

### Cenário 2 — [ALTO] PMB_SALES suspende ou reativa QUALQUER revendedor (novo)

**Status:** CONFIRMADO. Achado novo (nenhum agente cobriu `status/route.ts`).

**Pré-condições:** sessão de PMB_SALES (o papel de MENOR confiança) ou PMB_RESELLER_MGR.

**Passos:**
1. `PATCH /api/admin/revendedores/<qualquer-tenant-id>/status` com `{ "status": "SUSPENDED" }`.
2. O guard é `requireAdminSession()` = qualquer PMB_TEAM, incl. PMB_SALES (`src/lib/auth/admin-session.ts:11,23`). **Não há checagem de `accountManagerId`** — contraste com `notes/route.ts:7-15` e `[id]/route.ts:39` que checam.
3. `prisma.tenant.update({ data: { status }})` + `invalidateTenant` — `src/app/api/admin/revendedores/[id]/status/route.ts:46-51`. A vitrine do revendedor sai do ar (proxy serve `/loja/suspended` para status != ACTIVE — `proxy.ts:247-253`) e o owner é bloqueado de logar (`auth.ts:147-155`).

**Impacto:** (a) Sabotagem/DoS: PMB_SALES derruba a loja de qualquer revendedor. (b) Burla de cobrança: PMB_SALES reativa (`status: "ACTIVE"`) um revendedor que o sistema suspendeu por inadimplência — anula o controle de billing. (c) Um PMB_RESELLER_MGR sabota tenant de outro gerente.

**Correção:** `requireSuperAdmin()` para mudança de status (igual a `billing` e `manager`), OU `assertCanAccess` por `accountManagerId` como em `notes`.
**Severidade:** Alto. **Confiança:** Alta.

---

### Cenário 3 — [ALTO] PMB_SALES/gerente altera billingMode e cancellationPolicy de qualquer tenant (recalibra 04 de Informativo→Alto)

**Status:** CONFIRMADO. O agente 04 marcou isso como **Informativo**; eu **recalibro para Alto** por causa do efeito de segurança concreto.

**Pré-condições:** sessão PMB_SALES ou PMB_RESELLER_MGR.

**Passos:**
1. `PATCH /api/admin/revendedores/<qualquer-id>/policy` com `{ "billingMode": "MANUAL" }`.
2. Guard `requireAdminSession()` (qualquer PMB team) e **sem** `accountManagerId` — `src/app/api/admin/revendedores/[id]/policy/route.ts:24,46-69`.
3. Com `billingMode = MANUAL`, o webhook Asaas PAYMENT_OVERDUE e os crons de sweep deixam de chamar `blockTenantStudents` (que só roda em `billingMode === "AUTO"` — confirmado em `process.ts` e `auto-block.ts` via achado 07). Alunos inadimplentes de um tenant continuam com acesso pago na plataforma parceira.

**Impacto:** PMB_SALES desliga o bloqueio automático de inadimplentes em massa para qualquer revendedor + altera `gracePeriodDays`/`keepStudentsActive`. Perda de receita e quebra de isolamento entre carteiras de gerentes.

**Correção:** mesma de Cenário 2 (SUPER_ADMIN-only ou `accountManagerId`).
**Severidade:** Alto. **Confiança:** Alta.

---

### Cenário 4 — [MÉDIO] PMB_SALES revoga certificado de revendedor (cross-scope) (novo)

**Status:** CONFIRMADO. Achado novo.

**Pré-condições:** sessão PMB_SALES (ou qualquer PMB team).

**Passos:**
1. `POST /api/admin/certificates/<cert-id-de-um-revendedor>/revoke` com `{ "reason": "xxx" }`.
2. Guard `requireAdminSession()` (qualquer PMB team) e o `findUnique({ where: { id } })` **NÃO filtra `tenantId: null`** — `src/app/api/admin/certificates/[id]/revoke/route.ts:15,37-39`. Contraste: a versão do painel (`painel/certificates/[id]/revoke/route.ts:47-49`) checa `cert.tenantId !== ctx.tenantId → 403`. A versão admin não tem equivalente.

**Impacto:** PMB_SALES (e gerentes) revogam certificados emitidos por revendedores que não gerenciam — sabotagem da credencial do aluno.

**Correção:** filtrar `tenantId: null` (admin só mexe em certs PMB) ou restringir a SUPER_ADMIN.
**Severidade:** Médio. **Confiança:** Alta.

---

### Cenário 5 — [MÉDIO] FIXED coupon burla o cap de 50% do PMB_SALES (confirma 07 #3, com cadeia)

**Status:** CONFIRMADO (li o código). Confirma o achado 07 #3.

**Pré-condições:** PMB_SALES + existência de um cupom FIXED (que SUPER_ADMIN cria; PMB_SALES não pode criar FIXED via `admin/cupons`).

**Passos:**
1. `POST /api/admin/vendas` aplicando `couponCode` de um cupom FIXED de valor alto (ex.: R$ 999) num curso de R$ 100.
2. O cap só rejeita `discountType === "PERCENTAGE"` — `src/app/api/admin/vendas/route.ts:227-236`. FIXED passa direto e `discountAmount = Math.min(raw, basePrice)` zera o preço (`:242`).

**Impacto:** PMB_SALES fecha venda com 100% de desconto, acima dos 50% autorizados.
**Correção:** calcular `effectivePct = discountAmount/basePrice*100` para AMBOS os tipos (padrão de `painel/vendas`).
**Severidade:** Médio. **Confiança:** Alta.

---

### Cenário 6 — [ALTO→ informativo após análise] Forjar webhook Asaas para ativar tenant sem pagar

**Status:** REFUTADO como exploração prática.

**Cadeia testada:** para forjar `PAYMENT_RECEIVED` e ativar um tenant, o atacante precisa enviar o header `asaas-access-token` igual ao `ASAAS_WEBHOOK_TOKEN`. A validação é fail-closed (rejeita se env ausente) e timing-safe — `src/lib/asaas/webhook.ts:16-32`. O early-return por comprimento (`a.length !== b.length`) vaza só o tamanho do token (achado 02 Baixo, correto). Sem o token, o webhook é rejeitado em 401. **Não explorável sem vazar o segredo.** REFUTO qualquer cenário de forja "fácil".

---

### Cenário 7 — [ALTO→ defesa-em-profundidade] Forjar webhook MP para matricular sem pagar

**Status:** PROVÁVEL apenas SE `MP_WEBHOOK_SECRET` vazar; caso contrário REFUTADO.

**Análise da cadeia (o HMAC do MP usa `data.id` da query — manipulável?):**
- O manifesto HMAC é `id:<dataId>;request-id:<xRequestId>;ts:<ts>;` — `src/lib/mercadopago/webhook.ts:37`. O atacante controla `dataId` (query `?data.id=`), `xRequestId` (header) e `ts` — **todos**. Ou seja, dado o `MP_WEBHOOK_SECRET`, ele computa um HMAC válido para qualquer `paymentId` à escolha. O secret é **global** (não por-tenant) — `process.ts:237-247`.
- PORÉM o Passo 5 chama `getPayment(accessToken, paymentId)` (`process.ts:326`): o `paymentId` PRECISA existir e ser aprovado na conta MP do tenant resolvido (PMB usa `pmbMpAccessToken`; revendedor usa token decifrado). Um pagamento aprovado só existe se alguém realmente pagou. O atacante não consegue inventar um `paymentId` aprovado.
- **Gap real (defesa-em-profundidade) que NENHUM agente notou:** `fulfillEnrollment` usa `event.amount = payment.transaction_amount` e **nunca compara contra `enrollment.finalAmount`** (`fulfill.ts:160-173,286-300`). Como o `unit_price`/`transaction_amount` da preference é fixado server-side (`checkout/route.ts:404`, `aluno/comprar:266`, etc.), o comprador NÃO controla o valor — então não é explorável hoje. Fica como hardening: se algum fluxo futuro permitir o comprador escolher o valor (ex.: doação/valor aberto), a matrícula confirmaria por qualquer centavo.

**Conclusão:** forja de webhook MP é REFUTADA enquanto o secret não vaza E o comprador não controla o amount. O risco residual real é o **single point of failure** do `MP_WEBHOOK_SECRET` global: se vazar, combinado com o token MP de um tenant (também necessário), permitiria reprocessar/forjar. Severidade efetiva: Baixo (depende de 2 segredos). **Confiança:** Alta.

---

### Cenário 8 — [REFUTADO] IDOR cross-tenant em rotas `[id]` não-amostradas pelo agente 04

**Status:** REFUTADO. Eu **especificamente** ataquei as rotas que o agente 04 disse não ter amostrado: `painel/leads/[id]`, `painel/leads/[id]/stage`, `painel/leads/[id]/activities`, `painel/certificates/[id]/revoke`, `painel/home-sections/[id]`, `painel/banner/[id]`, `painel/equipe/[id]/resend-invite`, `notifications/[id]/read`, `push/devices/[id]`, `admin/leads/[id]`.

Resultado: **todas** filtram corretamente:
- `painel/leads/[id]*`: `findFirst({ where: { id, tenantId: ctx.tenantId } })` — `route.ts:15-16,78-79`, `stage:41-42`, `activities:23-24`.
- `painel/certificates/[id]/revoke`: checa `cert.tenantId !== ctx.tenantId → 403` — `:47-49`.
- `painel/home-sections/[id]`: delega a `updateSection/deleteSection({ tenantId })` que faz `findFirst({ id, tenantId })` — `src/lib/home/api.ts:112-117,181-186`.
- `painel/banner/[id]`: `findFirst({ id, tenantId: ctx.tenantId })` antes de update/delete — `:27-32,74-79`.
- `painel/equipe/[id]/resend-invite`: `member.tenantId !== tenantId → 404` — `:27`.
- `notifications/[id]/read`: ownership via `markAsRead` (`updateMany where {id, userId|studentId|roleTarget}`) — `notifications.ts:358-381`.
- `push/devices/[id]`: `deleteMany where {id, userId|studentId}` — `:31-38`.
- `admin/leads/[id]`: `findFirst({ id, tenantId: null })` + role check SUPER_ADMIN/PMB_SALES — `:11-16`.

**Não encontrei nenhum vazamento cross-tenant por id.** O agente 04 estava correto; estendi a amostra e confirmo. (O isolamento de mutação em `revendedores/[id]/status|policy` é falha de AUTORIZAÇÃO entre papéis PMB, não IDOR de tenant — ver Cenários 2/3.)

---

### Cenário 9 — [MÉDIO→Baixo] Brute-force de login se o Redis cair (recalibra 02/04)

**Status:** RECALIBRADO de "fail-open" para "fail-closed" — os agentes 02 e 04 divergiram; eu resolvo a contradição.

**Análise:** `rateLimitByKey` retorna `ok: !isProd` quando `getLimiter` é null (Redis env ausente) — **fail-CLOSED em prod** (`ratelimit.ts:88-95`, `isProd` em `:6`). Se o Redis estiver **configurado mas indisponível em runtime**, `await limiter.limit(key)` (`:99`) **lança** (não há try/catch), a exceção propaga pelo `authorize()` e o NextAuth trata como erro → login falha → **fail-closed**. Portanto NÃO há janela de brute-force destravado. O comentário em `auth.ts:89` ("Falha em modo aberto") está **desatualizado/incorreto** — o agente 02 já apontou isso e está certo; o agente 04 confiou no comentário e exagerou. **REFUTO o cenário de brute-force fail-open.** Resta só o achado válido de `x-forwarded-for` manipulável (02 Médio) — na Vercel o XFF é normalizado pelo edge, mitigando.
**Severidade efetiva:** Baixo. **Confiança:** Alta.

---

### Cenário 10 — [REFUTADO] Injeção de `x-tenant-id`/`x-tenant-slug` direto na API (bypass do proxy)

**Status:** REFUTADO. O proxy faz `sanitizedHeaders.delete("x-tenant-id"|"x-tenant-slug")` em **toda** request processada, ANTES de classificar host (`proxy.ts:181-183`). Rotas de loja (`/api/loja/*`) e o login de aluno (`resolveTenantIdFromRequest`, `auth.ts:30-33`) leem esses headers, mas o cliente não consegue setá-los: o proxy os re-injeta apenas a partir do host resolvido. `/api/loja/checkout` exige `x-tenant-id` e responde 400 TENANT_MISSING sem ele (`loja/checkout/route.ts:62-67`) — fail-closed. **Não consegui forjar contexto de outro tenant via header.**

**Nota lateral (funcional, não-segurança):** `/api/loja/*` não está em `VITRINE_PATH_PREFIXES` (`proxy.ts:55`), então o proxy só seta `x-tenant-slug` (não `x-tenant-id`) nessas chamadas (`:238-244`). Como a rota exige `x-tenant-id`, isso pode quebrar checkout em subdomínio de tenant dependendo de como a UI chama — **questão funcional, fora do meu escopo adversarial; sinalizo para 06/07**. Do ponto de vista de segurança, falha fechada (nega), então é seguro.

---

### Cenário 11 — [REFUTADO/Baixo] Cron e Internal secret — timing/erro

**Status:** REFUTADO como explorável. `isCronAuthorized`/`isInternalAuthorized` usam `safeEqual` (timingSafeEqual) e fail-closed sem env (`bearer.ts:20-38`). O único leak é o comprimento do segredo via early-return `aBuf.length !== bBuf.length` (`:10`) — achado 02 Baixo, correto, risco quase nulo. **Não vazam o segredo em mensagem de erro:** as rotas de cron retornam 401 genérico. Sem exploração.

---

## B) ACHADOS NOVOS (não vistos pelos outros agentes)

1. **[Alto] `revendedores/[id]/status` — PMB_SALES suspende/reativa qualquer tenant** — Cenário 2. `status/route.ts:15` usa `requireAdminSession` sem `accountManagerId`. Nenhum agente leu esta rota.
2. **[Alto] `revendedores/[id]/policy` sem `accountManagerId`** — Cenário 3. O agente 04 viu o `requireAdminSession` mas classificou como Informativo e não notou a ausência de scoping por gerente (presente em `notes`/`[id]`/`comissoes`). Recalibrado para Alto.
3. **[Médio] `admin/certificates/[id]/revoke` — cross-scope revoke** — Cenário 4. `findUnique({ where:{id} })` sem `tenantId:null`, guard = qualquer PMB team.
4. **[Informativo→hardening] `fulfillEnrollment` não valida `transaction_amount` vs `enrollment.finalAmount`** — Cenário 7. Defense-in-depth ausente; não explorável hoje porque o amount é server-fixado.
5. **[Correção factual] Entropia do código de certificado = 28 bits, não 32; 8º hex descartado** — `code.ts:8-9`. Comentário do código está errado. Amplifica o Crítico de 03.

## C) ACHADOS REFUTADOS / RECALIBRADOS

| # | Achado original | Agente | Meu veredito |
|---|---|---|---|
| 1 | Crítico: CPF em bucket público (enumeração "hipótese") | 03 | **RECALIBRADO ↑** — confirmo enumeração viável (28 bits + sem rate-limit no Storage). Crítico mantido, cadeia provada. |
| 2 | PMB_SALES/MGR podem alterar policy/billing (Informativo) | 04 | **RECALIBRADO ↑ Alto** — inclui `status` (não visto) e efeito de segurança (desliga auto-block). |
| 3 | Rate-limit de login fail-open sem Redis (Baixo) | 04 | **REFUTADO/RECALIBRADO ↓** — código fail-CLOSED em prod (`ratelimit.ts:59-64,88-95`); runtime-throw também fecha. Comentário em `auth.ts:89` está errado. |
| 4 | Forja de webhook Asaas / MP | (implícito no escopo) | **REFUTADO** sem vazamento de segredo. Cenários 6/7. |
| 5 | IDOR em rotas `[id]` não amostradas | 04 (incerteza) | **REFUTADO** — estendi a amostra a 10 rotas; todas filtram por tenant/owner. |
| 6 | HMAC MP sem janela temporal (replay) — Baixo | 02 | Concordo (Baixo). Idempotência por `mpPaymentId` neutraliza (`process.ts:227-234`). |

## D) LACUNAS NA COBERTURA DA AUDITORIA

Os outros agentes NÃO cobriram (ou cobriram superficialmente):
1. **Autorização ENTRE papéis PMB** (SUPER_ADMIN vs PMB_SALES vs PMB_RESELLER_MGR) nas mutações de `admin/revendedores/[id]/*`. A inconsistência de scoping por `accountManagerId` (presente em `notes/[id]/comissoes`, ausente em `status/policy`) é uma classe de bug não auditada sistematicamente. **Recomendo varredura completa de todas as ~11 rotas `revendedores/[id]/*` para padronizar guard + accountManagerId.**
2. **Acesso direto ao Supabase Storage fora do app** — toda a análise de rate-limit/auth assumiu o tráfego pela aplicação. O bucket público é uma superfície paralela sem controle (Cenário 1).
3. **Validação de coerência amount no fulfillment** — fluxos de dinheiro foram auditados (07) mas a ausência de re-validação `transaction_amount == finalAmount` no `fulfill.ts` não foi notada.
4. **Cross-scope em operações admin de certificados** (revoke/list) — só o lado painel foi amostrado.
5. **Entropia/aleatoriedade de identificadores** (cert code, tempPassword) — não houve revisão dedicada de geração de IDs/segredos curtos.

---

## Nota de honestidade adversarial
O sistema **resistiu** à maioria dos meus ataques: IDOR de tenant (painel inteiro), forja de webhooks (sem vazar segredo), injeção de header de tenant, brute-force fail-open, path traversal de upload, tampering de preço no checkout — todos fail-closed e bem feitos. As brechas reais são (a) o bucket público de certificados com PII (Crítico, já apontado por 03, aqui amplificado) e (b) a **autorização inconsistente entre papéis internos PMB** nas rotas de mutação de revendedor (Alto, NOVO). Estas duas merecem prioridade.
