# Relatório — Agente 04: Autenticação, Autorização e Controle de Acesso

> Auditoria READ-ONLY. Nenhum código modificado. Evidências citam `arquivo:linha`.
> Base: o app NÃO tem RLS efetivo (FATO CRÍTICO #1 do _context.md) — toda autorização
> vive em código (guards + filtros `where tenantId`). Logo, a cobertura de guards e o
> escopo por tenant são a única linha de defesa.

## Resumo executivo

A arquitetura de auth está, no geral, **sólida e madura**: NextAuth v5 JWT com cookies
endurecidos, rate-limit de login, tokens de reset/invite com hash SHA-256 + TTL +
uso único, comparação timing-safe para secrets (`safeEqual`), impersonation assinada
com HMAC e restrita a SUPER_ADMIN com audit log, e filtros `where tenantId` consistentes
nas rotas `painel/*` e `aluno/*` (tenantId sempre vindo da **sessão**, nunca de
params/body). Os caps de desconto (PMB_SALES 50%, consultor `maxDiscount`) e a proteção
do "último SUPER_ADMIN" são validados server-side.

Os achados são de severidade **baixa a média** — endurecimentos e inconsistências, não
brechas de bypass direto. As 30 rotas sem guard são, na esmagadora maioria, **públicas
intencionais** (loja, webhooks, checkout anônimo, cobrança por magic-link). Nenhuma rota
`admin/*` ou `painel/*` ficou sem autenticação.

---

## Achados

### [Médio] `mustChangePassword` só é enforced no client (login-form)
- Agente responsável: 04 — Auth/Acesso
- Categoria: Controle de acesso / bypass de fluxo obrigatório
- Arquivo: `src/components/auth/login-form.tsx:46-57`; `src/lib/auth/admin-session.ts`; `src/app/admin/layout.tsx`; `src/app/painel/layout.tsx`; `src/app/api/auth/alterar-senha-inicial/route.ts`
- Linha/trecho: o flag `mustChangePassword` é populado no JWT (`auth.ts:164,231`) mas só consultado em `login-form.tsx:57` (`const mustChange = session.user?.mustChangePassword === true`). Nenhum guard (`guards.ts`, `admin-session.ts`, `student-session.ts`) nem layout server-side (`admin/layout.tsx`, `painel/layout.tsx`) verifica o flag.
- Evidência: `grep mustChangePassword` retorna apenas client + jwt callback; guards/layouts não checam.
- Descrição: Um usuário recém-convidado/com senha temporária e `mustChangePassword=true` consegue navegar direto para `/admin`, `/painel` ou chamar qualquer API autenticada, ignorando a tela de troca de senha — basta não passar pela UI de login (cookie já presente, deep-link, ou requisição direta à API).
- Impacto: A política "trocar senha no 1º acesso" é apenas cosmética. Senhas temporárias/de convite continuam válidas indefinidamente para acesso real.
- Cenário de risco: Admin cria PMB_SALES com senha temporária comunicada por canal inseguro; o convidado (ou quem interceptou a senha) usa a conta sem nunca trocá-la.
- Recomendação: Adicionar enforcement server-side nos guards/layouts: se `session.user.mustChangePassword === true`, redirecionar (páginas) / retornar 403 (APIs, exceto `alterar-senha-inicial`, `signout`).
- Correção aplicada: Nenhuma (read-only).
- Status: Recomendado
- Confiança: Alta

### [Baixo] Custo bcrypt inconsistente (10 vs 12)
- Agente responsável: 04
- Categoria: Hardening criptográfico
- Arquivo: `src/app/api/auth/alterar-senha-inicial/route.ts:45`; `src/app/api/auth/reset-password/route.ts:52`
- Linha/trecho: `alterar-senha-inicial` usa `hash(newPassword, 10)`; `reset-password` usa `hash(data.password, 12)`.
- Evidência: confirmado por leitura direta dos dois arquivos.
- Descrição: O custo de hash varia conforme o fluxo de criação/alteração de senha. Senhas trocadas no 1º acesso ficam com 4x menos rounds que as redefinidas via reset.
- Impacto: Defesa-em-profundidade reduzida para um subconjunto de senhas em caso de vazamento do banco. Baixo por si só.
- Cenário de risco: Vazamento de `passwordHash` + crack offline — hashes cost-10 caem mais rápido.
- Recomendação: Padronizar em 12 (ou um `BCRYPT_COST` central) em todos os pontos de `hash()`.
- Correção aplicada: Nenhuma.
- Status: Recomendado
- Confiança: Alta

### [Baixo] Mínimo de senha inconsistente entre login (6) e reset/troca (8)
- Agente responsável: 04
- Categoria: Política de senha
- Arquivo: `src/lib/auth.ts:15` (`password: z.string().min(6)`); `src/app/api/auth/reset-password/route.ts:13-15` (`min(8)`); `src/app/api/auth/alterar-senha-inicial/route.ts:9` (`min(8)`).
- Evidência: leitura direta.
- Descrição: O schema de login aceita senhas de 6 caracteres; os fluxos de definição exigem 8. Senhas legadas/seed de 6 chars continuam válidas. Não há requisito de complexidade (maiúscula/dígito/símbolo) em nenhum ponto.
- Impacto: Senhas curtas (6) podem existir e logar. Política fraca por padrão.
- Cenário de risco: Conta com senha de 6 chars exposta a brute-force (mitigado parcialmente pelo rate-limit por IP+email — ver achado abaixo).
- Recomendação: Unificar em `min(8)` + considerar verificação de senha vazada (k-anonymity HIBP) para roles internos.
- Correção aplicada: Nenhuma.
- Status: Recomendado
- Confiança: Alta

### [Baixo] Rate-limit de login falha em modo ABERTO sem Redis
- Agente responsável: 04
- Categoria: Anti-brute-force / disponibilidade do controle
- Arquivo: `src/lib/auth.ts:90-105` (comentário linha 89: "Falha em modo aberto se o Redis não estiver configurado (dev)").
- Evidência: o `authorize()` chama `rateLimitByKey`; se Redis indisponível, a função retorna `ok` e o login prossegue sem limite.
- Descrição: Se o Upstash Redis estiver indisponível/desconfigurado em produção (ex.: env faltando após deploy), o brute-force fica completamente destravado, em vez de fail-closed.
- Impacto: Em incidente de Redis, a única proteção anti-brute-force some silenciosamente.
- Cenário de risco: Rotação de credencial Upstash mal feita → janela sem rate-limit → ataque de força bruta em massa.
- Recomendação: Em produção, fail-closed (negar/atrasar) ou alarmar quando o backend de rate-limit estiver indisponível. Documentar o trade-off.
- Correção aplicada: Nenhuma.
- Status: Requer decisão humana
- Confiança: Média

### [Baixo] Sessão JWT com `maxAge` default de 30 dias, sem rotação curta
- Agente responsável: 04
- Categoria: Gestão de sessão
- Arquivo: `src/lib/auth.ts:60` (`session: { strategy: "jwt" }` — sem `maxAge`); confirma 30d em `src/lib/auth/impersonate.ts:6` (`SESSION_MAX_AGE = 30 * 24 * 60 * 60`).
- Evidência: nenhum `maxAge`/`updateAge` em `auth.ts`.
- Descrição: Tokens valem 30 dias. Como JWT é stateless, revogar acesso (ex.: desativar um User) NÃO invalida sessões já emitidas — o `status !== ATIVO` só é checado no `authorize()` (login), não a cada request. Mudança de role idem: o JWT carrega `role`/`tenantId` antigos até expirar/relogar.
- Impacto: Desativar/rebaixar um usuário não tem efeito imediato; conta comprometida permanece válida por até 30 dias.
- Cenário de risco: SUPER_ADMIN desativa um PMB_SALES suspeito; o token roubado continua acessando `/admin` por semanas.
- Recomendação: Reduzir `maxAge` (ex.: 7d) + `updateAge`; ou revalidar `status`/`role` no `jwt` callback periodicamente (lookup no DB com cache curto); para casos críticos, considerar denylist de sessão.
- Correção aplicada: Nenhuma.
- Status: Requer decisão humana
- Confiança: Alta

### [Baixo] Rotas públicas de cobrança usam `paymentId` como segredo (bearer-by-obscurity)
- Agente responsável: 04
- Categoria: Autorização / IDOR mitigado
- Arquivo: `src/app/api/cobranca/[paymentId]/route.ts`, `.../billing-info/route.ts`, `.../pay-card/route.ts`; gate em `src/lib/asaas/ownership.ts:11`
- Linha/trecho: as 3 rotas só validam `isKnownAsaasPayment(paymentId)` — verifica se o ID existe em `Payment`/`TenantPayment`, mas NÃO amarra a um usuário/sessão. `billing-info` retorna PIX QR + dados de boleto (`billing-info/route.ts:39-42`).
- Evidência: leitura direta das 3 rotas; nenhuma chama guard/`auth()`.
- Descrição: Quem conhecer/adivinhar um `pay_xxxxxxxx` do Asaas pode consultar status, valor, descrição e meios de pagamento (incluindo QR PIX) sem autenticação. É o fluxo de magic-link de pagamento (revendedor paga mensalidade sem login), então é intencional — mas o controle de acesso é a entropia do ID do Asaas.
- Impacto: Vazamento de detalhe financeiro de uma cobrança específica se o ID vazar (logs, referer, histórico de navegador, share). `pay-card` tem rate-limit; os GETs não.
- Cenário de risco: ID de cobrança em URL compartilhada/log permite a terceiro ver valor e gerar QR PIX da cobrança.
- Recomendação: Aceitável se IDs do Asaas têm entropia alta; reforçar com token efêmero adicional na magic-link, e adicionar rate-limit aos GETs (`route.ts`, `billing-info`).
- Correção aplicada: Nenhuma.
- Status: Requer decisão humana
- Confiança: Alta

### [Baixo] `alterar-senha-inicial` não verifica o flag e não exige senha atual
- Agente responsável: 04
- Categoria: Fluxo de senha
- Arquivo: `src/app/api/auth/alterar-senha-inicial/route.ts:19-54`
- Linha/trecho: exige apenas `session.user` válido; não confere `mustChangePassword === true` nem a senha atual.
- Descrição: Qualquer usuário logado pode redefinir a própria senha sem informar a senha atual via este endpoint. Risco baixo (é a própria conta), mas em cenário de sessão sequestrada (XSS/cookie) o atacante troca a senha sem conhecer a antiga, travando o dono fora.
- Impacto: Facilita account takeover persistente a partir de sessão comprometida.
- Recomendação: Exigir `currentPassword` para troca fora do fluxo de 1º acesso; ou restringir o endpoint a `mustChangePassword === true`.
- Correção aplicada: Nenhuma.
- Status: Recomendado
- Confiança: Média

### [Informativo] PMB_SALES e PMB_RESELLER_MGR podem alterar política/billing de qualquer tenant
- Agente responsável: 04
- Categoria: Granularidade de autorização
- Arquivo: `src/app/api/admin/revendedores/[id]/policy/route.ts:24` (`requireAdminSession` = qualquer PMB_TEAM, não SUPER_ADMIN); contraste com `impersonate/route.ts:28` que restringe a SUPER_ADMIN.
- Descrição: `requireAdminSession`/`requirePmbTeam` aceitam SUPER_ADMIN + PMB_SALES + PMB_RESELLER_MGR de forma indistinta em várias rotas `admin/revendedores/[id]/*`. Operações sensíveis (billingMode AUTO/MANUAL, cancellation policy) ficam disponíveis a PMB_SALES. Pode ser intencional, mas é uma superfície ampla de privilégio para o papel de menor confiança.
- Recomendação: Revisar quais rotas `admin/revendedores/[id]/*` realmente devem ser PMB_SALES vs SUPER_ADMIN-only; aplicar `requireSuperAdmin` onde for crítico (billing/policy).
- Status: Requer decisão humana
- Confiança: Média

### [Informativo] Convite reusa coluna `resetToken` com TTL de 7 dias vs reset de 5 min
- Agente responsável: 04
- Arquivo: `src/lib/auth/invite.ts:6` (`INVITE_EXPIRATION_DAYS = 7`) grava em `resetToken`/`resetTokenExpires`; `forgot-password/route.ts:10` usa 5 min na mesma coluna.
- Descrição: Mesma coluna serve convite (7d) e reset (5min). Não é vulnerabilidade — o `resetTokenExpires` é respeitado no consumo (`reset-password/route.ts:61-68,93-101`), tokens são SHA-256, uso único (zerados após uso). Apenas registro: convites têm janela longa (7d), aceitável para onboarding.
- Status: Não reproduzido (sem brecha)
- Confiança: Alta

---

## Pontos validados (sem achado / corretos)

- **Tokens reset/invite**: `randomBytes(32)` (256 bits), armazenados como SHA-256, TTL + uso único (zerados após consumo). `reset-token.ts`, `reset-password/route.ts:70-77,103-111`. Correto.
- **Comparação timing-safe**: `safeEqual` (`bearer.ts:7`) e `hmacVerify` (`impersonate.ts:92`) usam `timingSafeEqual`. Cron/internal secrets validados via `isCronAuthorized`/`isInternalAuthorized`. Correto.
- **Impersonation**: flag assinado com HMAC SHA-256 (`impersonate.ts:88-121`), só SUPER_ADMIN inicia (`impersonate/route.ts:28`), backup validado contra `adminUserId` no término (`end-impersonation/route.ts:44-62`), audit log (`logAudit`, `impersonate/route.ts:110`). Robusto.
- **IDOR/tenant scoping (painel/*)**: TODAS as rotas `[id]` amostradas (`painel/alunos/[id]`, `painel/cursos/[id]`, `painel/cupons/[id]/toggle`, `painel/equipe/[id]`) usam `where: { id, tenantId: ctx.tenantId }` com `tenantId` da SESSÃO. `painel/equipe/[id]` revalida `member.tenantId === tenantId`. Sem trust em params/body.
- **Escalada de privilégio**: cap PMB_SALES 50% (`admin/cupons/route.ts:90-101`, `validate/route.ts:63`, `toggle`), cap consultor `maxDiscount` (`painel/cupons/route.ts:94-113`) e proteção do último SUPER_ADMIN (`admin/equipe/[id]/route.ts:90-101,130-137`) — todos server-side. `admin/equipe` PATCH limita `role` ao enum PMB (não dá para virar RESELLER/STUDENT).
- **Price tampering**: `aluno/comprar` (`route.ts:120-125`) e `loja/checkout` (`route.ts:164`) derivam preço de lookup server-side; cupom escopado por tenant. Cliente não envia preço.
- **Proteção de páginas server-side**: `admin/layout.tsx:16-17`, `painel/layout.tsx:23-30`, `aluno/layout.tsx:53-62` checam role na sessão (não confiam no proxy). `aluno/layout.tsx:60` tem cross-tenant guard (`session.tenantId !== tenant.id → /logout`).
- **Login do aluno escopado por tenant**: `auth.ts:170-202` resolve tenant via headers do proxy (sanitizados em `proxy.ts:182-183`) e só autoriza Student daquele tenant; bloqueia BLOQUEADO/INATIVO.
- **Proxy**: sanitiza `x-tenant-id`/`x-tenant-slug` do cliente (`proxy.ts:182-183`) e só re-injeta após resolver.

---

## Matriz de permissões (confirmado por leitura de código)

| Recurso | Ação | Público | Logado (qualquer) | Admin (PMB) | Outro perfil | Regra atual | Camada | Risco | Correção |
|---|---|---|---|---|---|---|---|---|---|
| `/admin/**` (páginas) | acessar | ❌ | ❌ | ✅ PMB_TEAM | ❌ RESELLER/STUDENT | `requireAdminSession` (layout) | API+UI server | OK | — |
| `/painel/**` (páginas) | acessar | ❌ | ❌ | ❌ | ✅ só RESELLER c/ tenant | `auth()` role+tenantId (layout) | API+UI server | OK | — |
| `/aluno/**` (páginas) | acessar | ❌ | ❌ | ❌ | ✅ só STUDENT do tenant | `requireStudentSession` + cross-tenant guard | API+UI server | OK | — |
| `admin/equipe/[id]` | mudar role/status | ❌ | ❌ | ✅ só SUPER_ADMIN | ❌ | `requireSuperAdmin` + last-super guard | API | OK | — |
| `admin/revendedores/[id]/impersonate` | impersonar | ❌ | ❌ | ✅ só SUPER_ADMIN | ❌ | role check explícito + HMAC + audit | API | OK | — |
| `admin/revendedores/[id]/policy` `/billing` | billing/policy | ❌ | ❌ | ✅ todo PMB_TEAM (inc. SALES) | ❌ | `requireAdminSession` | API | Médio | restringir a SUPER_ADMIN |
| `painel/alunos/[id]` etc | CRUD aluno | ❌ | ❌ | ❌ | ✅ só dono do tenant | `where {id, tenantId: sessão}` | API | OK | — |
| `painel/cupons` | criar cupom | ❌ | ❌ | ❌ | ✅ RESELLER/consultor (cap) | cap `maxDiscount` server-side | API | OK | — |
| `admin/cupons` | criar cupom | ❌ | ❌ | ✅ (cap 50% se SALES) | ❌ | `PMB_SALES_CAP=50` server-side | API | OK | — |
| `aluno/comprar`, `loja/checkout` | comprar | ✅/STUDENT | — | — | — | preço server-side, cupom por tenant | API | OK | — |
| `cobranca/[paymentId]/*` | ver/pagar | ✅ (ID=segredo) | — | — | — | `isKnownAsaasPayment` (sem dono) | API | Baixo | token efêmero + RL nos GETs |
| `auth/reset-password`, `forgot-password` | resetar senha | ✅ (token) | — | — | — | token SHA-256 + TTL + RL | API | OK | — |
| `auth/alterar-senha-inicial` | trocar senha | ❌ | ✅ (própria conta) | ✅ | ✅ | só `auth()`, sem `mustChange`/senha atual | API | Baixo | exigir senha atual |
| qualquer rota com `mustChangePassword=true` | acesso pré-troca | ❌ | ✅ (bypassa troca) | ✅ | ✅ | enforce só no client | UI apenas | **Médio** | enforce server-side |
| `cron/*`, `internal/resolve-tenant` | executar | ❌ | ❌ | ❌ | ❌ | `CRON_SECRET`/`INTERNAL_SECRET` timing-safe | API | OK | — |
| webhooks `mercadopago`/`asaas` | receber | ✅ (assinatura) | — | — | — | HMAC / token header | API | OK (ver agente webhooks) | — |

---

## Rotas SEM mecanismo de auth detectado (30 de 200)

Scan: ausência de qualquer `require*`/`auth()`/`*Session`/`isCron/Internal`/`safeEqual`/bearer.

**Públicas intencionais (sem achado):**
- `auth/[...nextauth]` — handler NextAuth (auth interna)
- `auth/forgot-password`, `auth/reset-password` — gated por token + rate-limit
- `webhooks/mercadopago`, `webhooks/asaas` — gated por assinatura/token (ver agente webhooks)
- `leads`, `pmb/leads`, `loja/leads`, `revendedores/cadastro` — captação pública (validar anti-spam/rate-limit no agente de rotas)
- `loja/checkout`, `loja/courses`, `loja/cursos/[slug]`, `loja/cupom/validar`, `loja/confirmacao/[id]` — vitrine pública, escopo por `x-tenant-id` do proxy
- `checkout`, `checkout/status`, `checkout/confirmacao/[id]/status` — onboarding/compra anônima
- `home/showcase`, `metrics/public`, `health`, `push/public-key` — conteúdo/health público
- `public/validate-ref`, `public/capture-ref` — referral público

**Descontinuadas (retornam 410, sem risco):**
- `painel/certificate-template/upload` (410), `painel/referrals/request-payout` (410)

**A revisar (achado registrado acima):**
- `cobranca/[paymentId]`, `cobranca/[paymentId]/billing-info`, `cobranca/[paymentId]/pay-card`, `admin/end-impersonation` — gated por segredo/HMAC, não por sessão (intencional, ver achados Baixo).

**Conclusão:** Nenhuma rota `admin/*` ou `painel/*` com mutação ficou sem autenticação real. Não há vazamento de bypass direto.
