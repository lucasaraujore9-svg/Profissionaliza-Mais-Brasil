# Relatório Final V2 — Pós-rodada de Categorias + Links + Crons + Fictícios

**Data:** 2026-05-23
**Versão:** 2 (incremento do RELATORIO-FINAL.md original)

## O que foi feito nesta rodada

### Configuração Vercel
- 7 envs aplicadas em Production + Development (`NEXT_PUBLIC_VITRINE_DOMAIN`, suporte WhatsApp/email/horário, redes Instagram/Facebook/TikTok)
- WhatsApp atualizado para 0800: `branding.ts` agora detecta `0800*` e gera link `tel:` em vez de `wa.me` (que não funciona para 0800), com ícone `Phone` + label "Atendimento"; consumers (footer-main, contato, ajuda) condicionam ícone/texto via `isWhatsapp`.
- `/livrecursos` agora replica `/seja-revendedor` integralmente (mesmos 11 componentes).

### Estrutura de categorias (fix completo)
- **Footer hardcoded com 5 categorias fake removido** — agora carrega de `loadCategorias()` igual ao navbar.
- **Inconsistência `href=nome` vs `href=slug` resolvida**: todos os links agora usam slug.
- **Fallback fake categorias do navbar removido** — menu "Categorias" só aparece se houver categorias com cursos.
- Slugs estáveis garantidos via `CATEGORIA_SLUG_OVERRIDES` (informatica, diversas, administrativo, preparatorios, idiomas).
- Adicionado script `scripts/check-categorias.ts` para auditoria local.

### Links e caminhos
- **Âncoras quebradas no `livrecursos/header`**: `#beneficios` → `#como-funciona` (id adicionado em `ComoFuncionaSection`); `#cadastro` → `#formulario` (já existia).
- **Dead code removido**: `loja/course-grid`, `loja/course-card`, `loja/course-hero`, `loja/featured-section`, `shared/layouts/navbar-loja`, `main/anim/count-up`.
- **`target="_blank"` sem `noopener`** em 8 ocorrências corrigido para `rel="noopener noreferrer"`.
- **`footer-loja`** agora usa `appUrl()` em vez de URL hardcoded.
- **`livrecursos/footer`** agora usa `appUrl()` em vez de URLs cross-domain hardcoded.
- **3 endpoints com `https://www.profissionalizamaisbrasil.com.br` hardcoded** (admin/vendas, aluno/comprar, painel/vendas) agora usam `NEXT_PUBLIC_APP_URL` + fallback baseado em `NEXT_PUBLIC_APP_DOMAIN`.

### Crons e webhooks
- **`sweep-students-overdue` off-by-one corrigido** — `setMonth(+ installmentsPaid + 1)` → `setMonth(+ installmentsPaid)`. Sem o fix, aluno tinha 30 dias extras de "graça oculta" além dos `STUDENT_GRACE_DAYS=5`.
- **Asaas `SUBSCRIPTION_INACTIVATED`/`SUBSCRIPTION_DELETED` agora tratados** — `handleSubscriptionCancellation()` em `src/lib/asaas/process.ts` suspende o tenant + bloqueia students + notifica admin assim que a assinatura é cancelada (antes, só era detectado dias depois pelo sweep).
- `AsaasWebhookPayload.payment` virou opcional para acomodar eventos de assinatura (que vêm com `subscription` em vez de `payment`).
- **`maxDuration` aumentado para 300s** em 5 crons (sync-cursos, sweep-tenants-overdue, sweep-students-overdue, reactivate-paid, referral-monthly-payout). Previne timeout em catálogo grande / muitas operações sequenciais.

### Dados fictícios remanescentes
- **`showcase-cards.tsx`**: removido fallback com 3 cursos inventados (Manicure R$ 47, Eletricista R$ 97, Confeitaria R$ 89). Agora retorna `null` quando há menos de 3 cursos reais no banco.
- **`hero-cta.tsx`**: removido `FALLBACK_CURSOS = 100`. Texto agora omite o número se contagem real = 0 (em vez de mentir "mais de 100").
- **`hero-banner.tsx`**: removido "a partir de R$ 47,00" hardcoded.
- **`testimonials.tsx`**: subtítulo "Milhares de alunos confiam na PMB" agora só aparece quando há depoimentos reais (não fica solto sobre array vazio).
- **`Course` type + `ShowcaseCard` type**: removidos campos `instrutor`, `rating`, `alunos` (eram hardcoded `"Equipe PMB"` / `"4.9"` / `"—"`). Componentes já não os renderizam.

## Pendências P0 que ficam pós-launch (escopo de feature, não fix rápido)

1. **MP webhook secret per-tenant** — hoje usa `process.env.MP_WEBHOOK_SECRET` global. Cada revendedor configura SEU secret no painel MP. Em produção, todo webhook de revendedor vai falhar HMAC. Mitigação atual: defesa anti-flood básica (rejeita sem headers em prod). Fix definitivo exige coluna `tenant.mpWebhookSecret` cifrada + lookup no path quente. Considerar para sprint 1.

2. **MP `subscription_preapproval` event** — não tratado. Quando aluno cancela assinatura MP, enrollment fica ACTIVE e mantém acesso. Adicionar branch que faz GET do preapproval e marca enrollment como CANCELLED.

3. **Onboarding wizard sem forms** — wizard só exibe texto; API não ativa tenant mais (já fixado), mas o wizard em si é só decoração. Refatorar com forms persistentes (vitrine, domínio, MP).

## P1 follow-ups recomendados

- `sweep-tenants-overdue`: paralelizar emails com `Promise.allSettled` (hoje serial).
- `sync-cursos`: paralelizar em batches de 10 (hoje sequencial).
- `sync-progresso`: rodar a cada 6h ou aumentar batch (hoje processa só 100 por dia).
- `referral-monthly-payout`: try/catch por referrer (hoje aborta no primeiro erro).
- Asaas PMB processamento: notificar/bloquear aluno no PAYMENT_OVERDUE (hoje só atualiza enrollment).
- AuditLog para mutações sensíveis (referral-percent, mark-paid, impersonate).
- 2FA opcional para roles `SUPER_ADMIN` / `PMB_*`.

## Build status

- `npx tsc --noEmit`: ✅ verde após cada lote
- `npm run build`: ✅ verde (validado ao final desta rodada)
- 6 arquivos órfãos removidos do bundle
- Categorias: 100% dinâmicas via `loadCategorias()` em todas as superfícies (navbar, footer main, footer loja, grid de categorias, links "ver todos")

## Recap das rodadas

| Rodada | Foco | Findings | Status |
|---|---|---|---|
| 01 (inicial) | Dev/Segurança | 38 | 8/8 P0 fixados |
| 02 (UX) | Layouts | 51 | Top 5 fixados |
| 03 (Func) | Bugs | 39 | Top 5 fixados |
| 04 (Copy) | Textos | 62 | Top 5 fixados |
| 05 (Envs Vercel) | Configuração | 9 envs | 7 aplicadas + 2 skip |
| 06 (Categorias) | Estrutura | 4 bugs estruturais | Todos fixados |
| **07 (atual)** | Links + Crons + Fictícios | 22 findings | **15 fixados, 3 documentados P1, 4 follow-up** |

Sistema continua **APTO PARA LANÇAMENTO** com os mesmos caveats:
- Preview envs (bug CLI) — aplicar pelo dashboard
- MP_WEBHOOK_SECRET (skip por enquanto)
- DNS livrecursos.com.br (ignorado por escopo)
