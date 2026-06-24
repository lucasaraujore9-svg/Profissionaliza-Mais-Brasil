# Inventário — Profissionaliza Mais Brasil
_Data: 2026-06-24 · Somente leitura · Base de cobertura total (sem amostragem) para a Fase 1._

> Gerado a partir do filesystem em `main`. Cada item aqui deve receber veredito (OK/Achado/N/A) nas fases seguintes.

## Contagens

| Categoria | Total |
|---|---|
| Telas (`page.tsx` → URLs únicas) | 131 |
| `layout.tsx` | 9 |
| `loading.tsx` | 5 |
| `error.tsx` | 5 |
| `not-found.tsx` | 6 |
| `global-error.tsx` | 1 |
| `template.tsx` / `default.tsx` | 0 / 0 |
| Route handlers (`route.ts`) | 294 |
| — métodos HTTP exportados | 390 (GET 137 · POST 148 · PUT 31 · PATCH 44 · DELETE 30) |
| Server Actions (`"use server"`) | 4 arquivos |
| Componentes (`components/**/*.tsx`) | 324 |
| Módulos `lib/` (`.ts` não-teste) | 193 |
| Crons (`api/cron/*`) | 16 |
| Webhooks (`api/webhooks/*`) | 3 |
| Models Prisma | 44 |
| Enums Prisma | 33 |
| Migrations | 75 |
| Testes (arquivos · casos) | 37 · 218 |
| Segmentos dinâmicos distintos | 10 |
| Middleware | `src/proxy.ts` (convenção `proxy` do Next 16) |

## Telas (URLs navegáveis)

- `/`
- `/admin`
- `/admin/alunos`
- `/admin/alunos/[id]`
- `/admin/analytics`
- `/admin/atendimento`
- `/admin/automacao`
- `/admin/automacao/conexao`
- `/admin/automacao/mensagens`
- `/admin/banner`
- `/admin/catalogo`
- `/admin/certificados`
- `/admin/certificados/configuracoes`
- `/admin/certificados/emitir`
- `/admin/certificados/template-padrao`
- `/admin/comunicacao`
- `/admin/configuracoes`
- `/admin/configuracoes/automacao`
- `/admin/configuracoes/certificados`
- `/admin/configuracoes/indicacoes`
- `/admin/configuracoes/rastreamento`
- `/admin/configuracoes/unidade-tecnica`
- `/admin/equipe`
- `/admin/equipe/[id]`
- `/admin/financeiro`
- `/admin/indicacoes`
- `/admin/indicacoes/comissoes`
- `/admin/indicacoes/saques`
- `/admin/leads`
- `/admin/leads-revenda`
- `/admin/meu-perfil`
- `/admin/notificacoes`
- `/admin/relatorios`
- `/admin/relatorios/[type]`
- `/admin/revendedores`
- `/admin/revendedores/[id]`
- `/admin/revendedores/[id]/comissoes`
- `/admin/treinamentos`
- `/admin/treinamentos/assistir`
- `/admin/treinamentos/assistir/[moduleId]`
- `/admin/vendas`
- `/admin/vendas/alunos`
- `/admin/vendas/alunos/[id]`
- `/admin/vendas/cupons`
- `/admin/vendas/nova`
- `/admin/vitrine`
- `/ajuda`
- `/alterar-senha-inicial`
- `/aluno`
- `/aluno/certificados`
- `/aluno/certificados/[id]`
- `/aluno/comprar`
- `/aluno/cursos`
- `/aluno/notificacoes`
- `/aluno/pagamentos`
- `/aluno/perfil`
- `/aluno/suporte`
- `/categoria/[slug]`
- `/certificado`
- `/checkout`
- `/checkout/confirmacao`
- `/cobranca/[paymentId]`
- `/como-funciona`
- `/contato`
- `/contrato-de-revenda`
- `/cursos`
- `/cursos-tecnicos/ir`
- `/cursos/[slug]`
- `/eja/ir`
- `/forgot-password`
- `/inadimplente`
- `/livrecursos`
- `/login`
- `/logout`
- `/loja`
- `/loja/checkout`
- `/loja/confirmacao`
- `/loja/contato`
- `/loja/curso/[slug]`
- `/loja/cursos`
- `/loja/pacote/[slug]`
- `/loja/pagar/[id]`
- `/loja/suspended`
- `/lp-revenda2`
- `/offline`
- `/pacotes/[slug]`
- `/painel`
- `/painel/alunos`
- `/painel/alunos/[id]`
- `/painel/atendimento`
- `/painel/automacao`
- `/painel/automacao/conexao`
- `/painel/automacao/mensagens`
- `/painel/certificados`
- `/painel/certificados/emitidos`
- `/painel/certificados/emitir`
- `/painel/certificados/template`
- `/painel/comunicacao`
- `/painel/configuracoes`
- `/painel/cupons`
- `/painel/cursos`
- `/painel/dominio`
- `/painel/equipe`
- `/painel/financeiro`
- `/painel/indicacoes`
- `/painel/indicacoes/materiais`
- `/painel/indicacoes/sacar`
- `/painel/leads`
- `/painel/leads/configuracao`
- `/painel/notificacoes`
- `/painel/onboarding`
- `/painel/revendas`
- `/painel/revendas/[id]`
- `/painel/revendas/leads`
- `/painel/revendas/nova`
- `/painel/treinamentos`
- `/painel/treinamentos/[moduleId]`
- `/painel/vendas`
- `/painel/vendas/nova`
- `/painel/vitrine`
- `/placar`
- `/privacidade`
- `/reembolso`
- `/reset-password`
- `/seja-revendedor`
- `/seja-revendedor/checkout`
- `/seja-revendedor/pre-live`
- `/sobre`
- `/termos`
- `/validar`
- `/validar/[code]`

## Route handlers (por área)

### `(api root)` (1)
- `/llms.txt` — GET

### `admin` (130)
- `/api/admin/alunos` — GET, POST
- `/api/admin/alunos/[id]` — GET, PATCH
- `/api/admin/alunos/[id]/bloquear` — POST
- `/api/admin/alunos/[id]/cursos` — GET, POST, DELETE
- `/api/admin/alunos/[id]/desbloquear` — POST
- `/api/admin/alunos/[id]/enrollments/[enrollmentId]/cancelar` — POST
- `/api/admin/alunos/[id]/impersonate` — POST
- `/api/admin/alunos/[id]/notes` — GET, POST, DELETE
- `/api/admin/alunos/[id]/notify` — POST
- `/api/admin/alunos/[id]/plataforma-senha` — POST
- `/api/admin/alunos/[id]/reenviar-email` — POST
- `/api/admin/alunos/[id]/reset-password` — POST
- `/api/admin/alunos/global` — GET
- `/api/admin/analytics` — GET
- `/api/admin/atendimento/[id]` — PATCH
- `/api/admin/automacao/config` — GET, PUT
- `/api/admin/automacao/templates` — GET, PUT
- `/api/admin/automacao/whatsapp/connect` — POST
- `/api/admin/automacao/whatsapp/disconnect` — POST
- `/api/admin/automacao/whatsapp/pair` — POST
- `/api/admin/automacao/whatsapp/status` — GET
- `/api/admin/banner` — GET, POST
- `/api/admin/banner/[id]` — PATCH, DELETE
- `/api/admin/banner/upload` — POST
- `/api/admin/catalogo` — GET
- `/api/admin/catalogo/[id]` — GET, PATCH
- `/api/admin/catalogo/bulk` — GET, PUT
- `/api/admin/catalogo/bulk-provider-visibility` — POST
- `/api/admin/catalogo/categorias` — GET, POST
- `/api/admin/catalogo/categorias/[id]` — PATCH, DELETE
- `/api/admin/catalogo/sync` — POST
- `/api/admin/catalogo/sync-log` — GET
- `/api/admin/catalogo/tenants-lookup` — GET
- `/api/admin/certificate-template` — GET, PUT
- `/api/admin/certificate-template/preview` — POST
- `/api/admin/certificate-template/upload` — POST, DELETE
- `/api/admin/certificates` — GET
- `/api/admin/certificates/[id]/download` — GET
- `/api/admin/certificates/[id]/regenerate` — POST
- `/api/admin/certificates/[id]/revoke` — POST
- `/api/admin/certificates/enrollments` — GET
- `/api/admin/certificates/issue` — POST
- `/api/admin/certificates/regenerate-all` — POST
- `/api/admin/config` — GET, PATCH
- `/api/admin/config/test-asaas` — POST
- `/api/admin/config/test-mp` — POST
- `/api/admin/config/test-plataforma` — POST
- `/api/admin/cupons` — GET, POST
- `/api/admin/cupons/[id]/toggle` — PATCH
- `/api/admin/cupons/validate` — POST
- `/api/admin/dashboard` — GET
- `/api/admin/end-impersonation` — POST
- `/api/admin/equipe` — GET, POST
- `/api/admin/equipe/[id]` — GET, PATCH, DELETE
- `/api/admin/equipe/[id]/resend-invite` — POST
- `/api/admin/financeiro` — GET
- `/api/admin/financeiro/overdue` — GET
- `/api/admin/financeiro/referral-payouts` — GET
- `/api/admin/financeiro/referral-payouts/[id]/fail` — POST
- `/api/admin/financeiro/referral-payouts/[id]/mark-paid` — POST
- `/api/admin/financeiro/referral-payouts/[id]/note` — POST
- `/api/admin/financeiro/referral-payouts/[id]/proof` — POST
- `/api/admin/financeiro/referral-payouts/[id]/proof/download` — GET
- `/api/admin/financeiro/tenant-payments` — GET
- `/api/admin/financeiro/tenant-payments/[id]/mark-paid` — POST
- `/api/admin/financeiro/tenant-payments/[id]/note` — POST
- `/api/admin/home-sections` — GET, POST
- `/api/admin/home-sections/[id]` — PATCH, DELETE
- `/api/admin/home-sections/options` — GET
- `/api/admin/home-sections/reorder` — PATCH
- `/api/admin/leads` — GET
- `/api/admin/leads-revenda/[id]` — PATCH
- `/api/admin/leads-revenda/distribuicao` — GET, PUT
- `/api/admin/leads/[id]` — GET, DELETE
- `/api/admin/leads/[id]/activities` — POST
- `/api/admin/leads/[id]/stage` — PATCH
- `/api/admin/leads/[id]/whatsapp` — POST
- `/api/admin/me` — GET, PUT
- `/api/admin/me/password` — PUT
- `/api/admin/notifications/auto-config` — GET, PATCH
- `/api/admin/notifications/broadcast` — POST
- `/api/admin/pacotes` — GET, POST
- `/api/admin/pacotes/[id]` — GET, PUT, DELETE
- `/api/admin/pacotes/capa` — POST
- `/api/admin/pacotes/courses-lookup` — GET
- `/api/admin/referrals/clawback/resolve` — POST
- `/api/admin/referrals/commissions/export` — GET
- `/api/admin/referrals/payouts/[id]/approve` — POST
- `/api/admin/referrals/payouts/[id]/fail` — POST
- `/api/admin/referrals/payouts/export` — GET
- `/api/admin/relatorios` — GET
- `/api/admin/relatorios/[type]` — GET
- `/api/admin/revendedores` — GET, POST
- `/api/admin/revendedores/[id]` — GET, DELETE
- `/api/admin/revendedores/[id]/anonimizar` — POST
- `/api/admin/revendedores/[id]/billing` — PATCH
- `/api/admin/revendedores/[id]/comissoes/demonstrativo` — GET
- `/api/admin/revendedores/[id]/comissoes/export` — GET
- `/api/admin/revendedores/[id]/impersonate` — POST
- `/api/admin/revendedores/[id]/manager` — PATCH
- `/api/admin/revendedores/[id]/notes` — GET, POST
- `/api/admin/revendedores/[id]/password` — PATCH
- `/api/admin/revendedores/[id]/payments/[paymentId]` — PATCH, DELETE
- `/api/admin/revendedores/[id]/policy` — PATCH
- `/api/admin/revendedores/[id]/sales` — PATCH
- `/api/admin/revendedores/[id]/slug` — PATCH
- `/api/admin/revendedores/[id]/status` — PATCH
- `/api/admin/system-settings/certificates` — GET, PUT
- `/api/admin/system-settings/eja` — GET, PUT
- `/api/admin/system-settings/eja/upload` — POST
- `/api/admin/system-settings/group-logo/upload` — POST, DELETE
- `/api/admin/system-settings/referrals` — PUT
- `/api/admin/system-settings/tecnica` — GET, PUT
- `/api/admin/system-settings/tecnica/upload` — POST
- `/api/admin/system-settings/tracking` — GET, PUT
- `/api/admin/tenants/[id]/asaas-gateway` — PUT
- `/api/admin/tenants/[id]/automacao` — PUT
- `/api/admin/tenants/[id]/can-sell-resellers` — PUT
- `/api/admin/tenants/[id]/eja` — PUT
- `/api/admin/tenants/[id]/mensalidade` — PUT
- `/api/admin/tenants/[id]/referral-percent` — PUT
- `/api/admin/tenants/[id]/tecnica` — PUT
- `/api/admin/treinamentos/modules` — GET, POST
- `/api/admin/treinamentos/modules/[id]` — PATCH, DELETE
- `/api/admin/treinamentos/progress` — POST
- `/api/admin/treinamentos/reorder` — POST
- `/api/admin/treinamentos/videos` — POST
- `/api/admin/treinamentos/videos/[id]` — PATCH, DELETE
- `/api/admin/vendas` — GET, POST
- `/api/admin/vendas/[id]/sync-payment` — POST

### `aluno` (9)
- `/api/aluno/catalogo` — GET
- `/api/aluno/comprar` — POST
- `/api/aluno/conta` — DELETE
- `/api/aluno/curso/[enrollmentId]/acessar` — GET
- `/api/aluno/pagamentos/verificar` — POST
- `/api/aluno/perfil` — PATCH
- `/api/aluno/senha` — PATCH
- `/api/aluno/senha-plataforma` — PATCH
- `/api/aluno/suporte` — POST

### `auth` (6)
- `/api/auth/[...nextauth]` — (sem método exportado!)
- `/api/auth/alterar-senha-inicial` — POST
- `/api/auth/forgot-password` — POST
- `/api/auth/handoff` — GET
- `/api/auth/handoff/start` — GET
- `/api/auth/reset-password` — POST

### `catalogo` (1)
- `/api/catalogo/sugestoes` — GET

### `checkout` (5)
- `/api/checkout` — POST
- `/api/checkout/confirmacao/[id]/status` — GET
- `/api/checkout/mp/process` — POST
- `/api/checkout/package` — POST
- `/api/checkout/status` — GET

### `cobranca` (3)
- `/api/cobranca/[paymentId]` — GET
- `/api/cobranca/[paymentId]/billing-info` — GET
- `/api/cobranca/[paymentId]/pay-card` — POST

### `contato` (1)
- `/api/contato` — POST

### `cron` (16)
- `/api/cron/cleanup-webhook-logs` — GET, POST
- `/api/cron/reactivate-paid` — GET, POST
- `/api/cron/reconcile-tenant-payments` — GET, POST
- `/api/cron/referral-monthly-payout` — GET, POST
- `/api/cron/resync-lms-credentials` — GET, POST
- `/api/cron/resync-platform-passwords` — GET, POST
- `/api/cron/sweep-abandoned-leads` — GET, POST
- `/api/cron/sweep-students-expired` — GET, POST
- `/api/cron/sweep-students-overdue` — GET, POST
- `/api/cron/sweep-tenants-overdue` — GET, POST
- `/api/cron/sweep-visitor-events` — GET, POST
- `/api/cron/sync-cursos` — GET, POST
- `/api/cron/sync-cursos-lms` — GET, POST
- `/api/cron/sync-day-update-lms` — GET, POST
- `/api/cron/sync-lms-branding` — GET, POST
- `/api/cron/sync-progresso` — GET, POST

### `health` (1)
- `/api/health` — GET

### `home` (1)
- `/api/home/showcase` — GET

### `internal` (1)
- `/api/internal/resolve-tenant` — GET

### `leads` (1)
- `/api/leads` — POST

### `loja` (11)
- `/api/loja/checkout` — POST
- `/api/loja/checkout-inquiry` — POST
- `/api/loja/checkout/package` — POST
- `/api/loja/checkout/process` — POST
- `/api/loja/checkout/status` — GET
- `/api/loja/confirmacao/[id]` — GET
- `/api/loja/courses` — GET
- `/api/loja/cupom/validar` — POST
- `/api/loja/cursos/[slug]` — GET
- `/api/loja/leads` — POST
- `/api/loja/track` — POST

### `metrics` (1)
- `/api/metrics/public` — GET

### `notifications` (4)
- `/api/notifications` — GET
- `/api/notifications/[id]/read` — POST
- `/api/notifications/preferences` — GET, PATCH
- `/api/notifications/read-all` — POST

### `observability` (1)
- `/api/observability/client-log` — POST

### `painel` (86)
- `/api/painel/alunos` — GET
- `/api/painel/alunos/[id]` — GET, PATCH
- `/api/painel/alunos/[id]/bloquear` — POST
- `/api/painel/alunos/[id]/desbloquear` — POST
- `/api/painel/alunos/[id]/impersonate` — POST
- `/api/painel/alunos/[id]/mensagem` — POST
- `/api/painel/alunos/[id]/notes` — GET, POST, DELETE
- `/api/painel/alunos/[id]/notify` — POST
- `/api/painel/alunos/[id]/plataforma-senha` — POST
- `/api/painel/alunos/[id]/reenviar-email` — POST
- `/api/painel/alunos/[id]/reset-password` — POST
- `/api/painel/atendimento/[id]` — PATCH
- `/api/painel/automacao/config` — GET, PUT
- `/api/painel/automacao/templates` — GET, PUT
- `/api/painel/automacao/whatsapp/connect` — POST
- `/api/painel/automacao/whatsapp/disconnect` — POST
- `/api/painel/automacao/whatsapp/pair` — POST
- `/api/painel/automacao/whatsapp/status` — GET
- `/api/painel/banner` — GET, POST
- `/api/painel/banner/[id]` — PATCH, DELETE
- `/api/painel/banner/upload` — POST
- `/api/painel/certificate-template` — GET, PUT
- `/api/painel/certificate-template/preview` — GET
- `/api/painel/certificate-template/upload` — GET, POST, DELETE
- `/api/painel/certificates` — GET
- `/api/painel/certificates/[id]/download` — GET
- `/api/painel/certificates/[id]/regenerate` — POST
- `/api/painel/certificates/[id]/revoke` — POST
- `/api/painel/certificates/enrollments` — GET
- `/api/painel/certificates/issue` — POST
- `/api/painel/comunicacao/alunos` — GET
- `/api/painel/comunicacao/auto-config` — GET, PATCH
- `/api/painel/comunicacao/broadcast` — POST
- `/api/painel/config` — GET, PUT
- `/api/painel/config/billing-mode` — PATCH
- `/api/painel/config/connect-asaas` — POST, DELETE
- `/api/painel/config/connect-mp` — POST, DELETE
- `/api/painel/config/excluir-conta` — POST
- `/api/painel/config/mensalidade` — PATCH
- `/api/painel/config/password` — PUT
- `/api/painel/config/pix` — GET, PATCH
- `/api/painel/config/sales-gateway` — PATCH
- `/api/painel/cupons` — GET, POST
- `/api/painel/cupons/[id]/toggle` — PATCH
- `/api/painel/cupons/[id]/usage` — GET
- `/api/painel/cupons/generate-code` — POST
- `/api/painel/cursos` — GET
- `/api/painel/cursos/[id]` — GET, PUT, DELETE
- `/api/painel/cursos/[id]/capa` — POST, DELETE
- `/api/painel/cursos/[id]/visibility` — PATCH
- `/api/painel/cursos/bulk` — GET, PUT
- `/api/painel/dashboard` — GET
- `/api/painel/dominio` — GET, POST, DELETE
- `/api/painel/dominio/verify` — POST
- `/api/painel/equipe` — GET, POST
- `/api/painel/equipe/[id]` — PATCH, DELETE
- `/api/painel/equipe/[id]/resend-invite` — POST
- `/api/painel/financeiro` — GET
- `/api/painel/financeiro/export-csv` — GET
- `/api/painel/home-sections` — GET, POST
- `/api/painel/home-sections/[id]` — PATCH, DELETE
- `/api/painel/home-sections/options` — GET
- `/api/painel/home-sections/reorder` — PATCH
- `/api/painel/indicacoes/demonstrativo` — GET
- `/api/painel/indicacoes/proof/[payoutId]` — GET
- `/api/painel/leads` — GET
- `/api/painel/leads/[id]` — GET, PATCH, DELETE
- `/api/painel/leads/[id]/activities` — POST
- `/api/painel/leads/[id]/stage` — PATCH
- `/api/painel/leads/[id]/whatsapp` — POST
- `/api/painel/leads/distribuicao` — GET, PUT
- `/api/painel/onboarding` — POST
- `/api/painel/onboarding-tour` — POST
- `/api/painel/pacotes` — GET, POST
- `/api/painel/pacotes/[id]` — GET, PUT, DELETE
- `/api/painel/pacotes/capa` — POST
- `/api/painel/pacotes/courses-lookup` — GET
- `/api/painel/pacotes/pmb/[packageId]` — PATCH
- `/api/painel/referrals/request-payout` — POST
- `/api/painel/revendas` — POST
- `/api/painel/revendas/leads/[id]` — PATCH
- `/api/painel/tracking` — GET, PUT
- `/api/painel/treinamentos/progress` — POST
- `/api/painel/vendas` — GET, POST
- `/api/painel/vitrine` — GET, PUT
- `/api/painel/vitrine/upload` — POST, DELETE

### `placar` (1)
- `/api/placar/stream` — GET

### `pmb` (1)
- `/api/pmb/leads` — POST

### `public` (2)
- `/api/public/capture-ref` — POST
- `/api/public/validate-ref` — GET

### `push` (4)
- `/api/push/devices` — GET
- `/api/push/devices/[id]` — DELETE
- `/api/push/public-key` — GET
- `/api/push/subscribe` — POST, DELETE

### `revendedores` (1)
- `/api/revendedores/cadastro` — POST

### `student` (2)
- `/api/student/certificates/[id]/download` — GET
- `/api/student/certificates/issue` — POST

### `vitrine` (1)
- `/api/vitrine/manifest` — GET

### `webhooks` (3)
- `/api/webhooks/asaas` — POST
- `/api/webhooks/lms` — POST
- `/api/webhooks/mercadopago` — POST

## Server Actions (`"use server"`)

- `src/app/validar/page.tsx`
- `src/app/inadimplente/page.tsx`
- `src/lib/coupons/types.ts`
- `src/lib/coupons/preview.ts`

## Crons (`api/cron/*`)

- `cleanup-webhook-logs`
- `reactivate-paid`
- `reconcile-tenant-payments`
- `referral-monthly-payout`
- `resync-lms-credentials`
- `resync-platform-passwords`
- `sweep-abandoned-leads`
- `sweep-students-expired`
- `sweep-students-overdue`
- `sweep-tenants-overdue`
- `sweep-visitor-events`
- `sync-cursos`
- `sync-cursos-lms`
- `sync-day-update-lms`
- `sync-lms-branding`
- `sync-progresso`

## Webhooks

- `webhooks/asaas`
- `webhooks/lms`
- `webhooks/mercadopago`

## Componentes — por pasta

| Pasta | Qtd |
|---|---|
| `components/admin` | 98 |
| `components/painel` | 69 |
| `components/main` | 51 |
| `components/shared` | 36 |
| `components/loja` | 24 |
| `components/ui` | 20 |
| `components/aluno` | 10 |
| `components/auth` | 5 |
| `components/vitrine` | 5 |
| `components/livrecursos` | 2 |
| `components/pwa` | 2 |
| `components/placar` | 1 |
| `components/seo` | 1 |

## Módulos lib — por pasta

| Pasta | Qtd |
|---|---|
| `lib/(root)` | 22 |
| `lib/auth` | 16 |
| `lib/certificates` | 13 |
| `lib/students` | 13 |
| `lib/tenant` | 11 |
| `lib/asaas` | 10 |
| `lib/catalog` | 10 |
| `lib/referrals` | 10 |
| `lib/mercadopago` | 9 |
| `lib/automation` | 8 |
| `lib/lms` | 7 |
| `lib/email` | 5 |
| `lib/coupons` | 4 |
| `lib/home` | 4 |
| `lib/redis` | 4 |
| `lib/seo` | 4 |
| `lib/tracking` | 4 |
| `lib/notifications` | 3 |
| `lib/observability` | 3 |
| `lib/packages` | 3 |
| `lib/plataforma-cursos` | 3 |
| `lib/storage` | 3 |
| `lib/webhooks` | 3 |
| `lib/checkout` | 2 |
| `lib/reports` | 2 |
| `lib/resellers` | 2 |
| `lib/validation` | 2 |
| `lib/admin` | 1 |
| `lib/api` | 1 |
| `lib/courses` | 1 |
| `lib/enrollment` | 1 |
| `lib/http` | 1 |
| `lib/lgpd` | 1 |
| `lib/placar` | 1 |
| `lib/revendedor` | 1 |
| `lib/schemas` | 1 |
| `lib/supabase` | 1 |
| `lib/support` | 1 |
| `lib/training` | 1 |
| `lib/vercel` | 1 |

## Testes existentes

- `src/lib/asaas/webhook.test.ts`
- `src/lib/auth/guards.test.ts`
- `src/lib/auth/roles.test.ts`
- `src/lib/auth/scope.test.ts`
- `src/lib/certificates/admin-scope.test.ts`
- `src/lib/certificates/freshness.test.ts`
- `src/lib/checkout/due-date.test.ts`
- `src/lib/checkout/price-guard.test.ts`
- `src/lib/coupons/discount.test.ts`
- `src/lib/coupons/preview.test.ts`
- `src/lib/courses/bulk-edit.test.ts`
- `src/lib/crypto.test.ts`
- `src/lib/dates.test.ts`
- `src/lib/email/templates/enrollment.test.ts`
- `src/lib/email/templates/notification.test.ts`
- `src/lib/email/templates/payment-pending.test.ts`
- `src/lib/email/templates/payment-rejected.test.ts`
- `src/lib/home/sections.schema.test.ts`
- `src/lib/mercadopago/webhook.test.ts`
- `src/lib/pmb-tenant.test.ts`
- `src/lib/redis/keys.test.ts`
- `src/lib/referrals/clawback.test.ts`
- `src/lib/referrals/commission.test.ts`
- `src/lib/referrals/payout.test.ts`
- `src/lib/referrals/tiers.test.ts`
- `src/lib/resellers/plans.test.ts`
- `src/lib/students/checkout-link.test.ts`
- `src/lib/students/cpf-already-registered.test.ts`
- `src/lib/students/ensure-student-active.test.ts`
- `src/lib/students/reactivation-guard.test.ts`
- `src/lib/students/resolve-platform-password.test.ts`
- `src/lib/tenant/forbidden-names.test.ts`
- `src/lib/tenant/slug.test.ts`
- `src/lib/tenant/urls.test.ts`
- `src/lib/tenant/vitrine-paths.test.ts`
- `src/lib/validation/cpf.test.ts`
- `src/lib/webhooks/lms-webhook.test.ts`

## Prisma — models

- `User`
- `TenantMember`
- `Tenant`
- `TenantSlugRedirect`
- `TenantSupportNote`
- `StudentNote`
- `Course`
- `Category`
- `CourseCategory`
- `CourseLesson`
- `TenantCourse`
- `CoursePackage`
- `CoursePackageItem`
- `TenantPackage`
- `Student`
- `Enrollment`
- `Payment`
- `Coupon`
- `TenantPayment`
- `WebhookLog`
- `Lead`
- `ContactMessage`
- `Notification`
- `PushSubscription`
- `NotificationPreference`
- `EmailLog`
- `NotificationCategoryConfig`
- `TenantNotificationOverride`
- `SystemSettings`
- `ReferralCommission`
- `ReferralPayout`
- `ReferralMonthlyCommission`
- `CertificateTemplate`
- `Certificate`
- `BannerSlide`
- `HomeSection`
- `StudentLead`
- `StudentLeadActivity`
- `VisitorEvent`
- `AutomationMessageTemplate`
- `AuditLog`
- `TrainingModule`
- `TrainingVideo`
- `TrainingProgress`

## Notas de cobertura

- Toda tela acima precisa de veredito de estado (loading/erro/vazio/sucesso) no domínio **frontend**.
- Todo route handler precisa de veredito de auth/authz/tenant (**seguranca**) + validação Zod (**api**).
- Todo cron/webhook precisa de veredito de idempotência/assinatura (**api**/**saas**).
- Middleware é `src/proxy.ts` (não `middleware.ts`) — convenção nova do Next 16.
