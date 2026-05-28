# Relatório — Agente de Segurança Aplicacional (02)

> Escopo: XSS, injeção, SSRF, IDOR/Broken Access Control/Mass Assignment, upload
> inseguro, rate limiting, webhooks (HMAC/replay/origem), exposição de segredos,
> cookies/CORS/headers, endpoints públicos. Análise read-only sobre arquivos reais.

## Sumário por severidade

| Severidade | Qtd |
|------------|-----|
| Crítico | 0 |
| Alto | 0 |
| Médio | 4 |
| Baixo | 6 |
| Informativo | 5 |
| **Total** | **15** |

**Veredito geral:** a superfície aplicacional está **notavelmente bem endurecida**.
Os vetores clássicos (XSS por `dangerouslySetInnerHTML`/markdown, SQL injection via
`$queryRawUnsafe`, mass assignment de preço/role/tenantId, IDOR cross-tenant, upload
de SVG/MIME spoofado, replay/HMAC de webhook, enumeração de e-mail) foram **testados e
estão mitigados**. Vários arquivos contêm comentários documentando correções de
segurança já aplicadas. Não foram encontrados achados Críticos ou Altos confirmados.
Os achados abaixo são majoritariamente defesa-em-profundidade e endurecimento.

**Lembrete de arquitetura (do _context, FATO CRÍTICO #1):** como o Prisma conecta como
owner e **RLS está bypassed**, todo o controle de acesso é de aplicação. Isso eleva o
impacto de qualquer rota que esquecesse de filtrar por `tenantId`/`studentId` — porém,
na amostragem realizada, **todas** as rotas tenant-scoped checadas filtram corretamente.

---

## Achados CONFIRMADOS

### [Médio] CSP permissiva: `'unsafe-inline'` + `'unsafe-eval'` em `script-src`
- Agente responsável: Segurança Aplicacional
- Categoria: A05:2021 Security Misconfiguration · CWE-1021 / CWE-79 (defesa-em-profundidade XSS)
- Arquivo: `next.config.ts`
- Linha/trecho: `32: "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com ..."`
- Evidência: a política inclui `'unsafe-inline'` e `'unsafe-eval'` em `script-src` e `'unsafe-inline'` em `style-src`.
- Descrição: Caso uma falha de XSS surja em qualquer ponto do app, a CSP não conteria a execução de scripts inline injetados (o objetivo principal de uma CSP). O comentário justifica pelo SDK do Mercado Pago + inline styles do Tailwind/shadcn.
- Impacto: Remove a principal rede de proteção contra XSS. Sozinha não é explorável (não há XSS confirmado), mas converte um eventual XSS de "contido" para "execução plena".
- Cenário de risco: Se um futuro `dangerouslySetInnerHTML` ou `rehype-raw` for adicionado a um campo controlado por usuário (ex.: descrição de curso, nome de loja), o atacante executa JS arbitrário sem barreira de CSP.
- Recomendação: Migrar para CSP baseada em nonce (Next 15+ suporta nonce via middleware/headers). O SDK do MP funciona com `script-src` por hostname; `'unsafe-eval'` raramente é exigido pelo SDK atual — testar removê-lo. Inline styles podem usar `'unsafe-inline'` apenas em `style-src` (risco menor) ou hash.
- Correção aplicada: Nenhuma (read-only).
- Status: Requer decisão humana
- Confiança: Alta

### [Médio] Rate limiting ausente em rotas de upload administrativas
- Agente responsável: Segurança Aplicacional
- Categoria: A04:2021 Insecure Design / A05 · CWE-770 (Allocation of Resources Without Limits)
- Arquivo: `src/app/api/admin/certificate-template/upload/route.ts`, `src/app/api/admin/system-settings/group-logo/upload/route.ts`, `src/app/api/admin/banner/upload/route.ts`, `src/app/api/painel/banner/upload/route.ts`, `src/app/api/painel/certificate-template/upload/route.ts`, `src/app/api/painel/cursos/[id]/capa/route.ts`
- Linha/trecho: nenhuma chamada a `rateLimit(..., RATE_LIMITS.upload)` nessas rotas (compare com `src/app/api/painel/vitrine/upload/route.ts:47` que possui).
- Evidência: `painel/vitrine/upload` aplica `RATE_LIMITS.upload`; as demais rotas de upload não aplicam nenhum limiter, embora o bucket `upload` já exista (`src/lib/ratelimit.ts:146`).
- Descrição: Uploads autenticados (5MB cada, com magic-byte check + chamada à Supabase Storage API) não têm rate limit. Um usuário autenticado (admin/reseller, ou sessão sequestrada) pode disparar uploads em loop.
- Impacto: Consumo de quota/custo do Supabase Storage, CPU em `isValidImageMagic`, e poluição de assets órfãos. Inconsistência: a mesma classe de operação tem limiter em uma rota e não em outra.
- Cenário de risco: Sessão de reseller comprometida sobe milhares de capas/banners de 5MB, estourando custo de Storage e egress.
- Recomendação: Aplicar `rateLimit(request, RATE_LIMITS.upload)` (já definido) no início de cada handler POST de upload, espelhando `painel/vitrine/upload`.
- Correção aplicada: Nenhuma (read-only).
- Status: Recomendado
- Confiança: Alta

### [Médio] Confiança em `x-forwarded-for` não-confiável para identidade de rate limit
- Agente responsável: Segurança Aplicacional
- Categoria: A07:2021 Identification and Authentication Failures · CWE-348 (Use of Less Trusted Source)
- Arquivo: `src/lib/ratelimit.ts`, `src/lib/auth.ts`
- Linha/trecho: `ratelimit.ts:128-132` (`ipFrom`: pega `x-forwarded-for.split(",")[0]`); `auth.ts:90-94` (mesma lógica para chave de login).
- Evidência: `const xff = request.headers.get("x-forwarded-for"); if (xff) return xff.split(",")[0].trim()` — usa o **primeiro** segmento do XFF, que é o valor mais à esquerda e totalmente controlado pelo cliente.
- Descrição: Em deploys onde o app é acessível por um caminho que não força reescrita do XFF (ou se o proxy faz append em vez de overwrite), o atacante envia `X-Forwarded-For: <ip-aleatório>` a cada requisição, contornando o rate limit por IP (login brute-force, leads, checkout, cobrança).
- Impacto: Bypass de todos os rate limits baseados em IP — incluindo o anti-brute-force de login (`RATE_LIMITS.authLogin`, 8/min).
- Cenário de risco: Atacante faz brute-force de senha de admin variando o header XFF a cada tentativa; cada IP "novo" reseta o bucket. Como a chave de login é `ip+email`, varia-se só o IP.
- Recomendação: Na Vercel, usar o IP confiável do runtime (`request.headers.get("x-real-ip")` é setado pela Vercel; ou `@vercel/functions ipAddress()`), e/ou pegar o **último** segmento do XFF adicionado pelo proxy confiável, não o primeiro. Documentar a suposição de que apenas o edge da Vercel pode setar o header.
- Correção aplicada: Nenhuma (read-only).
- Status: Requer decisão humana (depende da topologia de deploy; na Vercel o XFF é normalizado, reduzindo o risco)
- Confiança: Média

### [Médio] Endpoint público `GET /api/cobranca/[paymentId]` vaza dados de cobrança sem autenticação
- Agente responsável: Segurança Aplicacional
- Categoria: A01:2021 Broken Access Control (IDOR) · CWE-639
- Arquivo: `src/app/api/cobranca/[paymentId]/route.ts`
- Linha/trecho: `6-34` — handler GET sem sessão; só `isKnownAsaasPayment(paymentId)` (`src/lib/asaas/ownership.ts`).
- Evidência: a rota retorna `status, value, dueDate, description, billingType` de qualquer `paymentId` que exista na tabela `payments`/`tenant_payments`, sem provar que o solicitante é o titular daquela cobrança. A única barreira é o ID ser conhecido pelo sistema.
- Descrição: A rota é deliberadamente pública (para o pagador quitar boleto/cartão sem login). Porém não há nenhum segredo por-cobrança (token único) atrelado ao link — quem souber/adivinhar um `asaasPaymentId` lê valor, vencimento e descrição da fatura de terceiros.
- Impacto: Divulgação de informação financeira de outros revendedores/alunos (valor da mensalidade, descrição que pode conter nome do curso/aluno). Confidencialidade.
- Cenário de risco: IDs do Asaas têm prefixo conhecido (`pay_`) e parte numérica; um atacante com um ID válido (vazado em link compartilhado, histórico de browser, referer) pivota para outros via fuzzing limitado pelo rate limit (que não existe no GET — ver achado de rate limit; o POST pay-card tem, o GET não).
- Recomendação: Atrelar um token opaco por cobrança ao link (`/cobranca/<paymentId>?t=<random>` validado contra coluna no DB) OU exigir confirmação de um dado do titular (ex.: 4 últimos dígitos do CPF) antes de revelar detalhes. Adicionar rate limit também ao GET.
- Correção aplicada: Nenhuma (read-only).
- Status: Requer decisão humana (tradeoff UX de pagamento sem login)
- Confiança: Média

### [Baixo] HMAC do webhook Mercado Pago sem validação de janela temporal (replay)
- Agente responsável: Segurança Aplicacional
- Categoria: A08:2021 Software and Data Integrity Failures · CWE-294 (Authentication Bypass by Capture-replay)
- Arquivo: `src/lib/mercadopago/webhook.ts`, `src/lib/mercadopago/process.ts`
- Linha/trecho: `webhook.ts:33-41` — `ts` é extraído e incluído no manifesto, mas nunca comparado contra `Date.now()`; `process.ts:225-234` faz idempotência por `mpPaymentId`.
- Evidência: o template `id:...;request-id:...;ts:<ts>;` usa `ts` só para reconstruir o hash, sem rejeitar timestamps antigos.
- Descrição: Uma notificação MP válida capturada pode ser reenviada indefinidamente — a assinatura continua válida. A idempotência por `mpPaymentId` (passo 1 do `processMpWebhook`) neutraliza o efeito prático para pagamentos já processados.
- Impacto: Baixo. Replay de um webhook `approved` já processado é no-op (idempotente). Replay de um evento antes do primeiro processamento não muda o resultado final.
- Cenário de risco: Marginal — apenas ruído de log/reprocessamento; sem efeito de negócio dado o gate de idempotência e a confirmação via `getPayment(token, id)`.
- Recomendação: Rejeitar notificações com `ts` fora de uma janela (ex.: ±5 min) para reduzir superfície de replay e ruído.
- Correção aplicada: Nenhuma (read-only).
- Status: Recomendado
- Confiança: Alta

### [Baixo] Comparação HMAC com early-return por diferença de comprimento (MP e Asaas)
- Agente responsável: Segurança Aplicacional
- Categoria: A02:2021 Cryptographic Failures · CWE-208 (Observable Timing Discrepancy)
- Arquivo: `src/lib/mercadopago/webhook.ts:40`, `src/lib/asaas/webhook.ts:30`, `src/lib/auth/bearer.ts:10`, `src/lib/auth/impersonate.ts:96`
- Linha/trecho: padrão `if (a.length !== b.length) return false` antes de `timingSafeEqual`.
- Evidência: o comprimento do hash/token é revelado por timing antes da comparação constante.
- Descrição: O uso de `timingSafeEqual` é correto, mas o early-return por comprimento vaza o tamanho do valor esperado. Para hashes de comprimento fixo (HMAC SHA-256 hex = 64 chars) o comprimento é público — risco nulo. Para tokens de comprimento variável (CRON_SECRET, INTERNAL_SECRET, ASAAS_WEBHOOK_TOKEN) revela o comprimento do segredo.
- Impacto: Muito baixo — vazar o comprimento de um segredo não permite recuperá-lo; reduz marginalmente o espaço de busca.
- Cenário de risco: Acadêmico. Atacante mede a latência para inferir o tamanho do CRON_SECRET; ainda precisa força bruta inviável do conteúdo.
- Recomendação: Comparar o hash SHA-256 de ambos os valores (sempre 32 bytes) com `timingSafeEqual`, eliminando o ramo por comprimento.
- Correção aplicada: Nenhuma (read-only).
- Status: Recomendado
- Confiança: Média

### [Baixo] `href` de notificação renderizado em `<Link>` permite esquema `javascript:` (self-XSS admin)
- Agente responsável: Segurança Aplicacional
- Categoria: A03:2021 Injection (XSS) · CWE-79
- Arquivo: `src/components/shared/notification-bell.tsx:399-409`, `src/components/shared/notifications-page.tsx:296-303`, `src/app/api/admin/notifications/broadcast/route.ts:20`
- Linha/trecho: `<Link href={n.href}>`; schema do broadcast aceita `href: z.string().trim().max(500)` sem validar esquema/host.
- Evidência: o `href` do broadcast é string livre (até 500 chars). `next/link` não sanitiza o esquema da URL, renderizando `<a href="javascript:...">`.
- Descrição: Apenas `SUPER_ADMIN` pode emitir broadcasts com `href` arbitrário (`requireSuperAdmin` em `broadcast/route.ts:46`). Um admin malicioso (ou XSS que rode no contexto admin) poderia armazenar `javascript:...` que dispararia ao clique de quem visse a notificação.
- Impacto: Baixo — requer privilégio de SUPER_ADMIN para plantar; é essencialmente self/insider-XSS. As demais notificações usam `href` de constantes server-side.
- Cenário de risco: Insider SUPER_ADMIN persiste link `javascript:` em broadcast para alunos/tenants e executa script no browser deles ao clicarem.
- Recomendação: Validar `href` no schema do broadcast com `z.string().refine(v => v.startsWith("/") || v.startsWith("https://"))` (permitir só path relativo ou https). Defesa adicional no componente.
- Correção aplicada: Nenhuma (read-only).
- Status: Recomendado
- Confiança: Alta

### [Baixo] Vazamento de mensagens de erro upstream ao cliente
- Agente responsável: Segurança Aplicacional
- Categoria: A05:2021 Security Misconfiguration · CWE-209 (Generation of Error Message Containing Sensitive Information)
- Arquivo: ~42 ocorrências; ex.: `src/app/api/painel/dominio/route.ts:159,210` (erro Vercel), `src/app/api/admin/catalogo/sync/route.ts:21` (erro plataforma EA), `src/app/api/admin/relatorios/[type]/route.ts:99`, rotas de upload (`...:83/102`).
- Linha/trecho: `const message = error instanceof Error ? error.message : "..."` retornado em `NextResponse.json({ error: ... })`.
- Evidência: o `message` de erros de integrações (Vercel API, Asaas, plataforma EA, Supabase Storage) é repassado cru na resposta.
- Descrição: A maioria expõe descrições de erro de APIs de terceiros (não stack traces). Não há `err.stack` retornado ao cliente em nenhum caso encontrado. Pode revelar detalhes de infraestrutura/configuração (nomes de campos da Vercel, mensagens internas do EA/Asaas).
- Impacto: Baixo — vaza detalhes operacionais, não credenciais. Útil para reconhecimento de atacante.
- Cenário de risco: Atacante autenticado (reseller/admin) provoca erros para mapear o backend (qual provider, qual versão de API, nomes de recursos).
- Recomendação: Retornar mensagens genéricas ao cliente e logar o detalhe server-side (já se loga via `contextLogger`). As rotas de webhook (`asaas/route.ts:59`) que retornam `message` de config error são especialmente desnecessárias para o emissor.
- Correção aplicada: Nenhuma (read-only).
- Status: Recomendado
- Confiança: Média

### [Baixo] Dangling-domain / abuso de quota: reseller adiciona qualquer domínio ao projeto Vercel
- Agente responsável: Segurança Aplicacional
- Categoria: A04:2021 Insecure Design · CWE-350 (Reliance on Reverse DNS) / abuso de recurso
- Arquivo: `src/app/api/painel/dominio/route.ts`, `src/lib/vercel/client.ts:85`
- Linha/trecho: `dominio/route.ts:154 await addProjectDomain(domain)` — adiciona o domínio ao projeto Vercel **antes** de qualquer prova de posse.
- Evidência: o reseller informa um `domain` (validado só por formato), checa-se colisão com outro tenant, e chama-se `addProjectDomain`. A verificação de posse (DNS) só ocorre depois (`domainVerified:false`).
- Descrição: Um reseller pode registrar domínios que não controla no projeto Vercel da PMB. O domínio só serve tráfego após verificação DNS, então não há takeover de conteúdo. O risco é consumo da quota de domínios do projeto e poluição (e potencial dangling se outro tenant remover).
- Impacto: Baixo — sem servir conteúdo de terceiros; limitado pelo gate `domainVerified` e pela checagem de colisão.
- Cenário de risco: Reseller malicioso adiciona centenas de domínios para esgotar a quota Vercel do projeto, degradando a feature para todos.
- Recomendação: Rate-limit por tenant na rota; limitar nº de domínios por tenant; opcionalmente exigir início de verificação DNS antes de `addProjectDomain`.
- Correção aplicada: Nenhuma (read-only).
- Status: Recomendado
- Confiança: Média

### [Baixo] `metrics/public` expõe receita total da plataforma sem autenticação
- Agente responsável: Segurança Aplicacional
- Categoria: A01:2021 Broken Access Control (exposição de dado de negócio) · CWE-200
- Arquivo: `src/app/api/metrics/public/route.ts`
- Linha/trecho: `26-41` — soma `payment.amount` (mpStatus APPROVED) de **todo o ecossistema** e retorna `revenue` sem auth nem rate limit.
- Evidência: `prisma.payment.aggregate({ _sum: { amount }, where: { mpStatus: "APPROVED" } })` → `revenue` no payload público.
- Descrição: O endpoint alimenta contadores de marketing (revendedores, cursos, alunos), mas inclui a **receita bruta acumulada** da plataforma — um dado financeiro sensível para um SaaS.
- Impacto: Baixo (informativo de negócio), mas competitivamente sensível: concorrentes/investidores leem o faturamento total a qualquer momento.
- Cenário de risco: Inteligência competitiva; monitoramento contínuo do GMV da empresa via polling do endpoint.
- Recomendação: Remover `revenue` do payload público ou substituir por uma faixa/valor arredondado/curado manualmente. Manter só contadores não-financeiros.
- Correção aplicada: Nenhuma (read-only).
- Status: Requer decisão humana (pode ser intencional como prova social)
- Confiança: Alta

---

## Controles VERIFICADOS como corretos (não são achados — registrados para evitar retrabalho)

### [Informativo] XSS: `dangerouslySetInnerHTML` e react-markdown são seguros
- Arquivo: `src/app/(main)/seja-revendedor/page.tsx:42`, `src/app/livrecursos/page.tsx:46` (JSON-LD com `JSON.stringify` de objeto **hardcoded** — sem dado de usuário); `src/app/(main)/{termos,privacidade,contrato-de-revenda}/page.tsx:27` usam `<ReactMarkdown>` **sem** `rehype-raw`, e o `body` vem de arquivo estático do repo (`docs/legal/*.md` via `fs.readFileSync`), não de input. react-markdown não renderiza HTML cru por padrão. `eval`/`new Function`: **ausentes** (confirmado). **Sem XSS confirmado.**
- Confiança: Alta

### [Informativo] SQL injection: `$queryRawUnsafe` é parametrizado
- Arquivo: `src/app/api/admin/dashboard/route.ts:184`, `src/app/api/painel/dashboard/route.ts:145`. Ambos usam placeholders `$1..$N`; o único argumento "dinâmico" (`bucket` = `day|week|month`) deriva de enum server-side, nunca de input. `$queryRaw`/`$executeRaw` restantes (`fulfill.ts`, `coupons/consume.ts`, `financeiro/route.ts`) usam tagged templates parametrizados. **Sem SQL injection.**
- Confiança: Alta

### [Informativo] Upload: defesa robusta e consistente contra MIME/SVG/path traversal
- Arquivo: `src/lib/supabase/storage.ts`, todas as rotas `*/upload/route.ts`. O `path` enviado a `uploadVitrineAsset` é **sempre derivado no servidor** (`${tenant.id}/...`, `certificates/__pmb__/...`, `system/...`) — o nome do arquivo do cliente nunca entra no path (sem path traversal). Allowlist de MIME (png/jpg/webp), **SVG bloqueado** explicitamente, validação de magic bytes (`isValidImageMagic`) contra spoofing, limite de tamanho (2–5MB). **Sem upload inseguro.**
- Confiança: Alta

### [Informativo] IDOR/Access Control: rotas tenant/student-scoped filtram corretamente
- Arquivo: amostragem — `painel/alunos/[id]/route.ts` (`where:{id, tenantId:ctx.tenantId}`), `student/certificates/[id]/download/route.ts` (`cert.studentId !== session.studentId → 403`), `admin/revendedores/[id]/impersonate/route.ts` (SUPER_ADMIN-only + auditado + flag HMAC-assinado), `admin/notifications/broadcast` (SUPER_ADMIN). Guards (`requireResellerSession`, `requireStudentSession`, `requireSuperAdmin`, `requirePmbSales`) aplicados antes do acesso a dados. **Sem IDOR cross-tenant confirmado na amostra.**
- Confiança: Média (amostra de ~12 rotas das 200; cobertura total exige varredura completa)

### [Informativo] Webhooks, crypto, auth e proxy: implementações corretas
- MP: HMAC `timingSafeEqual`, idempotência por `mpPaymentId`, dev-bypass gated por flag nunca-em-prod, slug sanitizado, defesa-em-profundidade via `getPayment(token)` (`process.ts:221-275`). Asaas: token validado em tempo constante, sem dev-bypass (`asaas/webhook.ts`). Crypto: AES-256-GCM, IV aleatório, auth tag verificada, chave de 32 bytes validada (`crypto.ts`). Auth: bcrypt, cookies `__Secure-`/httpOnly/sameSite, rate limit de login **fail-closed em prod** (`ratelimit.ts:59-64` — nota: o comentário em `auth.ts:89` "falha aberto" está desatualizado), forgot-password fire-and-forget anti-enumeração, reset-token hashed/single-use/5min. Proxy deleta `x-tenant-id/slug` do cliente antes de re-injetar (`proxy.ts:182-183`). Sem CORS wildcard. Sem segredo em `NEXT_PUBLIC_*` (só ANON_KEY, pública por design). Sem token em `console.log`.
- Confiança: Alta
