# Inventário — Profissionaliza Mais Brasil
_Data: 2026-07-03 · Somente leitura · Base de cobertura total (sem amostragem)._

> Gerado por varredura determinística do filesystem em `main`. Cada item deve receber veredito (OK / Achado / N/A) nas fases seguintes.

## Contagens

| Categoria | Total |
|---|---|
| Telas (`page.tsx` → URLs únicas) | 137 |
| `layout.tsx` | 9 |
| `loading.tsx` | 5 |
| `error.tsx` | 5 |
| `not-found.tsx` | 6 |
| `global-error.tsx` | 1 |
| `template.tsx` / `default.tsx` | 0 / 0 |
| Route handlers (`route.ts`) | 309 |
| — métodos HTTP exportados | 406 (GET 144 · POST 156 · PUT 31 · PATCH 45 · DELETE 30) |
| Server Actions (`"use server"`) | 3 arquivos · 3 funções (1 exportada + 2 inline) |
| Componentes (`components/**/*.tsx`) | 342 |
| Módulos `lib/` (`.ts(x)` não-teste) | 251 · 720 exports |
| Hooks (`use*` exportados) | 3 |
| Crons (`api/cron/*`) | 17 |
| Webhooks (`api/webhooks/*`) | 3 |
| Models Prisma | 44 |
| Enums Prisma | 33 |
| Migrations | 81 |
| Testes (arquivos · casos) | 53 · 328 |
| Segmentos dinâmicos distintos | 12 ([id], [tab], [type], [moduleId], [slug], [paymentId], [code], [enrollmentId], [...nextauth], [payoutId], [packageId], [report]) |
| Middleware/Proxy | src/proxy.ts |

## Rotas (todas — page/layout/route/loading/error/not-found/global-error)

| URL | Arquivo | Tipo | Renderização |
|---|---|---|---|
| `/` | `src/app/error.tsx` | error | Client |
| `/` | `src/app/global-error.tsx` | global-error | Client |
| `/` | `src/app/(auth)/layout.tsx` | layout | Server (padrão) |
| `/` | `src/app/(landing)/layout.tsx` | layout | Server (padrão) |
| `/` | `src/app/(main)/layout.tsx` | layout | Server (padrão) |
| `/` | `src/app/layout.tsx` | layout | Server (padrão) |
| `/` | `src/app/(main)/loading.tsx` | loading | Server (padrão) |
| `/` | `src/app/(main)/not-found.tsx` | not-found | Server (padrão) |
| `/` | `src/app/not-found.tsx` | not-found | Server (padrão) |
| `/` | `src/app/(main)/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin` | `src/app/admin/error.tsx` | error | Client |
| `/admin` | `src/app/admin/layout.tsx` | layout | Server (padrão) |
| `/admin` | `src/app/admin/loading.tsx` | loading | Server (padrão) |
| `/admin` | `src/app/admin/not-found.tsx` | not-found | Server (padrão) |
| `/admin` | `src/app/admin/page.tsx` | page | Server (padrão) |
| `/admin/alunos` | `src/app/admin/alunos/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/alunos/[id]` | `src/app/admin/alunos/[id]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | page | Server (padrão) |
| `/admin/atendimento` | `src/app/admin/atendimento/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/automacao` | `src/app/admin/automacao/page.tsx` | page | Server (padrão) |
| `/admin/automacao/conexao` | `src/app/admin/automacao/conexao/page.tsx` | page | Server (padrão) |
| `/admin/automacao/mensagens` | `src/app/admin/automacao/mensagens/page.tsx` | page | Server (padrão) |
| `/admin/banner` | `src/app/admin/banner/page.tsx` | page | Server (padrão) |
| `/admin/catalogo` | `src/app/admin/catalogo/page.tsx` | page | Server (padrão) |
| `/admin/certificados` | `src/app/admin/certificados/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/certificados/configuracoes` | `src/app/admin/certificados/configuracoes/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/certificados/emitir` | `src/app/admin/certificados/emitir/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/certificados/template-padrao` | `src/app/admin/certificados/template-padrao/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/comunicacao` | `src/app/admin/comunicacao/page.tsx` | page | Server (padrão) |
| `/admin/configuracoes` | `src/app/admin/configuracoes/page.tsx` | page | Server (padrão) |
| `/admin/configuracoes/automacao` | `src/app/admin/configuracoes/automacao/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/configuracoes/certificados` | `src/app/admin/configuracoes/certificados/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/configuracoes/indicacoes` | `src/app/admin/configuracoes/indicacoes/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/configuracoes/rastreamento` | `src/app/admin/configuracoes/rastreamento/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/configuracoes/unidade-tecnica` | `src/app/admin/configuracoes/unidade-tecnica/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/equipe` | `src/app/admin/equipe/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/equipe/[id]` | `src/app/admin/equipe/[id]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/financeiro` | `src/app/admin/financeiro/page.tsx` | page | Server (padrão) |
| `/admin/indicacoes` | `src/app/admin/indicacoes/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/indicacoes/comissoes` | `src/app/admin/indicacoes/comissoes/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/indicacoes/saques` | `src/app/admin/indicacoes/saques/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/leads` | `src/app/admin/leads/page.tsx` | page | Server (padrão) |
| `/admin/leads-revenda` | `src/app/admin/leads-revenda/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/meu-perfil` | `src/app/admin/meu-perfil/page.tsx` | page | Server (padrão) |
| `/admin/notificacoes` | `src/app/admin/notificacoes/page.tsx` | page | Server (padrão) |
| `/admin/relatorios` | `src/app/admin/relatorios/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/relatorios/[tab]` | `src/app/admin/relatorios/[tab]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/relatorios/exportar/[type]` | `src/app/admin/relatorios/exportar/[type]/page.tsx` | page | Dinâmica (segmento) |
| `/admin/revendedores` | `src/app/admin/revendedores/page.tsx` | page | Server (padrão) |
| `/admin/revendedores/[id]` | `src/app/admin/revendedores/[id]/page.tsx` | page | Dinâmica (segmento) |
| `/admin/revendedores/[id]/comissoes` | `src/app/admin/revendedores/[id]/comissoes/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/treinamentos` | `src/app/admin/treinamentos/page.tsx` | page | Server (padrão) |
| `/admin/treinamentos/assistir` | `src/app/admin/treinamentos/assistir/page.tsx` | page | Server (padrão) |
| `/admin/treinamentos/assistir/[moduleId]` | `src/app/admin/treinamentos/assistir/[moduleId]/page.tsx` | page | Dinâmica (segmento) |
| `/admin/vendas` | `src/app/admin/vendas/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/vendas/alunos` | `src/app/admin/vendas/alunos/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/vendas/alunos/[id]` | `src/app/admin/vendas/alunos/[id]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/vendas/cupons` | `src/app/admin/vendas/cupons/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/vendas/nova` | `src/app/admin/vendas/nova/page.tsx` | page | Dinâmica (force-dynamic) |
| `/admin/vitrine` | `src/app/admin/vitrine/page.tsx` | page | Server (padrão) |
| `/ajuda` | `src/app/(main)/ajuda/page.tsx` | page | Server (padrão) |
| `/alterar-senha-inicial` | `src/app/alterar-senha-inicial/page.tsx` | page | Client |
| `/aluno` | `src/app/aluno/error.tsx` | error | Client |
| `/aluno` | `src/app/aluno/layout.tsx` | layout | Server (padrão) |
| `/aluno` | `src/app/aluno/loading.tsx` | loading | Server (padrão) |
| `/aluno` | `src/app/aluno/not-found.tsx` | not-found | Server (padrão) |
| `/aluno` | `src/app/aluno/page.tsx` | page | Server (padrão) |
| `/aluno/certificados` | `src/app/aluno/certificados/page.tsx` | page | Server (padrão) |
| `/aluno/certificados/[id]` | `src/app/aluno/certificados/[id]/page.tsx` | page | Dinâmica (segmento) |
| `/aluno/comprar` | `src/app/aluno/comprar/page.tsx` | page | Server (padrão) |
| `/aluno/comprar/pagar/[id]` | `src/app/aluno/comprar/pagar/[id]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/aluno/cursos` | `src/app/aluno/cursos/page.tsx` | page | Server (padrão) |
| `/aluno/notificacoes` | `src/app/aluno/notificacoes/page.tsx` | page | Server (padrão) |
| `/aluno/pagamentos` | `src/app/aluno/pagamentos/page.tsx` | page | Server (padrão) |
| `/aluno/perfil` | `src/app/aluno/perfil/page.tsx` | page | Server (padrão) |
| `/aluno/suporte` | `src/app/aluno/suporte/page.tsx` | page | Dinâmica (force-dynamic) |
| `/api/admin/alunos` | `src/app/api/admin/alunos/route.ts` | route | Server (padrão) |
| `/api/admin/alunos/[id]` | `src/app/api/admin/alunos/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/bloquear` | `src/app/api/admin/alunos/[id]/bloquear/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/cursos` | `src/app/api/admin/alunos/[id]/cursos/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/desbloquear` | `src/app/api/admin/alunos/[id]/desbloquear/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/enrollments/[enrollmentId]/cancelar` | `src/app/api/admin/alunos/[id]/enrollments/[enrollmentId]/cancelar/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/impersonate` | `src/app/api/admin/alunos/[id]/impersonate/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/notes` | `src/app/api/admin/alunos/[id]/notes/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/notify` | `src/app/api/admin/alunos/[id]/notify/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/plataforma-senha` | `src/app/api/admin/alunos/[id]/plataforma-senha/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/reenviar-email` | `src/app/api/admin/alunos/[id]/reenviar-email/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/[id]/reset-password` | `src/app/api/admin/alunos/[id]/reset-password/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/alunos/global` | `src/app/api/admin/alunos/global/route.ts` | route | Server (padrão) |
| `/api/admin/analytics` | `src/app/api/admin/analytics/route.ts` | route | Server (padrão) |
| `/api/admin/atendimento/[id]` | `src/app/api/admin/atendimento/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/automacao/config` | `src/app/api/admin/automacao/config/route.ts` | route | Server (padrão) |
| `/api/admin/automacao/templates` | `src/app/api/admin/automacao/templates/route.ts` | route | Server (padrão) |
| `/api/admin/automacao/whatsapp/connect` | `src/app/api/admin/automacao/whatsapp/connect/route.ts` | route | Server (padrão) |
| `/api/admin/automacao/whatsapp/disconnect` | `src/app/api/admin/automacao/whatsapp/disconnect/route.ts` | route | Server (padrão) |
| `/api/admin/automacao/whatsapp/pair` | `src/app/api/admin/automacao/whatsapp/pair/route.ts` | route | Server (padrão) |
| `/api/admin/automacao/whatsapp/status` | `src/app/api/admin/automacao/whatsapp/status/route.ts` | route | Server (padrão) |
| `/api/admin/banner` | `src/app/api/admin/banner/route.ts` | route | Server (padrão) |
| `/api/admin/banner/[id]` | `src/app/api/admin/banner/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/banner/upload` | `src/app/api/admin/banner/upload/route.ts` | route | Server (padrão) |
| `/api/admin/catalogo` | `src/app/api/admin/catalogo/route.ts` | route | Server (padrão) |
| `/api/admin/catalogo/[id]` | `src/app/api/admin/catalogo/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/catalogo/bulk` | `src/app/api/admin/catalogo/bulk/route.ts` | route | Server (padrão) |
| `/api/admin/catalogo/bulk-provider-visibility` | `src/app/api/admin/catalogo/bulk-provider-visibility/route.ts` | route | Server (padrão) |
| `/api/admin/catalogo/categorias` | `src/app/api/admin/catalogo/categorias/route.ts` | route | Server (padrão) |
| `/api/admin/catalogo/categorias/[id]` | `src/app/api/admin/catalogo/categorias/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/catalogo/sync` | `src/app/api/admin/catalogo/sync/route.ts` | route | Server (padrão) |
| `/api/admin/catalogo/sync-log` | `src/app/api/admin/catalogo/sync-log/route.ts` | route | Server (padrão) |
| `/api/admin/catalogo/tenants-lookup` | `src/app/api/admin/catalogo/tenants-lookup/route.ts` | route | Server (padrão) |
| `/api/admin/certificate-template` | `src/app/api/admin/certificate-template/route.ts` | route | Server (padrão) |
| `/api/admin/certificate-template/preview` | `src/app/api/admin/certificate-template/preview/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/certificate-template/upload` | `src/app/api/admin/certificate-template/upload/route.ts` | route | Server (padrão) |
| `/api/admin/certificates` | `src/app/api/admin/certificates/route.ts` | route | Server (padrão) |
| `/api/admin/certificates/[id]/download` | `src/app/api/admin/certificates/[id]/download/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/certificates/[id]/regenerate` | `src/app/api/admin/certificates/[id]/regenerate/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/certificates/[id]/revoke` | `src/app/api/admin/certificates/[id]/revoke/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/certificates/enrollments` | `src/app/api/admin/certificates/enrollments/route.ts` | route | Server (padrão) |
| `/api/admin/certificates/issue` | `src/app/api/admin/certificates/issue/route.ts` | route | Server (padrão) |
| `/api/admin/certificates/regenerate-all` | `src/app/api/admin/certificates/regenerate-all/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/config` | `src/app/api/admin/config/route.ts` | route | Server (padrão) |
| `/api/admin/config/test-asaas` | `src/app/api/admin/config/test-asaas/route.ts` | route | Server (padrão) |
| `/api/admin/config/test-mp` | `src/app/api/admin/config/test-mp/route.ts` | route | Server (padrão) |
| `/api/admin/config/test-plataforma` | `src/app/api/admin/config/test-plataforma/route.ts` | route | Server (padrão) |
| `/api/admin/cupons` | `src/app/api/admin/cupons/route.ts` | route | Server (padrão) |
| `/api/admin/cupons/[id]/toggle` | `src/app/api/admin/cupons/[id]/toggle/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/cupons/validate` | `src/app/api/admin/cupons/validate/route.ts` | route | Server (padrão) |
| `/api/admin/dashboard` | `src/app/api/admin/dashboard/route.ts` | route | Server (padrão) |
| `/api/admin/end-impersonation` | `src/app/api/admin/end-impersonation/route.ts` | route | Server (padrão) |
| `/api/admin/equipe` | `src/app/api/admin/equipe/route.ts` | route | Server (padrão) |
| `/api/admin/equipe/[id]` | `src/app/api/admin/equipe/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/equipe/[id]/impersonate` | `src/app/api/admin/equipe/[id]/impersonate/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/equipe/[id]/resend-invite` | `src/app/api/admin/equipe/[id]/resend-invite/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/financeiro` | `src/app/api/admin/financeiro/route.ts` | route | Server (padrão) |
| `/api/admin/financeiro/overdue` | `src/app/api/admin/financeiro/overdue/route.ts` | route | Server (padrão) |
| `/api/admin/financeiro/referral-payouts` | `src/app/api/admin/financeiro/referral-payouts/route.ts` | route | Server (padrão) |
| `/api/admin/financeiro/referral-payouts/[id]/fail` | `src/app/api/admin/financeiro/referral-payouts/[id]/fail/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/financeiro/referral-payouts/[id]/mark-paid` | `src/app/api/admin/financeiro/referral-payouts/[id]/mark-paid/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/financeiro/referral-payouts/[id]/note` | `src/app/api/admin/financeiro/referral-payouts/[id]/note/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/financeiro/referral-payouts/[id]/proof` | `src/app/api/admin/financeiro/referral-payouts/[id]/proof/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/financeiro/referral-payouts/[id]/proof/download` | `src/app/api/admin/financeiro/referral-payouts/[id]/proof/download/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/financeiro/tenant-payments` | `src/app/api/admin/financeiro/tenant-payments/route.ts` | route | Server (padrão) |
| `/api/admin/financeiro/tenant-payments/[id]/mark-paid` | `src/app/api/admin/financeiro/tenant-payments/[id]/mark-paid/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/financeiro/tenant-payments/[id]/note` | `src/app/api/admin/financeiro/tenant-payments/[id]/note/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/home-sections` | `src/app/api/admin/home-sections/route.ts` | route | Server (padrão) |
| `/api/admin/home-sections/[id]` | `src/app/api/admin/home-sections/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/home-sections/options` | `src/app/api/admin/home-sections/options/route.ts` | route | Server (padrão) |
| `/api/admin/home-sections/reorder` | `src/app/api/admin/home-sections/reorder/route.ts` | route | Server (padrão) |
| `/api/admin/leads` | `src/app/api/admin/leads/route.ts` | route | Server (padrão) |
| `/api/admin/leads-revenda/[id]` | `src/app/api/admin/leads-revenda/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/leads-revenda/distribuicao` | `src/app/api/admin/leads-revenda/distribuicao/route.ts` | route | Server (padrão) |
| `/api/admin/leads/[id]` | `src/app/api/admin/leads/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/leads/[id]/activities` | `src/app/api/admin/leads/[id]/activities/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/leads/[id]/stage` | `src/app/api/admin/leads/[id]/stage/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/leads/[id]/whatsapp` | `src/app/api/admin/leads/[id]/whatsapp/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/me` | `src/app/api/admin/me/route.ts` | route | Server (padrão) |
| `/api/admin/me/password` | `src/app/api/admin/me/password/route.ts` | route | Server (padrão) |
| `/api/admin/notifications/auto-config` | `src/app/api/admin/notifications/auto-config/route.ts` | route | Server (padrão) |
| `/api/admin/notifications/broadcast` | `src/app/api/admin/notifications/broadcast/route.ts` | route | Server (padrão) |
| `/api/admin/pacotes` | `src/app/api/admin/pacotes/route.ts` | route | Server (padrão) |
| `/api/admin/pacotes/[id]` | `src/app/api/admin/pacotes/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/pacotes/capa` | `src/app/api/admin/pacotes/capa/route.ts` | route | Server (padrão) |
| `/api/admin/pacotes/courses-lookup` | `src/app/api/admin/pacotes/courses-lookup/route.ts` | route | Server (padrão) |
| `/api/admin/referrals/clawback/resolve` | `src/app/api/admin/referrals/clawback/resolve/route.ts` | route | Server (padrão) |
| `/api/admin/referrals/commissions/export` | `src/app/api/admin/referrals/commissions/export/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/referrals/payouts/[id]/approve` | `src/app/api/admin/referrals/payouts/[id]/approve/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/referrals/payouts/[id]/fail` | `src/app/api/admin/referrals/payouts/[id]/fail/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/referrals/payouts/export` | `src/app/api/admin/referrals/payouts/export/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/relatorios` | `src/app/api/admin/relatorios/route.ts` | route | Server (padrão) |
| `/api/admin/relatorios/[type]` | `src/app/api/admin/relatorios/[type]/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/relatorios/bi/[tab]` | `src/app/api/admin/relatorios/bi/[tab]/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/revendedores` | `src/app/api/admin/revendedores/route.ts` | route | Server (padrão) |
| `/api/admin/revendedores/[id]` | `src/app/api/admin/revendedores/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/anonimizar` | `src/app/api/admin/revendedores/[id]/anonimizar/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/billing` | `src/app/api/admin/revendedores/[id]/billing/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/comissoes/demonstrativo` | `src/app/api/admin/revendedores/[id]/comissoes/demonstrativo/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/comissoes/export` | `src/app/api/admin/revendedores/[id]/comissoes/export/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/admin/revendedores/[id]/impersonate` | `src/app/api/admin/revendedores/[id]/impersonate/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/manager` | `src/app/api/admin/revendedores/[id]/manager/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/notes` | `src/app/api/admin/revendedores/[id]/notes/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/password` | `src/app/api/admin/revendedores/[id]/password/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/payments/[paymentId]` | `src/app/api/admin/revendedores/[id]/payments/[paymentId]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/policy` | `src/app/api/admin/revendedores/[id]/policy/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/sales` | `src/app/api/admin/revendedores/[id]/sales/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/slug` | `src/app/api/admin/revendedores/[id]/slug/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/revendedores/[id]/status` | `src/app/api/admin/revendedores/[id]/status/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/system-settings/certificates` | `src/app/api/admin/system-settings/certificates/route.ts` | route | Server (padrão) |
| `/api/admin/system-settings/eja` | `src/app/api/admin/system-settings/eja/route.ts` | route | Server (padrão) |
| `/api/admin/system-settings/eja/upload` | `src/app/api/admin/system-settings/eja/upload/route.ts` | route | Server (padrão) |
| `/api/admin/system-settings/group-logo/upload` | `src/app/api/admin/system-settings/group-logo/upload/route.ts` | route | Server (padrão) |
| `/api/admin/system-settings/referrals` | `src/app/api/admin/system-settings/referrals/route.ts` | route | Server (padrão) |
| `/api/admin/system-settings/tecnica` | `src/app/api/admin/system-settings/tecnica/route.ts` | route | Server (padrão) |
| `/api/admin/system-settings/tecnica/upload` | `src/app/api/admin/system-settings/tecnica/upload/route.ts` | route | Server (padrão) |
| `/api/admin/system-settings/tracking` | `src/app/api/admin/system-settings/tracking/route.ts` | route | Server (padrão) |
| `/api/admin/tenants/[id]/asaas-gateway` | `src/app/api/admin/tenants/[id]/asaas-gateway/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/tenants/[id]/automacao` | `src/app/api/admin/tenants/[id]/automacao/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/tenants/[id]/can-sell-resellers` | `src/app/api/admin/tenants/[id]/can-sell-resellers/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/tenants/[id]/eja` | `src/app/api/admin/tenants/[id]/eja/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/tenants/[id]/mensalidade` | `src/app/api/admin/tenants/[id]/mensalidade/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/tenants/[id]/referral-percent` | `src/app/api/admin/tenants/[id]/referral-percent/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/tenants/[id]/tecnica` | `src/app/api/admin/tenants/[id]/tecnica/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/treinamentos/modules` | `src/app/api/admin/treinamentos/modules/route.ts` | route | Server (padrão) |
| `/api/admin/treinamentos/modules/[id]` | `src/app/api/admin/treinamentos/modules/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/treinamentos/progress` | `src/app/api/admin/treinamentos/progress/route.ts` | route | Server (padrão) |
| `/api/admin/treinamentos/reorder` | `src/app/api/admin/treinamentos/reorder/route.ts` | route | Server (padrão) |
| `/api/admin/treinamentos/videos` | `src/app/api/admin/treinamentos/videos/route.ts` | route | Server (padrão) |
| `/api/admin/treinamentos/videos/[id]` | `src/app/api/admin/treinamentos/videos/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/admin/vendas` | `src/app/api/admin/vendas/route.ts` | route | Server (padrão) |
| `/api/admin/vendas/[id]/sync-payment` | `src/app/api/admin/vendas/[id]/sync-payment/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/aluno/catalogo` | `src/app/api/aluno/catalogo/route.ts` | route | Server (padrão) |
| `/api/aluno/comprar` | `src/app/api/aluno/comprar/route.ts` | route | Server (padrão) |
| `/api/aluno/comprar/installments` | `src/app/api/aluno/comprar/installments/route.ts` | route | Server (padrão) |
| `/api/aluno/comprar/process` | `src/app/api/aluno/comprar/process/route.ts` | route | Server (padrão) |
| `/api/aluno/comprar/status` | `src/app/api/aluno/comprar/status/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/aluno/conta` | `src/app/api/aluno/conta/route.ts` | route | Server (padrão) |
| `/api/aluno/curso/[enrollmentId]/acessar` | `src/app/api/aluno/curso/[enrollmentId]/acessar/route.ts` | route | Dinâmica (segmento) |
| `/api/aluno/pagamentos/verificar` | `src/app/api/aluno/pagamentos/verificar/route.ts` | route | Server (padrão) |
| `/api/aluno/perfil` | `src/app/api/aluno/perfil/route.ts` | route | Server (padrão) |
| `/api/aluno/senha` | `src/app/api/aluno/senha/route.ts` | route | Server (padrão) |
| `/api/aluno/senha-plataforma` | `src/app/api/aluno/senha-plataforma/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/aluno/suporte` | `src/app/api/aluno/suporte/route.ts` | route | Server (padrão) |
| `/api/auth/[...nextauth]` | `src/app/api/auth/[...nextauth]/route.ts` | route | Dinâmica (segmento) |
| `/api/auth/alterar-senha-inicial` | `src/app/api/auth/alterar-senha-inicial/route.ts` | route | Server (padrão) |
| `/api/auth/forgot-password` | `src/app/api/auth/forgot-password/route.ts` | route | Server (padrão) |
| `/api/auth/handoff` | `src/app/api/auth/handoff/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/auth/handoff/start` | `src/app/api/auth/handoff/start/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/auth/reset-password` | `src/app/api/auth/reset-password/route.ts` | route | Server (padrão) |
| `/api/catalogo/sugestoes` | `src/app/api/catalogo/sugestoes/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/checkout` | `src/app/api/checkout/route.ts` | route | Server (padrão) |
| `/api/checkout/confirmacao/[id]/status` | `src/app/api/checkout/confirmacao/[id]/status/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/checkout/enrollment/[id]` | `src/app/api/checkout/enrollment/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/checkout/installments` | `src/app/api/checkout/installments/route.ts` | route | Server (padrão) |
| `/api/checkout/mp/process` | `src/app/api/checkout/mp/process/route.ts` | route | Server (padrão) |
| `/api/checkout/package` | `src/app/api/checkout/package/route.ts` | route | Server (padrão) |
| `/api/checkout/status` | `src/app/api/checkout/status/route.ts` | route | Server (padrão) |
| `/api/cobranca/[paymentId]` | `src/app/api/cobranca/[paymentId]/route.ts` | route | Dinâmica (segmento) |
| `/api/cobranca/[paymentId]/billing-info` | `src/app/api/cobranca/[paymentId]/billing-info/route.ts` | route | Dinâmica (segmento) |
| `/api/cobranca/[paymentId]/pay-card` | `src/app/api/cobranca/[paymentId]/pay-card/route.ts` | route | Dinâmica (segmento) |
| `/api/contato` | `src/app/api/contato/route.ts` | route | Server (padrão) |
| `/api/cron/cleanup-webhook-logs` | `src/app/api/cron/cleanup-webhook-logs/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/fix-gateway-collapse` | `src/app/api/cron/fix-gateway-collapse/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/reactivate-paid` | `src/app/api/cron/reactivate-paid/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/reconcile-tenant-payments` | `src/app/api/cron/reconcile-tenant-payments/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/referral-monthly-payout` | `src/app/api/cron/referral-monthly-payout/route.ts` | route | Server (padrão) |
| `/api/cron/resync-lms-credentials` | `src/app/api/cron/resync-lms-credentials/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/resync-platform-passwords` | `src/app/api/cron/resync-platform-passwords/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/sweep-abandoned-leads` | `src/app/api/cron/sweep-abandoned-leads/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/sweep-students-expired` | `src/app/api/cron/sweep-students-expired/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/sweep-students-overdue` | `src/app/api/cron/sweep-students-overdue/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/sweep-tenants-overdue` | `src/app/api/cron/sweep-tenants-overdue/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/sweep-visitor-events` | `src/app/api/cron/sweep-visitor-events/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/sync-cursos` | `src/app/api/cron/sync-cursos/route.ts` | route | Server (padrão) |
| `/api/cron/sync-cursos-lms` | `src/app/api/cron/sync-cursos-lms/route.ts` | route | Server (padrão) |
| `/api/cron/sync-day-update-lms` | `src/app/api/cron/sync-day-update-lms/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/sync-lms-branding` | `src/app/api/cron/sync-lms-branding/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/cron/sync-progresso` | `src/app/api/cron/sync-progresso/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/health` | `src/app/api/health/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/home/showcase` | `src/app/api/home/showcase/route.ts` | route | Server (padrão) |
| `/api/internal/resolve-tenant` | `src/app/api/internal/resolve-tenant/route.ts` | route | Server (padrão) |
| `/api/leads` | `src/app/api/leads/route.ts` | route | Server (padrão) |
| `/api/loja/checkout` | `src/app/api/loja/checkout/route.ts` | route | Server (padrão) |
| `/api/loja/checkout-inquiry` | `src/app/api/loja/checkout-inquiry/route.ts` | route | Server (padrão) |
| `/api/loja/checkout/installments` | `src/app/api/loja/checkout/installments/route.ts` | route | Server (padrão) |
| `/api/loja/checkout/package` | `src/app/api/loja/checkout/package/route.ts` | route | Server (padrão) |
| `/api/loja/checkout/process` | `src/app/api/loja/checkout/process/route.ts` | route | Server (padrão) |
| `/api/loja/checkout/status` | `src/app/api/loja/checkout/status/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/loja/confirmacao/[id]` | `src/app/api/loja/confirmacao/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/loja/courses` | `src/app/api/loja/courses/route.ts` | route | Server (padrão) |
| `/api/loja/cupom/validar` | `src/app/api/loja/cupom/validar/route.ts` | route | Server (padrão) |
| `/api/loja/cursos/[slug]` | `src/app/api/loja/cursos/[slug]/route.ts` | route | Dinâmica (segmento) |
| `/api/loja/leads` | `src/app/api/loja/leads/route.ts` | route | Server (padrão) |
| `/api/loja/track` | `src/app/api/loja/track/route.ts` | route | Server (padrão) |
| `/api/metrics/public` | `src/app/api/metrics/public/route.ts` | route | ISR (revalidate) |
| `/api/notifications` | `src/app/api/notifications/route.ts` | route | Server (padrão) |
| `/api/notifications/[id]/read` | `src/app/api/notifications/[id]/read/route.ts` | route | Dinâmica (segmento) |
| `/api/notifications/preferences` | `src/app/api/notifications/preferences/route.ts` | route | Server (padrão) |
| `/api/notifications/read-all` | `src/app/api/notifications/read-all/route.ts` | route | Server (padrão) |
| `/api/observability/client-log` | `src/app/api/observability/client-log/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/alunos` | `src/app/api/painel/alunos/route.ts` | route | Server (padrão) |
| `/api/painel/alunos/[id]` | `src/app/api/painel/alunos/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/bloquear` | `src/app/api/painel/alunos/[id]/bloquear/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/desbloquear` | `src/app/api/painel/alunos/[id]/desbloquear/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/impersonate` | `src/app/api/painel/alunos/[id]/impersonate/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/mensagem` | `src/app/api/painel/alunos/[id]/mensagem/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/notes` | `src/app/api/painel/alunos/[id]/notes/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/notify` | `src/app/api/painel/alunos/[id]/notify/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/plataforma-senha` | `src/app/api/painel/alunos/[id]/plataforma-senha/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/reenviar-email` | `src/app/api/painel/alunos/[id]/reenviar-email/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/alunos/[id]/reset-password` | `src/app/api/painel/alunos/[id]/reset-password/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/atendimento/[id]` | `src/app/api/painel/atendimento/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/automacao/config` | `src/app/api/painel/automacao/config/route.ts` | route | Server (padrão) |
| `/api/painel/automacao/templates` | `src/app/api/painel/automacao/templates/route.ts` | route | Server (padrão) |
| `/api/painel/automacao/whatsapp/connect` | `src/app/api/painel/automacao/whatsapp/connect/route.ts` | route | Server (padrão) |
| `/api/painel/automacao/whatsapp/disconnect` | `src/app/api/painel/automacao/whatsapp/disconnect/route.ts` | route | Server (padrão) |
| `/api/painel/automacao/whatsapp/pair` | `src/app/api/painel/automacao/whatsapp/pair/route.ts` | route | Server (padrão) |
| `/api/painel/automacao/whatsapp/status` | `src/app/api/painel/automacao/whatsapp/status/route.ts` | route | Server (padrão) |
| `/api/painel/banner` | `src/app/api/painel/banner/route.ts` | route | Server (padrão) |
| `/api/painel/banner/[id]` | `src/app/api/painel/banner/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/banner/upload` | `src/app/api/painel/banner/upload/route.ts` | route | Server (padrão) |
| `/api/painel/certificate-template` | `src/app/api/painel/certificate-template/route.ts` | route | Server (padrão) |
| `/api/painel/certificate-template/preview` | `src/app/api/painel/certificate-template/preview/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/certificate-template/upload` | `src/app/api/painel/certificate-template/upload/route.ts` | route | Server (padrão) |
| `/api/painel/certificates` | `src/app/api/painel/certificates/route.ts` | route | Server (padrão) |
| `/api/painel/certificates/[id]/download` | `src/app/api/painel/certificates/[id]/download/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/certificates/[id]/regenerate` | `src/app/api/painel/certificates/[id]/regenerate/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/certificates/[id]/revoke` | `src/app/api/painel/certificates/[id]/revoke/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/certificates/enrollments` | `src/app/api/painel/certificates/enrollments/route.ts` | route | Server (padrão) |
| `/api/painel/certificates/issue` | `src/app/api/painel/certificates/issue/route.ts` | route | Server (padrão) |
| `/api/painel/comunicacao/alunos` | `src/app/api/painel/comunicacao/alunos/route.ts` | route | Server (padrão) |
| `/api/painel/comunicacao/auto-config` | `src/app/api/painel/comunicacao/auto-config/route.ts` | route | Server (padrão) |
| `/api/painel/comunicacao/broadcast` | `src/app/api/painel/comunicacao/broadcast/route.ts` | route | Server (padrão) |
| `/api/painel/config` | `src/app/api/painel/config/route.ts` | route | Server (padrão) |
| `/api/painel/config/billing-mode` | `src/app/api/painel/config/billing-mode/route.ts` | route | Server (padrão) |
| `/api/painel/config/connect-asaas` | `src/app/api/painel/config/connect-asaas/route.ts` | route | Server (padrão) |
| `/api/painel/config/connect-mp` | `src/app/api/painel/config/connect-mp/route.ts` | route | Server (padrão) |
| `/api/painel/config/excluir-conta` | `src/app/api/painel/config/excluir-conta/route.ts` | route | Server (padrão) |
| `/api/painel/config/mensalidade` | `src/app/api/painel/config/mensalidade/route.ts` | route | Server (padrão) |
| `/api/painel/config/parcelamento` | `src/app/api/painel/config/parcelamento/route.ts` | route | Server (padrão) |
| `/api/painel/config/password` | `src/app/api/painel/config/password/route.ts` | route | Server (padrão) |
| `/api/painel/config/pix` | `src/app/api/painel/config/pix/route.ts` | route | Server (padrão) |
| `/api/painel/config/sales-gateway` | `src/app/api/painel/config/sales-gateway/route.ts` | route | Server (padrão) |
| `/api/painel/cupons` | `src/app/api/painel/cupons/route.ts` | route | Server (padrão) |
| `/api/painel/cupons/[id]/toggle` | `src/app/api/painel/cupons/[id]/toggle/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/cupons/[id]/usage` | `src/app/api/painel/cupons/[id]/usage/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/cupons/generate-code` | `src/app/api/painel/cupons/generate-code/route.ts` | route | Server (padrão) |
| `/api/painel/cursos` | `src/app/api/painel/cursos/route.ts` | route | Server (padrão) |
| `/api/painel/cursos/[id]` | `src/app/api/painel/cursos/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/cursos/[id]/capa` | `src/app/api/painel/cursos/[id]/capa/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/cursos/[id]/visibility` | `src/app/api/painel/cursos/[id]/visibility/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/cursos/bulk` | `src/app/api/painel/cursos/bulk/route.ts` | route | Server (padrão) |
| `/api/painel/dashboard` | `src/app/api/painel/dashboard/route.ts` | route | Server (padrão) |
| `/api/painel/dominio` | `src/app/api/painel/dominio/route.ts` | route | Server (padrão) |
| `/api/painel/dominio/verify` | `src/app/api/painel/dominio/verify/route.ts` | route | Server (padrão) |
| `/api/painel/equipe` | `src/app/api/painel/equipe/route.ts` | route | Server (padrão) |
| `/api/painel/equipe/[id]` | `src/app/api/painel/equipe/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/equipe/[id]/resend-invite` | `src/app/api/painel/equipe/[id]/resend-invite/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/financeiro` | `src/app/api/painel/financeiro/route.ts` | route | Server (padrão) |
| `/api/painel/financeiro/export-csv` | `src/app/api/painel/financeiro/export-csv/route.ts` | route | Server (padrão) |
| `/api/painel/home-sections` | `src/app/api/painel/home-sections/route.ts` | route | Server (padrão) |
| `/api/painel/home-sections/[id]` | `src/app/api/painel/home-sections/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/home-sections/options` | `src/app/api/painel/home-sections/options/route.ts` | route | Server (padrão) |
| `/api/painel/home-sections/reorder` | `src/app/api/painel/home-sections/reorder/route.ts` | route | Server (padrão) |
| `/api/painel/indicacoes/demonstrativo` | `src/app/api/painel/indicacoes/demonstrativo/route.ts` | route | Server (padrão) |
| `/api/painel/indicacoes/proof/[payoutId]` | `src/app/api/painel/indicacoes/proof/[payoutId]/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/leads` | `src/app/api/painel/leads/route.ts` | route | Server (padrão) |
| `/api/painel/leads/[id]` | `src/app/api/painel/leads/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/leads/[id]/activities` | `src/app/api/painel/leads/[id]/activities/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/leads/[id]/stage` | `src/app/api/painel/leads/[id]/stage/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/leads/[id]/whatsapp` | `src/app/api/painel/leads/[id]/whatsapp/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/leads/distribuicao` | `src/app/api/painel/leads/distribuicao/route.ts` | route | Server (padrão) |
| `/api/painel/onboarding` | `src/app/api/painel/onboarding/route.ts` | route | Server (padrão) |
| `/api/painel/onboarding-tour` | `src/app/api/painel/onboarding-tour/route.ts` | route | Server (padrão) |
| `/api/painel/pacotes` | `src/app/api/painel/pacotes/route.ts` | route | Server (padrão) |
| `/api/painel/pacotes/[id]` | `src/app/api/painel/pacotes/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/pacotes/capa` | `src/app/api/painel/pacotes/capa/route.ts` | route | Server (padrão) |
| `/api/painel/pacotes/courses-lookup` | `src/app/api/painel/pacotes/courses-lookup/route.ts` | route | Server (padrão) |
| `/api/painel/pacotes/pmb/[packageId]` | `src/app/api/painel/pacotes/pmb/[packageId]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/placar/stream` | `src/app/api/painel/placar/stream/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/referrals/request-payout` | `src/app/api/painel/referrals/request-payout/route.ts` | route | Server (padrão) |
| `/api/painel/relatorios/bi/[tab]` | `src/app/api/painel/relatorios/bi/[tab]/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/relatorios/export` | `src/app/api/painel/relatorios/export/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/relatorios/export/[report]` | `src/app/api/painel/relatorios/export/[report]/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/painel/revendas` | `src/app/api/painel/revendas/route.ts` | route | Server (padrão) |
| `/api/painel/revendas/leads/[id]` | `src/app/api/painel/revendas/leads/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/painel/tracking` | `src/app/api/painel/tracking/route.ts` | route | Server (padrão) |
| `/api/painel/treinamentos/progress` | `src/app/api/painel/treinamentos/progress/route.ts` | route | Server (padrão) |
| `/api/painel/vendas` | `src/app/api/painel/vendas/route.ts` | route | Server (padrão) |
| `/api/painel/vitrine` | `src/app/api/painel/vitrine/route.ts` | route | Server (padrão) |
| `/api/painel/vitrine/upload` | `src/app/api/painel/vitrine/upload/route.ts` | route | Server (padrão) |
| `/api/placar/stream` | `src/app/api/placar/stream/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/pmb/leads` | `src/app/api/pmb/leads/route.ts` | route | Server (padrão) |
| `/api/public/capture-ref` | `src/app/api/public/capture-ref/route.ts` | route | Server (padrão) |
| `/api/public/validate-ref` | `src/app/api/public/validate-ref/route.ts` | route | Server (padrão) |
| `/api/push/devices` | `src/app/api/push/devices/route.ts` | route | Server (padrão) |
| `/api/push/devices/[id]` | `src/app/api/push/devices/[id]/route.ts` | route | Dinâmica (segmento) |
| `/api/push/public-key` | `src/app/api/push/public-key/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/push/subscribe` | `src/app/api/push/subscribe/route.ts` | route | Server (padrão) |
| `/api/revendedores/cadastro` | `src/app/api/revendedores/cadastro/route.ts` | route | Server (padrão) |
| `/api/student/certificates/[id]/download` | `src/app/api/student/certificates/[id]/download/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/student/certificates/issue` | `src/app/api/student/certificates/issue/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/tours/dismiss` | `src/app/api/tours/dismiss/route.ts` | route | Server (padrão) |
| `/api/vitrine/manifest` | `src/app/api/vitrine/manifest/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/webhooks/asaas` | `src/app/api/webhooks/asaas/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/webhooks/lms` | `src/app/api/webhooks/lms/route.ts` | route | Dinâmica (force-dynamic) |
| `/api/webhooks/mercadopago` | `src/app/api/webhooks/mercadopago/route.ts` | route | Dinâmica (force-dynamic) |
| `/categoria/[slug]` | `src/app/(main)/categoria/[slug]/page.tsx` | page | Dinâmica (segmento) |
| `/certificado` | `src/app/(main)/certificado/page.tsx` | page | Server (padrão) |
| `/checkout` | `src/app/(main)/checkout/page.tsx` | page | Dinâmica (force-dynamic) |
| `/checkout/confirmacao` | `src/app/(main)/checkout/confirmacao/page.tsx` | page | Dinâmica (force-dynamic) |
| `/cobranca/[paymentId]` | `src/app/cobranca/[paymentId]/page.tsx` | page | Dinâmica (segmento) |
| `/como-funciona` | `src/app/(main)/como-funciona/page.tsx` | page | Server (padrão) |
| `/contato` | `src/app/(main)/contato/page.tsx` | page | Server (padrão) |
| `/contrato-de-revenda` | `src/app/(main)/contrato-de-revenda/page.tsx` | page | Server (padrão) |
| `/cursos` | `src/app/(main)/cursos/page.tsx` | page | Dinâmica (force-dynamic) |
| `/cursos-tecnicos/ir` | `src/app/(main)/cursos-tecnicos/ir/page.tsx` | page | Dinâmica (force-dynamic) |
| `/cursos/[slug]` | `src/app/(main)/cursos/[slug]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/eja/ir` | `src/app/(main)/eja/ir/page.tsx` | page | Dinâmica (force-dynamic) |
| `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` | page | Server (padrão) |
| `/inadimplente` | `src/app/inadimplente/page.tsx` | page | Server (padrão) |
| `/livrecursos` | `src/app/livrecursos/layout.tsx` | layout | Server (padrão) |
| `/livrecursos` | `src/app/livrecursos/page.tsx` | page | Server (padrão) |
| `/llms.txt` | `src/app/llms.txt/route.ts` | route | ISR (revalidate) |
| `/login` | `src/app/(auth)/login/page.tsx` | page | Server (padrão) |
| `/logout` | `src/app/logout/page.tsx` | page | Client |
| `/loja` | `src/app/loja/error.tsx` | error | Client |
| `/loja` | `src/app/loja/layout.tsx` | layout | Server (padrão) |
| `/loja` | `src/app/loja/loading.tsx` | loading | Server (padrão) |
| `/loja` | `src/app/loja/not-found.tsx` | not-found | Server (padrão) |
| `/loja` | `src/app/loja/page.tsx` | page | Dinâmica (force-dynamic) |
| `/loja/checkout` | `src/app/loja/checkout/page.tsx` | page | Server (padrão) |
| `/loja/confirmacao` | `src/app/loja/confirmacao/page.tsx` | page | Server (padrão) |
| `/loja/contato` | `src/app/loja/contato/page.tsx` | page | Dinâmica (force-dynamic) |
| `/loja/curso/[slug]` | `src/app/loja/curso/[slug]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/loja/cursos` | `src/app/loja/cursos/page.tsx` | page | Dinâmica (force-dynamic) |
| `/loja/pacote/[slug]` | `src/app/loja/pacote/[slug]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/loja/pagar/[id]` | `src/app/loja/pagar/[id]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/loja/suspended` | `src/app/loja/suspended/page.tsx` | page | Dinâmica (force-dynamic) |
| `/lp-revenda2` | `src/app/(landing)/lp-revenda2/page.tsx` | page | Server (padrão) |
| `/offline` | `src/app/offline/page.tsx` | page | Server (padrão) |
| `/pacotes/[slug]` | `src/app/(main)/pacotes/[slug]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/pagar/[id]` | `src/app/(main)/pagar/[id]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel` | `src/app/painel/error.tsx` | error | Client |
| `/painel` | `src/app/painel/layout.tsx` | layout | Server (padrão) |
| `/painel` | `src/app/painel/loading.tsx` | loading | Server (padrão) |
| `/painel` | `src/app/painel/not-found.tsx` | not-found | Server (padrão) |
| `/painel` | `src/app/painel/page.tsx` | page | Server (padrão) |
| `/painel/alunos` | `src/app/painel/alunos/page.tsx` | page | Server (padrão) |
| `/painel/alunos/[id]` | `src/app/painel/alunos/[id]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/atendimento` | `src/app/painel/atendimento/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/automacao` | `src/app/painel/automacao/page.tsx` | page | Server (padrão) |
| `/painel/automacao/conexao` | `src/app/painel/automacao/conexao/page.tsx` | page | Server (padrão) |
| `/painel/automacao/mensagens` | `src/app/painel/automacao/mensagens/page.tsx` | page | Server (padrão) |
| `/painel/certificados` | `src/app/painel/certificados/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/certificados/emitidos` | `src/app/painel/certificados/emitidos/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/certificados/emitir` | `src/app/painel/certificados/emitir/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/certificados/template` | `src/app/painel/certificados/template/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/comunicacao` | `src/app/painel/comunicacao/page.tsx` | page | Server (padrão) |
| `/painel/configuracoes` | `src/app/painel/configuracoes/page.tsx` | page | Server (padrão) |
| `/painel/cupons` | `src/app/painel/cupons/page.tsx` | page | Server (padrão) |
| `/painel/cursos` | `src/app/painel/cursos/page.tsx` | page | Server (padrão) |
| `/painel/dominio` | `src/app/painel/dominio/page.tsx` | page | Server (padrão) |
| `/painel/equipe` | `src/app/painel/equipe/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/financeiro` | `src/app/painel/financeiro/page.tsx` | page | Server (padrão) |
| `/painel/indicacoes` | `src/app/painel/indicacoes/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/indicacoes/materiais` | `src/app/painel/indicacoes/materiais/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/indicacoes/sacar` | `src/app/painel/indicacoes/sacar/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/leads` | `src/app/painel/leads/page.tsx` | page | Server (padrão) |
| `/painel/leads/configuracao` | `src/app/painel/leads/configuracao/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/notificacoes` | `src/app/painel/notificacoes/page.tsx` | page | Server (padrão) |
| `/painel/onboarding` | `src/app/painel/onboarding/page.tsx` | page | Server (padrão) |
| `/painel/placar` | `src/app/painel/placar/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/relatorios` | `src/app/painel/relatorios/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/relatorios/[tab]` | `src/app/painel/relatorios/[tab]/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/revendas` | `src/app/painel/revendas/page.tsx` | page | Server (padrão) |
| `/painel/revendas/[id]` | `src/app/painel/revendas/[id]/page.tsx` | page | Dinâmica (segmento) |
| `/painel/revendas/leads` | `src/app/painel/revendas/leads/page.tsx` | page | Server (padrão) |
| `/painel/revendas/nova` | `src/app/painel/revendas/nova/page.tsx` | page | Server (padrão) |
| `/painel/treinamentos` | `src/app/painel/treinamentos/page.tsx` | page | Server (padrão) |
| `/painel/treinamentos/[moduleId]` | `src/app/painel/treinamentos/[moduleId]/page.tsx` | page | Dinâmica (segmento) |
| `/painel/vendas` | `src/app/painel/vendas/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/vendas/nova` | `src/app/painel/vendas/nova/page.tsx` | page | Dinâmica (force-dynamic) |
| `/painel/vitrine` | `src/app/painel/vitrine/page.tsx` | page | Server (padrão) |
| `/placar` | `src/app/placar/page.tsx` | page | Dinâmica (force-dynamic) |
| `/privacidade` | `src/app/(main)/privacidade/page.tsx` | page | Server (padrão) |
| `/reembolso` | `src/app/(main)/reembolso/page.tsx` | page | Server (padrão) |
| `/reset-password` | `src/app/(auth)/reset-password/page.tsx` | page | Server (padrão) |
| `/seja-revendedor` | `src/app/(landing)/seja-revendedor/page.tsx` | page | Server (padrão) |
| `/seja-revendedor/checkout` | `src/app/(landing)/seja-revendedor/checkout/page.tsx` | page | Server (padrão) |
| `/seja-revendedor/pre-live` | `src/app/(landing)/seja-revendedor/pre-live/page.tsx` | page | Server (padrão) |
| `/sobre` | `src/app/(main)/sobre/page.tsx` | page | Server (padrão) |
| `/termos` | `src/app/(main)/termos/page.tsx` | page | Server (padrão) |
| `/validar` | `src/app/validar/page.tsx` | page | Server (padrão) |
| `/validar/[code]` | `src/app/validar/[code]/page.tsx` | page | Dinâmica (force-dynamic) |

## Telas (URLs navegáveis — 137)

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
- `/admin/relatorios/[tab]`
- `/admin/relatorios/exportar/[type]`
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
- `/aluno/comprar/pagar/[id]`
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
- `/pagar/[id]`
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
- `/painel/placar`
- `/painel/relatorios`
- `/painel/relatorios/[tab]`
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

## Server Actions (`"use server"`)

| Arquivo | Funções exportadas |
|---|---|
| `src/app/inadimplente/page.tsx` | inline: action anônima do form (`signOut`) — linha 118 |
| `src/app/validar/page.tsx` | inline: `verificar(formData)` — linha 13 |
| `src/lib/coupons/preview.ts` | `previewCheckoutCoupon` (module-level) |

## Route handlers (309 arquivos · 406 métodos)

| URL | Métodos | Arquivo |
|---|---|---|
| `/api/admin/alunos` | GET POST | `src/app/api/admin/alunos/route.ts` |
| `/api/admin/alunos/[id]` | GET PATCH | `src/app/api/admin/alunos/[id]/route.ts` |
| `/api/admin/alunos/[id]/bloquear` | POST | `src/app/api/admin/alunos/[id]/bloquear/route.ts` |
| `/api/admin/alunos/[id]/cursos` | GET POST DELETE | `src/app/api/admin/alunos/[id]/cursos/route.ts` |
| `/api/admin/alunos/[id]/desbloquear` | POST | `src/app/api/admin/alunos/[id]/desbloquear/route.ts` |
| `/api/admin/alunos/[id]/enrollments/[enrollmentId]/cancelar` | POST | `src/app/api/admin/alunos/[id]/enrollments/[enrollmentId]/cancelar/route.ts` |
| `/api/admin/alunos/[id]/impersonate` | POST | `src/app/api/admin/alunos/[id]/impersonate/route.ts` |
| `/api/admin/alunos/[id]/notes` | GET POST DELETE | `src/app/api/admin/alunos/[id]/notes/route.ts` |
| `/api/admin/alunos/[id]/notify` | POST | `src/app/api/admin/alunos/[id]/notify/route.ts` |
| `/api/admin/alunos/[id]/plataforma-senha` | POST | `src/app/api/admin/alunos/[id]/plataforma-senha/route.ts` |
| `/api/admin/alunos/[id]/reenviar-email` | POST | `src/app/api/admin/alunos/[id]/reenviar-email/route.ts` |
| `/api/admin/alunos/[id]/reset-password` | POST | `src/app/api/admin/alunos/[id]/reset-password/route.ts` |
| `/api/admin/alunos/global` | GET | `src/app/api/admin/alunos/global/route.ts` |
| `/api/admin/analytics` | GET | `src/app/api/admin/analytics/route.ts` |
| `/api/admin/atendimento/[id]` | PATCH | `src/app/api/admin/atendimento/[id]/route.ts` |
| `/api/admin/automacao/config` | GET PUT | `src/app/api/admin/automacao/config/route.ts` |
| `/api/admin/automacao/templates` | GET PUT | `src/app/api/admin/automacao/templates/route.ts` |
| `/api/admin/automacao/whatsapp/connect` | POST | `src/app/api/admin/automacao/whatsapp/connect/route.ts` |
| `/api/admin/automacao/whatsapp/disconnect` | POST | `src/app/api/admin/automacao/whatsapp/disconnect/route.ts` |
| `/api/admin/automacao/whatsapp/pair` | POST | `src/app/api/admin/automacao/whatsapp/pair/route.ts` |
| `/api/admin/automacao/whatsapp/status` | GET | `src/app/api/admin/automacao/whatsapp/status/route.ts` |
| `/api/admin/banner` | GET POST | `src/app/api/admin/banner/route.ts` |
| `/api/admin/banner/[id]` | PATCH DELETE | `src/app/api/admin/banner/[id]/route.ts` |
| `/api/admin/banner/upload` | POST | `src/app/api/admin/banner/upload/route.ts` |
| `/api/admin/catalogo` | GET | `src/app/api/admin/catalogo/route.ts` |
| `/api/admin/catalogo/[id]` | GET PATCH | `src/app/api/admin/catalogo/[id]/route.ts` |
| `/api/admin/catalogo/bulk` | GET PUT | `src/app/api/admin/catalogo/bulk/route.ts` |
| `/api/admin/catalogo/bulk-provider-visibility` | POST | `src/app/api/admin/catalogo/bulk-provider-visibility/route.ts` |
| `/api/admin/catalogo/categorias` | GET POST | `src/app/api/admin/catalogo/categorias/route.ts` |
| `/api/admin/catalogo/categorias/[id]` | PATCH DELETE | `src/app/api/admin/catalogo/categorias/[id]/route.ts` |
| `/api/admin/catalogo/sync` | POST | `src/app/api/admin/catalogo/sync/route.ts` |
| `/api/admin/catalogo/sync-log` | GET | `src/app/api/admin/catalogo/sync-log/route.ts` |
| `/api/admin/catalogo/tenants-lookup` | GET | `src/app/api/admin/catalogo/tenants-lookup/route.ts` |
| `/api/admin/certificate-template` | GET PUT | `src/app/api/admin/certificate-template/route.ts` |
| `/api/admin/certificate-template/preview` | POST | `src/app/api/admin/certificate-template/preview/route.ts` |
| `/api/admin/certificate-template/upload` | POST DELETE | `src/app/api/admin/certificate-template/upload/route.ts` |
| `/api/admin/certificates` | GET | `src/app/api/admin/certificates/route.ts` |
| `/api/admin/certificates/[id]/download` | GET | `src/app/api/admin/certificates/[id]/download/route.ts` |
| `/api/admin/certificates/[id]/regenerate` | POST | `src/app/api/admin/certificates/[id]/regenerate/route.ts` |
| `/api/admin/certificates/[id]/revoke` | POST | `src/app/api/admin/certificates/[id]/revoke/route.ts` |
| `/api/admin/certificates/enrollments` | GET | `src/app/api/admin/certificates/enrollments/route.ts` |
| `/api/admin/certificates/issue` | POST | `src/app/api/admin/certificates/issue/route.ts` |
| `/api/admin/certificates/regenerate-all` | POST | `src/app/api/admin/certificates/regenerate-all/route.ts` |
| `/api/admin/config` | GET PATCH | `src/app/api/admin/config/route.ts` |
| `/api/admin/config/test-asaas` | POST | `src/app/api/admin/config/test-asaas/route.ts` |
| `/api/admin/config/test-mp` | POST | `src/app/api/admin/config/test-mp/route.ts` |
| `/api/admin/config/test-plataforma` | POST | `src/app/api/admin/config/test-plataforma/route.ts` |
| `/api/admin/cupons` | GET POST | `src/app/api/admin/cupons/route.ts` |
| `/api/admin/cupons/[id]/toggle` | PATCH | `src/app/api/admin/cupons/[id]/toggle/route.ts` |
| `/api/admin/cupons/validate` | POST | `src/app/api/admin/cupons/validate/route.ts` |
| `/api/admin/dashboard` | GET | `src/app/api/admin/dashboard/route.ts` |
| `/api/admin/end-impersonation` | POST | `src/app/api/admin/end-impersonation/route.ts` |
| `/api/admin/equipe` | GET POST | `src/app/api/admin/equipe/route.ts` |
| `/api/admin/equipe/[id]` | GET PATCH DELETE | `src/app/api/admin/equipe/[id]/route.ts` |
| `/api/admin/equipe/[id]/impersonate` | POST | `src/app/api/admin/equipe/[id]/impersonate/route.ts` |
| `/api/admin/equipe/[id]/resend-invite` | POST | `src/app/api/admin/equipe/[id]/resend-invite/route.ts` |
| `/api/admin/financeiro` | GET | `src/app/api/admin/financeiro/route.ts` |
| `/api/admin/financeiro/overdue` | GET | `src/app/api/admin/financeiro/overdue/route.ts` |
| `/api/admin/financeiro/referral-payouts` | GET | `src/app/api/admin/financeiro/referral-payouts/route.ts` |
| `/api/admin/financeiro/referral-payouts/[id]/fail` | POST | `src/app/api/admin/financeiro/referral-payouts/[id]/fail/route.ts` |
| `/api/admin/financeiro/referral-payouts/[id]/mark-paid` | POST | `src/app/api/admin/financeiro/referral-payouts/[id]/mark-paid/route.ts` |
| `/api/admin/financeiro/referral-payouts/[id]/note` | POST | `src/app/api/admin/financeiro/referral-payouts/[id]/note/route.ts` |
| `/api/admin/financeiro/referral-payouts/[id]/proof` | POST | `src/app/api/admin/financeiro/referral-payouts/[id]/proof/route.ts` |
| `/api/admin/financeiro/referral-payouts/[id]/proof/download` | GET | `src/app/api/admin/financeiro/referral-payouts/[id]/proof/download/route.ts` |
| `/api/admin/financeiro/tenant-payments` | GET | `src/app/api/admin/financeiro/tenant-payments/route.ts` |
| `/api/admin/financeiro/tenant-payments/[id]/mark-paid` | POST | `src/app/api/admin/financeiro/tenant-payments/[id]/mark-paid/route.ts` |
| `/api/admin/financeiro/tenant-payments/[id]/note` | POST | `src/app/api/admin/financeiro/tenant-payments/[id]/note/route.ts` |
| `/api/admin/home-sections` | GET POST | `src/app/api/admin/home-sections/route.ts` |
| `/api/admin/home-sections/[id]` | PATCH DELETE | `src/app/api/admin/home-sections/[id]/route.ts` |
| `/api/admin/home-sections/options` | GET | `src/app/api/admin/home-sections/options/route.ts` |
| `/api/admin/home-sections/reorder` | PATCH | `src/app/api/admin/home-sections/reorder/route.ts` |
| `/api/admin/leads` | GET | `src/app/api/admin/leads/route.ts` |
| `/api/admin/leads-revenda/[id]` | PATCH | `src/app/api/admin/leads-revenda/[id]/route.ts` |
| `/api/admin/leads-revenda/distribuicao` | GET PUT | `src/app/api/admin/leads-revenda/distribuicao/route.ts` |
| `/api/admin/leads/[id]` | GET DELETE | `src/app/api/admin/leads/[id]/route.ts` |
| `/api/admin/leads/[id]/activities` | POST | `src/app/api/admin/leads/[id]/activities/route.ts` |
| `/api/admin/leads/[id]/stage` | PATCH | `src/app/api/admin/leads/[id]/stage/route.ts` |
| `/api/admin/leads/[id]/whatsapp` | POST | `src/app/api/admin/leads/[id]/whatsapp/route.ts` |
| `/api/admin/me` | GET PUT | `src/app/api/admin/me/route.ts` |
| `/api/admin/me/password` | PUT | `src/app/api/admin/me/password/route.ts` |
| `/api/admin/notifications/auto-config` | GET PATCH | `src/app/api/admin/notifications/auto-config/route.ts` |
| `/api/admin/notifications/broadcast` | POST | `src/app/api/admin/notifications/broadcast/route.ts` |
| `/api/admin/pacotes` | GET POST | `src/app/api/admin/pacotes/route.ts` |
| `/api/admin/pacotes/[id]` | GET PUT DELETE | `src/app/api/admin/pacotes/[id]/route.ts` |
| `/api/admin/pacotes/capa` | POST | `src/app/api/admin/pacotes/capa/route.ts` |
| `/api/admin/pacotes/courses-lookup` | GET | `src/app/api/admin/pacotes/courses-lookup/route.ts` |
| `/api/admin/referrals/clawback/resolve` | POST | `src/app/api/admin/referrals/clawback/resolve/route.ts` |
| `/api/admin/referrals/commissions/export` | GET | `src/app/api/admin/referrals/commissions/export/route.ts` |
| `/api/admin/referrals/payouts/[id]/approve` | POST | `src/app/api/admin/referrals/payouts/[id]/approve/route.ts` |
| `/api/admin/referrals/payouts/[id]/fail` | POST | `src/app/api/admin/referrals/payouts/[id]/fail/route.ts` |
| `/api/admin/referrals/payouts/export` | GET | `src/app/api/admin/referrals/payouts/export/route.ts` |
| `/api/admin/relatorios` | GET | `src/app/api/admin/relatorios/route.ts` |
| `/api/admin/relatorios/[type]` | GET | `src/app/api/admin/relatorios/[type]/route.ts` |
| `/api/admin/relatorios/bi/[tab]` | GET | `src/app/api/admin/relatorios/bi/[tab]/route.ts` |
| `/api/admin/revendedores` | GET POST | `src/app/api/admin/revendedores/route.ts` |
| `/api/admin/revendedores/[id]` | GET DELETE | `src/app/api/admin/revendedores/[id]/route.ts` |
| `/api/admin/revendedores/[id]/anonimizar` | POST | `src/app/api/admin/revendedores/[id]/anonimizar/route.ts` |
| `/api/admin/revendedores/[id]/billing` | PATCH | `src/app/api/admin/revendedores/[id]/billing/route.ts` |
| `/api/admin/revendedores/[id]/comissoes/demonstrativo` | GET | `src/app/api/admin/revendedores/[id]/comissoes/demonstrativo/route.ts` |
| `/api/admin/revendedores/[id]/comissoes/export` | GET | `src/app/api/admin/revendedores/[id]/comissoes/export/route.ts` |
| `/api/admin/revendedores/[id]/impersonate` | POST | `src/app/api/admin/revendedores/[id]/impersonate/route.ts` |
| `/api/admin/revendedores/[id]/manager` | PATCH | `src/app/api/admin/revendedores/[id]/manager/route.ts` |
| `/api/admin/revendedores/[id]/notes` | GET POST | `src/app/api/admin/revendedores/[id]/notes/route.ts` |
| `/api/admin/revendedores/[id]/password` | PATCH | `src/app/api/admin/revendedores/[id]/password/route.ts` |
| `/api/admin/revendedores/[id]/payments/[paymentId]` | PATCH DELETE | `src/app/api/admin/revendedores/[id]/payments/[paymentId]/route.ts` |
| `/api/admin/revendedores/[id]/policy` | PATCH | `src/app/api/admin/revendedores/[id]/policy/route.ts` |
| `/api/admin/revendedores/[id]/sales` | PATCH | `src/app/api/admin/revendedores/[id]/sales/route.ts` |
| `/api/admin/revendedores/[id]/slug` | PATCH | `src/app/api/admin/revendedores/[id]/slug/route.ts` |
| `/api/admin/revendedores/[id]/status` | PATCH | `src/app/api/admin/revendedores/[id]/status/route.ts` |
| `/api/admin/system-settings/certificates` | GET PUT | `src/app/api/admin/system-settings/certificates/route.ts` |
| `/api/admin/system-settings/eja` | GET PUT | `src/app/api/admin/system-settings/eja/route.ts` |
| `/api/admin/system-settings/eja/upload` | POST | `src/app/api/admin/system-settings/eja/upload/route.ts` |
| `/api/admin/system-settings/group-logo/upload` | POST DELETE | `src/app/api/admin/system-settings/group-logo/upload/route.ts` |
| `/api/admin/system-settings/referrals` | PUT | `src/app/api/admin/system-settings/referrals/route.ts` |
| `/api/admin/system-settings/tecnica` | GET PUT | `src/app/api/admin/system-settings/tecnica/route.ts` |
| `/api/admin/system-settings/tecnica/upload` | POST | `src/app/api/admin/system-settings/tecnica/upload/route.ts` |
| `/api/admin/system-settings/tracking` | GET PUT | `src/app/api/admin/system-settings/tracking/route.ts` |
| `/api/admin/tenants/[id]/asaas-gateway` | PUT | `src/app/api/admin/tenants/[id]/asaas-gateway/route.ts` |
| `/api/admin/tenants/[id]/automacao` | PUT | `src/app/api/admin/tenants/[id]/automacao/route.ts` |
| `/api/admin/tenants/[id]/can-sell-resellers` | PUT | `src/app/api/admin/tenants/[id]/can-sell-resellers/route.ts` |
| `/api/admin/tenants/[id]/eja` | PUT | `src/app/api/admin/tenants/[id]/eja/route.ts` |
| `/api/admin/tenants/[id]/mensalidade` | PUT | `src/app/api/admin/tenants/[id]/mensalidade/route.ts` |
| `/api/admin/tenants/[id]/referral-percent` | PUT | `src/app/api/admin/tenants/[id]/referral-percent/route.ts` |
| `/api/admin/tenants/[id]/tecnica` | PUT | `src/app/api/admin/tenants/[id]/tecnica/route.ts` |
| `/api/admin/treinamentos/modules` | GET POST | `src/app/api/admin/treinamentos/modules/route.ts` |
| `/api/admin/treinamentos/modules/[id]` | PATCH DELETE | `src/app/api/admin/treinamentos/modules/[id]/route.ts` |
| `/api/admin/treinamentos/progress` | POST | `src/app/api/admin/treinamentos/progress/route.ts` |
| `/api/admin/treinamentos/reorder` | POST | `src/app/api/admin/treinamentos/reorder/route.ts` |
| `/api/admin/treinamentos/videos` | POST | `src/app/api/admin/treinamentos/videos/route.ts` |
| `/api/admin/treinamentos/videos/[id]` | PATCH DELETE | `src/app/api/admin/treinamentos/videos/[id]/route.ts` |
| `/api/admin/vendas` | GET POST | `src/app/api/admin/vendas/route.ts` |
| `/api/admin/vendas/[id]/sync-payment` | POST | `src/app/api/admin/vendas/[id]/sync-payment/route.ts` |
| `/api/aluno/catalogo` | GET | `src/app/api/aluno/catalogo/route.ts` |
| `/api/aluno/comprar` | POST | `src/app/api/aluno/comprar/route.ts` |
| `/api/aluno/comprar/installments` | POST | `src/app/api/aluno/comprar/installments/route.ts` |
| `/api/aluno/comprar/process` | POST | `src/app/api/aluno/comprar/process/route.ts` |
| `/api/aluno/comprar/status` | GET | `src/app/api/aluno/comprar/status/route.ts` |
| `/api/aluno/conta` | DELETE | `src/app/api/aluno/conta/route.ts` |
| `/api/aluno/curso/[enrollmentId]/acessar` | GET | `src/app/api/aluno/curso/[enrollmentId]/acessar/route.ts` |
| `/api/aluno/pagamentos/verificar` | POST | `src/app/api/aluno/pagamentos/verificar/route.ts` |
| `/api/aluno/perfil` | PATCH | `src/app/api/aluno/perfil/route.ts` |
| `/api/aluno/senha` | PATCH | `src/app/api/aluno/senha/route.ts` |
| `/api/aluno/senha-plataforma` | PATCH | `src/app/api/aluno/senha-plataforma/route.ts` |
| `/api/aluno/suporte` | POST | `src/app/api/aluno/suporte/route.ts` |
| `/api/auth/[...nextauth]` | (re-export?) | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/auth/alterar-senha-inicial` | POST | `src/app/api/auth/alterar-senha-inicial/route.ts` |
| `/api/auth/forgot-password` | POST | `src/app/api/auth/forgot-password/route.ts` |
| `/api/auth/handoff` | GET | `src/app/api/auth/handoff/route.ts` |
| `/api/auth/handoff/start` | GET | `src/app/api/auth/handoff/start/route.ts` |
| `/api/auth/reset-password` | POST | `src/app/api/auth/reset-password/route.ts` |
| `/api/catalogo/sugestoes` | GET | `src/app/api/catalogo/sugestoes/route.ts` |
| `/api/checkout` | POST | `src/app/api/checkout/route.ts` |
| `/api/checkout/confirmacao/[id]/status` | GET | `src/app/api/checkout/confirmacao/[id]/status/route.ts` |
| `/api/checkout/enrollment/[id]` | POST | `src/app/api/checkout/enrollment/[id]/route.ts` |
| `/api/checkout/installments` | POST | `src/app/api/checkout/installments/route.ts` |
| `/api/checkout/mp/process` | POST | `src/app/api/checkout/mp/process/route.ts` |
| `/api/checkout/package` | POST | `src/app/api/checkout/package/route.ts` |
| `/api/checkout/status` | GET | `src/app/api/checkout/status/route.ts` |
| `/api/cobranca/[paymentId]` | GET | `src/app/api/cobranca/[paymentId]/route.ts` |
| `/api/cobranca/[paymentId]/billing-info` | GET | `src/app/api/cobranca/[paymentId]/billing-info/route.ts` |
| `/api/cobranca/[paymentId]/pay-card` | POST | `src/app/api/cobranca/[paymentId]/pay-card/route.ts` |
| `/api/contato` | POST | `src/app/api/contato/route.ts` |
| `/api/cron/cleanup-webhook-logs` | GET POST | `src/app/api/cron/cleanup-webhook-logs/route.ts` |
| `/api/cron/fix-gateway-collapse` | GET POST | `src/app/api/cron/fix-gateway-collapse/route.ts` |
| `/api/cron/reactivate-paid` | GET POST | `src/app/api/cron/reactivate-paid/route.ts` |
| `/api/cron/reconcile-tenant-payments` | GET POST | `src/app/api/cron/reconcile-tenant-payments/route.ts` |
| `/api/cron/referral-monthly-payout` | GET POST | `src/app/api/cron/referral-monthly-payout/route.ts` |
| `/api/cron/resync-lms-credentials` | GET POST | `src/app/api/cron/resync-lms-credentials/route.ts` |
| `/api/cron/resync-platform-passwords` | GET POST | `src/app/api/cron/resync-platform-passwords/route.ts` |
| `/api/cron/sweep-abandoned-leads` | GET POST | `src/app/api/cron/sweep-abandoned-leads/route.ts` |
| `/api/cron/sweep-students-expired` | GET POST | `src/app/api/cron/sweep-students-expired/route.ts` |
| `/api/cron/sweep-students-overdue` | GET POST | `src/app/api/cron/sweep-students-overdue/route.ts` |
| `/api/cron/sweep-tenants-overdue` | GET POST | `src/app/api/cron/sweep-tenants-overdue/route.ts` |
| `/api/cron/sweep-visitor-events` | GET POST | `src/app/api/cron/sweep-visitor-events/route.ts` |
| `/api/cron/sync-cursos` | GET POST | `src/app/api/cron/sync-cursos/route.ts` |
| `/api/cron/sync-cursos-lms` | GET POST | `src/app/api/cron/sync-cursos-lms/route.ts` |
| `/api/cron/sync-day-update-lms` | GET POST | `src/app/api/cron/sync-day-update-lms/route.ts` |
| `/api/cron/sync-lms-branding` | GET POST | `src/app/api/cron/sync-lms-branding/route.ts` |
| `/api/cron/sync-progresso` | GET POST | `src/app/api/cron/sync-progresso/route.ts` |
| `/api/health` | GET | `src/app/api/health/route.ts` |
| `/api/home/showcase` | GET | `src/app/api/home/showcase/route.ts` |
| `/api/internal/resolve-tenant` | GET | `src/app/api/internal/resolve-tenant/route.ts` |
| `/api/leads` | POST | `src/app/api/leads/route.ts` |
| `/api/loja/checkout` | POST | `src/app/api/loja/checkout/route.ts` |
| `/api/loja/checkout-inquiry` | POST | `src/app/api/loja/checkout-inquiry/route.ts` |
| `/api/loja/checkout/installments` | POST | `src/app/api/loja/checkout/installments/route.ts` |
| `/api/loja/checkout/package` | POST | `src/app/api/loja/checkout/package/route.ts` |
| `/api/loja/checkout/process` | POST | `src/app/api/loja/checkout/process/route.ts` |
| `/api/loja/checkout/status` | GET | `src/app/api/loja/checkout/status/route.ts` |
| `/api/loja/confirmacao/[id]` | GET | `src/app/api/loja/confirmacao/[id]/route.ts` |
| `/api/loja/courses` | GET | `src/app/api/loja/courses/route.ts` |
| `/api/loja/cupom/validar` | POST | `src/app/api/loja/cupom/validar/route.ts` |
| `/api/loja/cursos/[slug]` | GET | `src/app/api/loja/cursos/[slug]/route.ts` |
| `/api/loja/leads` | POST | `src/app/api/loja/leads/route.ts` |
| `/api/loja/track` | POST | `src/app/api/loja/track/route.ts` |
| `/api/metrics/public` | GET | `src/app/api/metrics/public/route.ts` |
| `/api/notifications` | GET | `src/app/api/notifications/route.ts` |
| `/api/notifications/[id]/read` | POST | `src/app/api/notifications/[id]/read/route.ts` |
| `/api/notifications/preferences` | GET PATCH | `src/app/api/notifications/preferences/route.ts` |
| `/api/notifications/read-all` | POST | `src/app/api/notifications/read-all/route.ts` |
| `/api/observability/client-log` | POST | `src/app/api/observability/client-log/route.ts` |
| `/api/painel/alunos` | GET | `src/app/api/painel/alunos/route.ts` |
| `/api/painel/alunos/[id]` | GET PATCH | `src/app/api/painel/alunos/[id]/route.ts` |
| `/api/painel/alunos/[id]/bloquear` | POST | `src/app/api/painel/alunos/[id]/bloquear/route.ts` |
| `/api/painel/alunos/[id]/desbloquear` | POST | `src/app/api/painel/alunos/[id]/desbloquear/route.ts` |
| `/api/painel/alunos/[id]/impersonate` | POST | `src/app/api/painel/alunos/[id]/impersonate/route.ts` |
| `/api/painel/alunos/[id]/mensagem` | POST | `src/app/api/painel/alunos/[id]/mensagem/route.ts` |
| `/api/painel/alunos/[id]/notes` | GET POST DELETE | `src/app/api/painel/alunos/[id]/notes/route.ts` |
| `/api/painel/alunos/[id]/notify` | POST | `src/app/api/painel/alunos/[id]/notify/route.ts` |
| `/api/painel/alunos/[id]/plataforma-senha` | POST | `src/app/api/painel/alunos/[id]/plataforma-senha/route.ts` |
| `/api/painel/alunos/[id]/reenviar-email` | POST | `src/app/api/painel/alunos/[id]/reenviar-email/route.ts` |
| `/api/painel/alunos/[id]/reset-password` | POST | `src/app/api/painel/alunos/[id]/reset-password/route.ts` |
| `/api/painel/atendimento/[id]` | PATCH | `src/app/api/painel/atendimento/[id]/route.ts` |
| `/api/painel/automacao/config` | GET PUT | `src/app/api/painel/automacao/config/route.ts` |
| `/api/painel/automacao/templates` | GET PUT | `src/app/api/painel/automacao/templates/route.ts` |
| `/api/painel/automacao/whatsapp/connect` | POST | `src/app/api/painel/automacao/whatsapp/connect/route.ts` |
| `/api/painel/automacao/whatsapp/disconnect` | POST | `src/app/api/painel/automacao/whatsapp/disconnect/route.ts` |
| `/api/painel/automacao/whatsapp/pair` | POST | `src/app/api/painel/automacao/whatsapp/pair/route.ts` |
| `/api/painel/automacao/whatsapp/status` | GET | `src/app/api/painel/automacao/whatsapp/status/route.ts` |
| `/api/painel/banner` | GET POST | `src/app/api/painel/banner/route.ts` |
| `/api/painel/banner/[id]` | PATCH DELETE | `src/app/api/painel/banner/[id]/route.ts` |
| `/api/painel/banner/upload` | POST | `src/app/api/painel/banner/upload/route.ts` |
| `/api/painel/certificate-template` | GET PUT | `src/app/api/painel/certificate-template/route.ts` |
| `/api/painel/certificate-template/preview` | GET | `src/app/api/painel/certificate-template/preview/route.ts` |
| `/api/painel/certificate-template/upload` | GET POST DELETE | `src/app/api/painel/certificate-template/upload/route.ts` |
| `/api/painel/certificates` | GET | `src/app/api/painel/certificates/route.ts` |
| `/api/painel/certificates/[id]/download` | GET | `src/app/api/painel/certificates/[id]/download/route.ts` |
| `/api/painel/certificates/[id]/regenerate` | POST | `src/app/api/painel/certificates/[id]/regenerate/route.ts` |
| `/api/painel/certificates/[id]/revoke` | POST | `src/app/api/painel/certificates/[id]/revoke/route.ts` |
| `/api/painel/certificates/enrollments` | GET | `src/app/api/painel/certificates/enrollments/route.ts` |
| `/api/painel/certificates/issue` | POST | `src/app/api/painel/certificates/issue/route.ts` |
| `/api/painel/comunicacao/alunos` | GET | `src/app/api/painel/comunicacao/alunos/route.ts` |
| `/api/painel/comunicacao/auto-config` | GET PATCH | `src/app/api/painel/comunicacao/auto-config/route.ts` |
| `/api/painel/comunicacao/broadcast` | POST | `src/app/api/painel/comunicacao/broadcast/route.ts` |
| `/api/painel/config` | GET PUT | `src/app/api/painel/config/route.ts` |
| `/api/painel/config/billing-mode` | PATCH | `src/app/api/painel/config/billing-mode/route.ts` |
| `/api/painel/config/connect-asaas` | POST DELETE | `src/app/api/painel/config/connect-asaas/route.ts` |
| `/api/painel/config/connect-mp` | POST DELETE | `src/app/api/painel/config/connect-mp/route.ts` |
| `/api/painel/config/excluir-conta` | POST | `src/app/api/painel/config/excluir-conta/route.ts` |
| `/api/painel/config/mensalidade` | PATCH | `src/app/api/painel/config/mensalidade/route.ts` |
| `/api/painel/config/parcelamento` | PATCH | `src/app/api/painel/config/parcelamento/route.ts` |
| `/api/painel/config/password` | PUT | `src/app/api/painel/config/password/route.ts` |
| `/api/painel/config/pix` | GET PATCH | `src/app/api/painel/config/pix/route.ts` |
| `/api/painel/config/sales-gateway` | PATCH | `src/app/api/painel/config/sales-gateway/route.ts` |
| `/api/painel/cupons` | GET POST | `src/app/api/painel/cupons/route.ts` |
| `/api/painel/cupons/[id]/toggle` | PATCH | `src/app/api/painel/cupons/[id]/toggle/route.ts` |
| `/api/painel/cupons/[id]/usage` | GET | `src/app/api/painel/cupons/[id]/usage/route.ts` |
| `/api/painel/cupons/generate-code` | POST | `src/app/api/painel/cupons/generate-code/route.ts` |
| `/api/painel/cursos` | GET | `src/app/api/painel/cursos/route.ts` |
| `/api/painel/cursos/[id]` | GET PUT DELETE | `src/app/api/painel/cursos/[id]/route.ts` |
| `/api/painel/cursos/[id]/capa` | POST DELETE | `src/app/api/painel/cursos/[id]/capa/route.ts` |
| `/api/painel/cursos/[id]/visibility` | PATCH | `src/app/api/painel/cursos/[id]/visibility/route.ts` |
| `/api/painel/cursos/bulk` | GET PUT | `src/app/api/painel/cursos/bulk/route.ts` |
| `/api/painel/dashboard` | GET | `src/app/api/painel/dashboard/route.ts` |
| `/api/painel/dominio` | GET POST DELETE | `src/app/api/painel/dominio/route.ts` |
| `/api/painel/dominio/verify` | POST | `src/app/api/painel/dominio/verify/route.ts` |
| `/api/painel/equipe` | GET POST | `src/app/api/painel/equipe/route.ts` |
| `/api/painel/equipe/[id]` | PATCH DELETE | `src/app/api/painel/equipe/[id]/route.ts` |
| `/api/painel/equipe/[id]/resend-invite` | POST | `src/app/api/painel/equipe/[id]/resend-invite/route.ts` |
| `/api/painel/financeiro` | GET | `src/app/api/painel/financeiro/route.ts` |
| `/api/painel/financeiro/export-csv` | GET | `src/app/api/painel/financeiro/export-csv/route.ts` |
| `/api/painel/home-sections` | GET POST | `src/app/api/painel/home-sections/route.ts` |
| `/api/painel/home-sections/[id]` | PATCH DELETE | `src/app/api/painel/home-sections/[id]/route.ts` |
| `/api/painel/home-sections/options` | GET | `src/app/api/painel/home-sections/options/route.ts` |
| `/api/painel/home-sections/reorder` | PATCH | `src/app/api/painel/home-sections/reorder/route.ts` |
| `/api/painel/indicacoes/demonstrativo` | GET | `src/app/api/painel/indicacoes/demonstrativo/route.ts` |
| `/api/painel/indicacoes/proof/[payoutId]` | GET | `src/app/api/painel/indicacoes/proof/[payoutId]/route.ts` |
| `/api/painel/leads` | GET | `src/app/api/painel/leads/route.ts` |
| `/api/painel/leads/[id]` | GET PATCH DELETE | `src/app/api/painel/leads/[id]/route.ts` |
| `/api/painel/leads/[id]/activities` | POST | `src/app/api/painel/leads/[id]/activities/route.ts` |
| `/api/painel/leads/[id]/stage` | PATCH | `src/app/api/painel/leads/[id]/stage/route.ts` |
| `/api/painel/leads/[id]/whatsapp` | POST | `src/app/api/painel/leads/[id]/whatsapp/route.ts` |
| `/api/painel/leads/distribuicao` | GET PUT | `src/app/api/painel/leads/distribuicao/route.ts` |
| `/api/painel/onboarding` | POST | `src/app/api/painel/onboarding/route.ts` |
| `/api/painel/onboarding-tour` | POST | `src/app/api/painel/onboarding-tour/route.ts` |
| `/api/painel/pacotes` | GET POST | `src/app/api/painel/pacotes/route.ts` |
| `/api/painel/pacotes/[id]` | GET PUT DELETE | `src/app/api/painel/pacotes/[id]/route.ts` |
| `/api/painel/pacotes/capa` | POST | `src/app/api/painel/pacotes/capa/route.ts` |
| `/api/painel/pacotes/courses-lookup` | GET | `src/app/api/painel/pacotes/courses-lookup/route.ts` |
| `/api/painel/pacotes/pmb/[packageId]` | PATCH | `src/app/api/painel/pacotes/pmb/[packageId]/route.ts` |
| `/api/painel/placar/stream` | GET | `src/app/api/painel/placar/stream/route.ts` |
| `/api/painel/referrals/request-payout` | POST | `src/app/api/painel/referrals/request-payout/route.ts` |
| `/api/painel/relatorios/bi/[tab]` | GET | `src/app/api/painel/relatorios/bi/[tab]/route.ts` |
| `/api/painel/relatorios/export` | GET | `src/app/api/painel/relatorios/export/route.ts` |
| `/api/painel/relatorios/export/[report]` | GET | `src/app/api/painel/relatorios/export/[report]/route.ts` |
| `/api/painel/revendas` | POST | `src/app/api/painel/revendas/route.ts` |
| `/api/painel/revendas/leads/[id]` | PATCH | `src/app/api/painel/revendas/leads/[id]/route.ts` |
| `/api/painel/tracking` | GET PUT | `src/app/api/painel/tracking/route.ts` |
| `/api/painel/treinamentos/progress` | POST | `src/app/api/painel/treinamentos/progress/route.ts` |
| `/api/painel/vendas` | GET POST | `src/app/api/painel/vendas/route.ts` |
| `/api/painel/vitrine` | GET PUT | `src/app/api/painel/vitrine/route.ts` |
| `/api/painel/vitrine/upload` | POST DELETE | `src/app/api/painel/vitrine/upload/route.ts` |
| `/api/placar/stream` | GET | `src/app/api/placar/stream/route.ts` |
| `/api/pmb/leads` | POST | `src/app/api/pmb/leads/route.ts` |
| `/api/public/capture-ref` | POST | `src/app/api/public/capture-ref/route.ts` |
| `/api/public/validate-ref` | GET | `src/app/api/public/validate-ref/route.ts` |
| `/api/push/devices` | GET | `src/app/api/push/devices/route.ts` |
| `/api/push/devices/[id]` | DELETE | `src/app/api/push/devices/[id]/route.ts` |
| `/api/push/public-key` | GET | `src/app/api/push/public-key/route.ts` |
| `/api/push/subscribe` | POST DELETE | `src/app/api/push/subscribe/route.ts` |
| `/api/revendedores/cadastro` | POST | `src/app/api/revendedores/cadastro/route.ts` |
| `/api/student/certificates/[id]/download` | GET | `src/app/api/student/certificates/[id]/download/route.ts` |
| `/api/student/certificates/issue` | POST | `src/app/api/student/certificates/issue/route.ts` |
| `/api/tours/dismiss` | POST | `src/app/api/tours/dismiss/route.ts` |
| `/api/vitrine/manifest` | GET | `src/app/api/vitrine/manifest/route.ts` |
| `/api/webhooks/asaas` | POST | `src/app/api/webhooks/asaas/route.ts` |
| `/api/webhooks/lms` | POST | `src/app/api/webhooks/lms/route.ts` |
| `/api/webhooks/mercadopago` | POST | `src/app/api/webhooks/mercadopago/route.ts` |
| `/llms.txt` | GET | `src/app/llms.txt/route.ts` |

### Crons (17)

- `/api/cron/cleanup-webhook-logs` (GET POST)
- `/api/cron/fix-gateway-collapse` (GET POST)
- `/api/cron/reactivate-paid` (GET POST)
- `/api/cron/reconcile-tenant-payments` (GET POST)
- `/api/cron/referral-monthly-payout` (GET POST)
- `/api/cron/resync-lms-credentials` (GET POST)
- `/api/cron/resync-platform-passwords` (GET POST)
- `/api/cron/sweep-abandoned-leads` (GET POST)
- `/api/cron/sweep-students-expired` (GET POST)
- `/api/cron/sweep-students-overdue` (GET POST)
- `/api/cron/sweep-tenants-overdue` (GET POST)
- `/api/cron/sweep-visitor-events` (GET POST)
- `/api/cron/sync-cursos` (GET POST)
- `/api/cron/sync-cursos-lms` (GET POST)
- `/api/cron/sync-day-update-lms` (GET POST)
- `/api/cron/sync-lms-branding` (GET POST)
- `/api/cron/sync-progresso` (GET POST)

### Webhooks (3)

- `/api/webhooks/asaas` (POST)
- `/api/webhooks/lms` (POST)
- `/api/webhooks/mercadopago` (POST)

## Funções e hooks (`src/lib` — 251 módulos, 720 exports)

| Módulo | Exports |
|---|---|
| `src/lib/admin/finance-format.ts` | `formatMoney`, `formatDate`, `formatDateTime`, `formatPct`, `notePreview` |
| `src/lib/after-response.ts` | `afterResponse` |
| `src/lib/api/response.ts` | `ok`, `fail`, `apiResponse` |
| `src/lib/asaas/client.ts` | `motherAsaasKey`, `createCustomer`, `getCustomer`, `listCustomers`, `findOrCreateAsaasCustomer`, `createSubscription`, `getSubscription`, `listSubscriptions`, `cancelSubscription`, `updateSubscription`, `createPayment`, `getPayment`, `deletePayment`, `refundPayment`, `updatePayment`, `getBillingInfo`, `getPixQrCode`, `payWithCreditCard`, `createInstallmentWithCreditCard`, `getInstallmentPayments`, `listPayments`, `decryptTenantAsaasKey`, `AsaasApiError (class)` |
| `src/lib/asaas/fulfillment.ts` | `fulfillFromAsaasPayment` |
| `src/lib/asaas/ownership.ts` | `isKnownAsaasPayment` |
| `src/lib/asaas/process.ts` | `processAsaasWebhook` |
| `src/lib/asaas/promo.ts` | `addMonths`, `createPromoBilling` |
| `src/lib/asaas/reconcile.ts` | `reconcileTenantPayments` |
| `src/lib/asaas/reseller-process.ts` | `processResellerAsaasWebhook` |
| `src/lib/asaas/transparent-process.ts` | `processTransparentAsaasPayment`, `asaasFormDataSchema` |
| `src/lib/asaas/types.ts` | — |
| `src/lib/asaas/webhook.ts` | `validateAsaasWebhook`, `parseAsaasWebhookPayload` |
| `src/lib/audit.ts` | `logAudit` |
| `src/lib/auth.ts` | — |
| `src/lib/auth/admin-session.ts` | `requireAdminSession` |
| `src/lib/auth/bearer.ts` | `safeEqual`, `isCronAuthorized`, `isInternalAuthorized` |
| `src/lib/auth/cookies.ts` | `SESSION_COOKIE_NAME`, `SESSION_MAX_AGE`, `sessionCookieOptions` |
| `src/lib/auth/credentials.ts` | `generateTempPassword`, `sendCredentialsEmail` |
| `src/lib/auth/guards.ts` | `requirePmbFinanceiro`, `requireSuperAdmin`, `requirePmbTeam`, `requirePmbSales`, `requirePmbResellerMgr`, `requireRevendaTeam`, `requirePmbSalesMgr`, `requireResellerOwner`, `requireResellerSeller`, `requireResellerMember` |
| `src/lib/auth/handoff.ts` | `tenantTargetOrigin`, `isSafeInternalPath`, `createHandoffToken`, `consumeHandoffToken`, `resolveResellerClaims`, `encodeSessionJwt` |
| `src/lib/auth/home-for-role.ts` | `homeForRole` |
| `src/lib/auth/impersonate.ts` | `sessionCookieName`, `cookieSecure`, `buildSessionToken`, `decodeSessionToken`, `encodeImpersonationFlag`, `decodeImpersonationFlag`, `IMPERSONATION_BACKUP_COOKIE`, `IMPERSONATION_FLAG_COOKIE` |
| `src/lib/auth/invite.ts` | `createInviteToken`, `buildInviteUrl`, `sendInvite` |
| `src/lib/auth/reseller-session.ts` | `requireResellerSession` |
| `src/lib/auth/reset-token.ts` | `generateResetToken`, `hashResetToken` |
| `src/lib/auth/roles.ts` | `canViewFinance`, `canViewFullFinance`, `canMarkPaid`, `canManageCommissions`, `FINANCE_VIEW_ROLES`, `FINANCE_FULL_ROLES`, `FINANCE_WRITE_ROLES`, `COMMISSION_MANAGE_ROLES` |
| `src/lib/auth/scope.ts` | `salesTeamIds`, `tenantScopeWhere`, `canAccessTenantScope`, `leadScopeWhere`, `canHandleRevendaLeads`, `canConvertRevendaLeads` |
| `src/lib/auth/sign-out.ts` | `signOutToLogin` |
| `src/lib/auth/start-impersonation.ts` | `startImpersonation` |
| `src/lib/auth/student-session.ts` | `requireStudentSession` |
| `src/lib/auto-block.ts` | `blockTenantStudents`, `unblockTenantStudents` |
| `src/lib/automation/assign.ts` | `listLeadAssignees`, `pickNextLeadOwner`, `listRevendaLeadAssignees`, `pickNextRevendaLeadOwner` |
| `src/lib/automation/context.ts` | `getTenantAutomationContext`, `getPmbAutomationContext`, `isPmbAutomationEnabled`, `resolveAutomationContext`, `isTenantAutomationEnabled` |
| `src/lib/automation/default-templates.ts` | `DEFAULT_AUTOMATION_TEMPLATES` |
| `src/lib/automation/dispatch.ts` | `queueLeadMessage`, `sendLeadMessage`, `sendManualWhatsAppToLead` |
| `src/lib/automation/leads.ts` | `upsertLeadFromCheckout`, `markLeadAsWon`, `sweepAbandonedLeadsForContext`, `sweepAbandonedLeadsForTenant`, `reconcileLeadStages`, `getLeadCourseTimeline` |
| `src/lib/automation/templates.ts` | `renderTemplate` |
| `src/lib/automation/tracking.ts` | `generateVisitorId`, `readVisitorId`, `visitorCookie`, `recordVisitorEvent`, `linkVisitorToLead`, `getLeadNavigationTimeline`, `VISITOR_COOKIE` |
| `src/lib/automation/wa-client.ts` | `startSession`, `getSessionStatus`, `stopSession`, `logoutSession`, `deleteSession`, `disconnectSession`, `sendTextMessage`, `requestPairingCode`, `WhatsAppNumberNotFoundError (class)` |
| `src/lib/branding.ts` | `getSupportContacts`, `buildTenantSupportContacts`, `getSocialLinks`, `normalizeSocialUrl` |
| `src/lib/catalog/eja-redirect.ts` | `ejaRedirectHref`, `isAllowedEjaUrl` |
| `src/lib/catalog/eja.ts` | `loadEjaSectionContent`, `loadPmbEjaConfig`, `EJA_DEFAULT_LABEL` |
| `src/lib/catalog/home.ts` | `loadCurated`, `loadByCategoria`, `slugifyCategoria`, `loadCategorias`, `loadCatalogo`, `loadShowcase` |
| `src/lib/catalog/sync-all.ts` | `syncAllCatalogs` |
| `src/lib/catalog/sync-lms.ts` | `mapCurriculumToMatriz`, `syncCatalogFromLMS` |
| `src/lib/catalog/sync-log.ts` | `pushSyncLog`, `listSyncLogs`, `getLastSuccessfulSync` |
| `src/lib/catalog/sync.ts` | `extractCourseIdFromCapa`, `syncCatalogFromEA`, `ensureUniqueCourseSlug` |
| `src/lib/catalog/tecnica-redirect.ts` | `tecnicaRedirectHref`, `isAllowedTecnicaUrl` |
| `src/lib/catalog/tecnica.ts` | `parseTecnicaCourses`, `tecnicaFromTenant`, `loadPmbTecnicaCourses`, `loadTecnicaSectionContent`, `loadPmbTecnicaConfig`, `validateTecnicaCoursesInput`, `TECNICA_SECTION_COUNT` |
| `src/lib/catalog/visibility.ts` | `COURSE_HAS_PRICE` |
| `src/lib/certificates/admin-scope.ts` | `adminCanAccessCertTenant`, `certScopeDeniedResponse` |
| `src/lib/certificates/code.ts` | `generateCertificateCode` |
| `src/lib/certificates/eligibility.ts` | `isEnrollmentConcludedForCertificate`, `DEFAULT_CERTIFICATE_MIN_PERCENT` |
| `src/lib/certificates/freshness.ts` | `isCertificatePdfStale`, `ensureFreshCertificatePdf` |
| `src/lib/certificates/generate-pdf.ts` | `renderCertificateBuffer`, `generateAndUploadPdf` |
| `src/lib/certificates/index.ts` | — |
| `src/lib/certificates/issue.ts` | `issueCertificateIfEligible`, `issueCertificateManual`, `revokeCertificate` |
| `src/lib/certificates/placeholders.ts` | `applyPlaceholders`, `formatCompletionDate` |
| `src/lib/certificates/sample.ts` | `sampleCertificateFields` |
| `src/lib/certificates/storage.ts` | `uploadCertificatePdf`, `certificatePublicUrl`, `createSignedCertificateUrl`, `downloadCertificatePdf`, `extractCertificatePath`, `deleteCertificatePdf` |
| `src/lib/certificates/template-resolver.ts` | `resolveCertificateTemplate`, `readSnapshot`, `refreshGroupBranding`, `DEFAULT_TEMPLATE` |
| `src/lib/certificates/templates/classic.tsx` | `ClassicCertificate` |
| `src/lib/certificates/templates/index.ts` | `renderCertificateByLayout` |
| `src/lib/certificates/templates/info-page.tsx` | `resolveCompletionPercent`, `certificateInfoPage`, `LEGAL_BASIS_TITLE`, `LEGAL_BASIS_TEXT` |
| `src/lib/certificates/templates/minimal.tsx` | `MinimalCertificate` |
| `src/lib/certificates/templates/modern.tsx` | `ModernCertificate` |
| `src/lib/certificates/text.ts` | `upperCert`, `lowerCert` |
| `src/lib/certificates/urls.ts` | `validationUrlFor` |
| `src/lib/checkout/assert-tenant-gateway.ts` | `isPmbTenantSlug`, `assertPmbCharge`, `assertCouponMatchesEnrollment`, `TenantGatewayIsolationError (class)` |
| `src/lib/checkout/due-date.ts` | `dueDateInDays` |
| `src/lib/checkout/issue-pmb-asaas-charge.ts` | `issuePmbAsaasCharge` |
| `src/lib/checkout/price-guard.ts` | `isSellablePrice` |
| `src/lib/coupons/consume.ts` | `tryConsumeCoupon`, `releaseCoupon` |
| `src/lib/coupons/discount.ts` | `applyCouponDiscount` |
| `src/lib/coupons/preview.ts` | `previewCheckoutCoupon` |
| `src/lib/coupons/types.ts` | — |
| `src/lib/courses/bulk-edit.ts` | `formatPrice`, `parsePrice`, `draftFromRow`, `buildBulkItems` |
| `src/lib/crypto.ts` | `encrypt`, `decrypt` |
| `src/lib/csv.ts` | `arrayToCsv`, `csvFilename`, `csvResponseHeaders` |
| `src/lib/dates.ts` | `addMonthsClamped` |
| `src/lib/email/brand.ts` | `tenantEmailBrand`, `emailBrandFromTenantRow`, `emailFromForBrand`, `PMB_EMAIL_BRAND` |
| `src/lib/email/mailer.ts` | `renderTemplateHtml`, `isEmailConfigured`, `sendEmail`, `EmailError (class)` |
| `src/lib/email/resend.ts` | — |
| `src/lib/email/smtp.ts` | `getTransporter`, `getDefaultFrom`, `sendSmtp` |
| `src/lib/email/templates/_layout.tsx` | `EmailLayout`, `styles` |
| `src/lib/email/templates/access-expiring.tsx` | `AccessExpiringTemplate` |
| `src/lib/email/templates/account-credentials.tsx` | `AccountCredentialsTemplate` |
| `src/lib/email/templates/enrollment.tsx` | `EnrollmentTemplate` |
| `src/lib/email/templates/invite.tsx` | `InviteTemplate` |
| `src/lib/email/templates/lead-confirmation.tsx` | `LeadConfirmationTemplate` |
| `src/lib/email/templates/notification.tsx` | `NotificationTemplate` |
| `src/lib/email/templates/payment-pending.tsx` | `PaymentPendingTemplate` |
| `src/lib/email/templates/payment-rejected.tsx` | `PaymentRejectedTemplate` |
| `src/lib/email/templates/payment.tsx` | `PaymentTemplate` |
| `src/lib/email/templates/reseller-lead-notification.tsx` | `ResellerLeadNotificationTemplate` |
| `src/lib/email/templates/reseller-onboarding.tsx` | `ResellerOnboardingTemplate` |
| `src/lib/email/templates/reset-password.tsx` | `ResetPasswordTemplate` |
| `src/lib/email/templates/student-support.tsx` | `StudentSupportTemplate` |
| `src/lib/email/templates/student-welcome.tsx` | `StudentWelcomeTemplate` |
| `src/lib/email/tenant-brand.ts` | `loadTenantEmailBrand`, `loadTenantEmailBrandBySlug` |
| `src/lib/enrollment/fulfill.ts` | `fulfillEnrollment`, `fulfillScholarshipEnrollment`, `STUDENT_ACCESS_MONTHS` |
| `src/lib/env.ts` | `assertEnv`, `authSecret`, `env` |
| `src/lib/errors.ts` | `swallow` |
| `src/lib/home/api.ts` | `listSections`, `createSection`, `updateSection`, `deleteSection`, `reorderSections` |
| `src/lib/home/course-mapper.ts` | `normalizeCourseRow`, `toCourse`, `courseSelect` |
| `src/lib/home/options.ts` | `getHomeSectionsOptions` |
| `src/lib/home/sections.ts` | `isSectionKind`, `validateSectionPayload`, `loadHomeSections`, `parseBestsellersCookie`, `serializeBestsellersCookie`, `resolveSectionCourses`, `resolveCategoriesForSection`, `ensureTenantHomeSections`, `ensureTecnicaSection`, `ensurePackagesSection`, `reorderScopeToCanonical`, `ensureEjaSection`, `setEjaSectionEnabled`, `ensureIdiomasSection`, `BESTSELLERS_COUNT`, `CATEGORY_SECTION_MIN_COURSES`, `IDIOMAS_SECTION_COUNT`, `SECTION_KINDS`, `sectionKindSchema`, `createSectionSchema`, `updateSectionSchema`, `reorderSectionsSchema`, `BESTSELLERS_COOKIE` |
| `src/lib/home/trust-tokens.ts` | `substituteTrustTokens` |
| `src/lib/http/client-ip.ts` | `clientIp` |
| `src/lib/images.ts` | `shouldUnoptimizeImage` |
| `src/lib/lgpd/anonymize.ts` | `anonymizeResellerOwner` |
| `src/lib/lms/branding.ts` | `syncTenantBrandingToLms` |
| `src/lib/lms/client.ts` | `listLmsCourses`, `getLmsCourse`, `createLmsEnrollment`, `revokeLmsEnrollment`, `setLmsStudentAccess`, `getLmsStudent`, `createLmsSsoToken`, `putLmsTenantBranding`, `lmsDayUpdate` |
| `src/lib/lms/config.ts` | `getLmsConfig`, `isLmsConfigured` |
| `src/lib/lms/day-update.ts` | `syncLmsDayUpdate` |
| `src/lib/lms/errors.ts` | `LmsApiError (class)`, `LmsNetworkError (class)` |
| `src/lib/lms/index.ts` | — |
| `src/lib/lms/types.ts` | — |
| `src/lib/lms/urls.ts` | `lmsPublicBaseUrl`, `normalizeLmsPublicUrl`, `DEFAULT_LMS_PUBLIC_URL` |
| `src/lib/logger-client.ts` | `clientLogger` |
| `src/lib/logger.ts` | `contextLogger`, `logAndRethrow`, `REDACT_PATHS`, `logger` |
| `src/lib/mercadopago/browser-sdk.ts` | `getMpInstance` |
| `src/lib/mercadopago/client.ts` | `decryptTenantMpToken`, `getAccountInfo`, `createPreference`, `createPayment`, `getPayment`, `getCardInstallments`, `getPreapproval`, `createPreapproval`, `getAuthorizedPayment`, `searchPayments`, `cancelPreapproval`, `refundPayment`, `MPApiError (class)` |
| `src/lib/mercadopago/fulfillment.ts` | `fulfillFromMpPayment` |
| `src/lib/mercadopago/installments.ts` | `displayInterestFreeInstallments`, `interestFreeLabel`, `interestFreePhrase`, `buildInstallmentOptions`, `MAX_CARD_INSTALLMENTS` |
| `src/lib/mercadopago/process.ts` | `processMpWebhook`, `reconcilePendingEnrollment` |
| `src/lib/mercadopago/student-payment-emails.ts` | `notifyStudentPaymentPending`, `notifyStudentPaymentRejected` |
| `src/lib/mercadopago/transparent-process.ts` | `processTransparentMpPayment`, `transparentFormDataSchema` |
| `src/lib/mercadopago/types.ts` | — |
| `src/lib/mercadopago/utils.ts` | `parseMpNotification`, `isPaymentNotification`, `isPreapprovalNotification` |
| `src/lib/mercadopago/webhook.ts` | `validateMpWebhookSignature`, `extractPaymentIdFromNotification` |
| `src/lib/notifications.ts` | `createNotification`, `listForUser`, `countUnreadForUser`, `countUnreadForStudent`, `listForStudent`, `markAsRead`, `markAllAsRead` |
| `src/lib/notifications/push-client.ts` | `isPushSupported`, `getPushPermissionState`, `subscribeToPush`, `unsubscribeFromPush` |
| `src/lib/notifications/push-server.ts` | `isPushConfigured`, `getVapidPublicKey`, `sendPushToTarget`, `sendPushToAnonymous`, `sendPushToUsers` |
| `src/lib/notifications/sound.ts` | `isNotificationSoundEnabled`, `setNotificationSoundEnabled`, `unlockNotificationSound`, `playNotificationSound` |
| `src/lib/observability/log-transport.ts` | `createHttpLogStream` |
| `src/lib/observability/request-context.ts` | `POST`, `runWithRequestContext`, `getRequestContext`, `extendRequestContext` |
| `src/lib/observability/with-request-context.ts` | `withRequestContext`, `withRequestContextParams`, `POST`, `GET` |
| `src/lib/packages/cover-upload.ts` | `handlePackageCoverUpload` |
| `src/lib/packages/slug.ts` | `ensureUniquePackageSlug` |
| `src/lib/packages/vitrine.ts` | `resolveVitrinePackages`, `getVitrinePackageBySlug`, `getPackageForCheckout` |
| `src/lib/placar/snapshot.ts` | `getActiveTenants`, `getPlacarSnapshot`, `getReferralActiveTenants`, `getReferralPlacarSnapshot`, `PLACAR_META` |
| `src/lib/plataforma-cursos/client.ts` | `listarCursos`, `listarAulas`, `criarFuncionario`, `criarAluno`, `editarAluno`, `buscarAluno`, `vincularCurso`, `removerCurso`, `cursosVinculados`, `enviarEmailCredenciais`, `enviarMensagem`, `notasPresenciais`, `horarios`, `vincularTurma`, `removerTurma`, `listarTurmasAluno`, `aniversariantes`, `melhoresAlunos`, `contratosAluno`, `parcelasAluno`, `recebimentos` |
| `src/lib/plataforma-cursos/errors.ts` | `EAApiError (class)`, `EANetworkError (class)` |
| `src/lib/plataforma-cursos/types.ts` | — |
| `src/lib/pmb-config.ts` | `pmbMpAccessToken`, `pmbMpPublicKey`, `pmbPlataformaVendedorId`, `pmbPlataformaPolo`, `PMB_TENANT_SLUG`, `PMB_TENANT_NAME`, `PMB_PUBLIC_NAME` |
| `src/lib/pmb-tenant.ts` | `getOrCreatePmbTenant` |
| `src/lib/prisma.ts` | `prisma` |
| `src/lib/ratelimit.ts` | `rateLimit`, `rateLimitByKey`, `rateLimitResponse`, `RATE_LIMITS` |
| `src/lib/redis.ts` | `redis` |
| `src/lib/redis/cache.ts` | `set`, `get`, `invalidate`, `invalidateMany`, `getJson`, `setJson` |
| `src/lib/redis/errors.ts` | `RedisError (class)` |
| `src/lib/redis/keys.ts` | `tenantBySlugKey`, `tenantByDomainKey`, `tenantByIdKey`, `tenantRedirectKey`, `TENANT_CACHE_TTL_SECONDS`, `TENANT_REDIRECT_TTL_SECONDS` |
| `src/lib/redis/tenant-cache.ts` | `getTenantBySlug`, `getTenantByDomain`, `setTenant`, `invalidateTenant`, `setSlugRedirect`, `invalidateSlugRedirect` |
| `src/lib/referrals/capture.ts` | `validateReferralCode`, `resolveReferrerFromCookie`, `REFERRAL_COOKIE`, `REFERRAL_COOKIE_MAX_AGE_SECONDS` |
| `src/lib/referrals/clawback.ts` | `isClawbackMarked`, `hasClawbackBlock`, `CLAWBACK_MARKER_PREFIX` |
| `src/lib/referrals/code.ts` | `generateUniqueReferralCode`, `ensureReferralCode` |
| `src/lib/referrals/commission.ts` | `computeAvailableAt`, `backfillReferrerCommissions`, `createCommissionForTenantPayment`, `cancelCommissionForTenantPayment`, `freezeCommissionForPartialRefund`, `summaryForTenant` |
| `src/lib/referrals/demonstrativo-template.tsx` | `DemonstrativoDocument` |
| `src/lib/referrals/demonstrativo.ts` | `generateDemonstrativoPdf` |
| `src/lib/referrals/index.ts` | — |
| `src/lib/referrals/monthly.ts` | `previousPeriod`, `recentClosedPeriods`, `computeMonthlyCommissions`, `flagMonthlyCommissionForRefund` |
| `src/lib/referrals/payout.ts` | `requestPayout`, `markPayoutPaid`, `failPayout`, `processMonthlyPayouts`, `ReferralPayoutError (class)` |
| `src/lib/referrals/rules.ts` | `parseBrackets`, `sortBrackets`, `resolveCommissionRule`, `parsePlan`, `monthsInProgram`, `resolvePhase`, `resolveEffectivePhases`, `resolveBracket` |
| `src/lib/referrals/tiers.ts` | `parseReferralTiers`, `sortTiers`, `monthsSinceActivation`, `resolveTierPercent` |
| `src/lib/reports/aggregations.ts` | `approvedRevenueByBucket`, `enrollmentCountByBucket`, `studentCountByBucket`, `approvedRevenueTotal` |
| `src/lib/reports/bi/alunos-matriculas.ts` | `alunosMatriculasModule` |
| `src/lib/reports/bi/context.ts` | — |
| `src/lib/reports/bi/cursos-cupons.ts` | `cursosCuponsModule` |
| `src/lib/reports/bi/financeiro.ts` | `financeiroModule` |
| `src/lib/reports/bi/index.ts` | `getBiModule`, `biModules` |
| `src/lib/reports/bi/indicacoes-comissoes.ts` | `indicacoesComissoesModule` |
| `src/lib/reports/bi/leads-conversao.ts` | `leadsConversaoModule` |
| `src/lib/reports/bi/receita-vendas.ts` | `receitaVendasModule` |
| `src/lib/reports/bi/rede-revendedores.ts` | `redeRevendedoresModule` |
| `src/lib/reports/bi/visao-geral.ts` | `visaoGeralModule` |
| `src/lib/reports/bucket.ts` | `bucketKey`, `bucketLabel`, `fillBuckets`, `toSeriesPoints` |
| `src/lib/reports/csv.ts` | `escapeCsv`, `buildCsv`, `csvResponse`, `brl`, `isoDate`, `isoDateTime` |
| `src/lib/reports/definitions.ts` | `getReportRunner`, `REPORT_DEFS` |
| `src/lib/reports/format.ts` | `formatShortCurrency`, `formatCompactNumber`, `formatNumber`, `formatPercent`, `formatDelta`, `formatByFormat` |
| `src/lib/reports/painel-definitions.ts` | `getPainelReportRunner`, `painelReportDef`, `PAINEL_REPORT_DEFS` |
| `src/lib/reports/painel/alunos.ts` | `alunosModule` |
| `src/lib/reports/painel/context.ts` | — |
| `src/lib/reports/painel/cursos-cupons.ts` | `cursosCuponsModule` |
| `src/lib/reports/painel/financeiro.ts` | `financeiroModule` |
| `src/lib/reports/painel/index.ts` | `getPainelBiModule`, `painelBiModules` |
| `src/lib/reports/painel/indicacoes.ts` | `indicacoesModule` |
| `src/lib/reports/painel/receita.ts` | `receitaModule` |
| `src/lib/reports/painel/tabs.ts` | `painelTab`, `allowedPainelTabs`, `canViewPainelTab`, `PAINEL_TABS`, `DEFAULT_PAINEL_TAB` |
| `src/lib/reports/painel/visao-geral.ts` | `visaoGeralModule` |
| `src/lib/reports/payload.ts` | `buildPayload` |
| `src/lib/reports/period.ts` | `isPeriodPreset`, `resolvePeriod`, `pctChange` |
| `src/lib/reports/tabs.ts` | `reportTab`, `allowedTabs`, `canViewTab`, `defaultTab`, `REPORT_TABS` |
| `src/lib/reports/types.ts` | — |
| `src/lib/resellers/create.ts` | `createReseller` |
| `src/lib/resellers/plans.ts` | `planEnablesAutomation`, `isAllowedResellerPlan`, `RESELLER_PLANS`, `RESELLER_PLAN_VALUES` |
| `src/lib/revendedor/plano.ts` | `PLANO_GROWTH_VALOR`, `PLANO_GROWTH_NOME`, `PLANO_GROWTH_DESCRICAO` |
| `src/lib/schemas/revendedor-cadastro.ts` | `stripDigits`, `pessoalSchema`, `empresaSchema`, `pagamentoSchema`, `cadastroRevendedorSchema` |
| `src/lib/seo/host.ts` | `getRequestOrigin`, `classifyRequestHost` |
| `src/lib/seo/jsonld.ts` | `organizationJsonLd`, `webSiteJsonLd`, `storeJsonLd`, `courseJsonLd`, `breadcrumbJsonLd`, `faqJsonLd` |
| `src/lib/seo/site.ts` | `siteUrl`, `siteOgImage`, `siteLogo`, `SITE_NAME`, `SITE_SHORT_NAME`, `SITE_DESCRIPTION`, `SITE_KEYWORDS`, `GEO`, `SOCIAL_PROFILES` |
| `src/lib/seo/tenant-metadata.ts` | `tenantVitrineMetadata`, `tenantVitrineViewport` |
| `src/lib/storage/image-dims.ts` | `readImageDimensions`, `checkBannerDimensions`, `checkPackageCoverDimensions`, `BANNER_SPEC`, `PACKAGE_COVER_SPEC` |
| `src/lib/storage/payout-proof.ts` | `uploadPayoutProof`, `downloadPayoutProof`, `deletePayoutProof` |
| `src/lib/storage/validate-image.ts` | `isValidImageMagic` |
| `src/lib/students/access.ts` | `provisionStudentAccess` |
| `src/lib/students/checkout-link.ts` | `buildEnrollmentCheckoutUrl` |
| `src/lib/students/cpf-already-registered.ts` | `cpfHasRegisteredLogin` |
| `src/lib/students/display-status.ts` | `isPaidEnrollment`, `deriveStudentDisplayStatus`, `countEnrollmentStatuses` |
| `src/lib/students/generate-password.ts` | `generateTemporaryPassword`, `generatePasswordWithHash` |
| `src/lib/students/lms-credentials.ts` | `getLmsEnrollmentCredentials` |
| `src/lib/students/load-detail.ts` | `loadStudentDetail` |
| `src/lib/students/management.ts` | `applyStudentEdit`, `notifyStudent`, `resetStudentPassword`, `editSchema`, `noteSchema`, `notifySchema` |
| `src/lib/students/plataforma-actions.ts` | `resolveAuthoritativePlatformPassword`, `ensureStudentOnPlatform`, `changeStudentPlatformPassword`, `resendStudentPlatformCredentials`, `linkCourseToStudent`, `ensureStudentActiveOnPlatform`, `unlinkCourseFromStudent`, `blockStudentInEA`, `syncStudentProfileToEA`, `unblockStudentInEA` |
| `src/lib/students/platform-credentials.ts` | `getStudentPlatformLoginUrl`, `getStudentPlatformCredentials` |
| `src/lib/students/progress.ts` | `syncStudentProgress` |
| `src/lib/students/reactivation-guard.ts` | `canReactivateUnderTenant` |
| `src/lib/students/upsert.ts` | `upsertStudent`, `StudentEmailConflictError (class)` |
| `src/lib/suggest-password.ts` | `suggestPassword` |
| `src/lib/supabase/storage.ts` | `uploadVitrineAsset`, `publicUrlFor`, `deleteVitrineAsset`, `extractAssetPath` |
| `src/lib/support/student-support.ts` | `createStudentSupportTicket`, `SUPPORT_STUDENT_SELECT` |
| `src/lib/system-settings.ts` | `invalidateSystemSettingsCache`, `getSystemSettings`, `updatePmbDirectSaleGateway`, `updatePmbMpAccessToken`, `updatePmbInterestFreeInstallments`, `getPmbMpAccessTokenAsync` |
| `src/lib/tenant/cache-invalidation.ts` | `invalidateTenantCache` |
| `src/lib/tenant/checkout-mode.ts` | `tenantCheckoutMode`, `canResellerCheckout` |
| `src/lib/tenant/courses.ts` | `listTenantCourses`, `listTenantCatalog`, `getTenantCourseBySlug`, `listTenantCategories` |
| `src/lib/tenant/current.ts` | `requireCurrentTenant`, `getCurrentTenant` |
| `src/lib/tenant/ensure-courses.ts` | `ensureTenantCourses`, `ensureCourseForResellers` |
| `src/lib/tenant/forbidden-names.ts` | `normalizeForMatch`, `containsForbiddenName`, `forbiddenNameError`, `FORBIDDEN_NAME_MESSAGE` |
| `src/lib/tenant/from-request.ts` | `resolveTenantFromRequest` |
| `src/lib/tenant/monthly-policy.ts` | `monthlyActive`, `monthlyAllowedOn`, `effectivePaymentType` |
| `src/lib/tenant/slug.ts` | `validateSlugFormat`, `isSlugAvailable`, `tenantPolo`, `SLUG_REGEX`, `RESERVED_SLUGS`, `SLUG_REDIRECT_DAYS` |
| `src/lib/tenant/urls.ts` | `appDomain`, `vitrineDomain`, `appUrl`, `isPmbAppHost`, `vitrineHost`, `vitrineUrl`, `cnameTarget`, `vercelApexIp`, `apexDomain`, `wwwDomain`, `customDomainVariants`, `activeCustomDomain`, `webhookBaseUrl`, `mpWebhookUrl`, `asaasWebhookUrl` |
| `src/lib/tenant/vitrine-paths.ts` | `isVitrinePath`, `VITRINE_PATH_PREFIXES` |
| `src/lib/tours/aluno.ts` | `ALUNO_TOURS` |
| `src/lib/tours/painel.ts` | `PAINEL_TOURS` |
| `src/lib/tours/registry.ts` | `findTour`, `ALL_TOURS` |
| `src/lib/tours/types.ts` | `exact`, `prefix` |
| `src/lib/tracking/resolve.ts` | `mergePixels`, `resolveVitrinePixels`, `resolvePmbSelfPixels` |
| `src/lib/tracking/schema.ts` | `parseTrackingPixels`, `parseTrackingPixelsInput`, `isTrackingEmpty`, `trackingPixelsSchema`, `TRACKING_PROVIDERS` |
| `src/lib/tracking/snippets.ts` | `baseScripts`, `buildPurchaseInlineScript` |
| `src/lib/tracking/store.ts` | `readTenantPixels`, `writeTenantPixels`, `readPmbPixels`, `writePmbPixels` |
| `src/lib/training/youtube.ts` | `extractYoutubeId`, `youtubeEmbedUrl`, `youtubeThumbUrl`, `youtubeWatchUrl` |
| `src/lib/utils.ts` | `cn`, `parseBRPrice`, `formatCurrency`, `slugify` |
| `src/lib/validation/cpf.ts` | `stripCpf`, `isValidCpf` |
| `src/lib/validation/phone.ts` | `normalizePhone`, `isValidPhone` |
| `src/lib/vercel/client.ts` | `isVercelConfigured`, `addProjectDomain`, `removeProjectDomain`, `getProjectDomain`, `verifyProjectDomain`, `getDomainConfig`, `VercelNotConfiguredError (class)` |
| `src/lib/vercel/domain-status.ts` | `resolveCustomDomainStatus` |
| `src/lib/webhooks/lms-process.ts` | `isLmsWebhookEvent`, `processLmsWebhookEvent`, `LMS_WEBHOOK_EVENTS` |
| `src/lib/webhooks/lms-webhook.ts` | `validateLmsWebhookSignature`, `lmsDedupKey` |
| `src/lib/webhooks/transient.ts` | `isTransientWebhookError` |

### Hooks exportados (3)

| Hook | Arquivo |
|---|---|
| `useHomeSections` | `src/components/vitrine/use-home-sections.ts` |
| `useReportQueryState` | `src/components/reports/use-report-query-state.ts` |
| `useSidebarCollapsed` | `src/components/shared/layouts/use-sidebar-collapsed.ts` |

## Componentes (342)

### admin (95)

- `src/components/admin/admin-alerts-panel.tsx`
- `src/components/admin/admin-automation-settings-form.tsx`
- `src/components/admin/admin-broadcast-form.tsx`
- `src/components/admin/admin-catalog-client.tsx`
- `src/components/admin/admin-catalog-tabs.tsx`
- `src/components/admin/admin-certificate-settings-form.tsx`
- `src/components/admin/admin-config-client.tsx`
- `src/components/admin/admin-config-tabs.tsx`
- `src/components/admin/admin-dashboard-client.tsx`
- `src/components/admin/admin-dual-revenue-chart.tsx`
- `src/components/admin/admin-finance-client.tsx`
- `src/components/admin/admin-finance-summary.tsx`
- `src/components/admin/admin-metric-cards.tsx`
- `src/components/admin/admin-overdue-section.tsx`
- `src/components/admin/admin-packages-client.tsx`
- `src/components/admin/admin-payment-list.tsx`
- `src/components/admin/admin-payout-row-actions.tsx`
- `src/components/admin/admin-quick-stats-bar.tsx`
- `src/components/admin/admin-referral-settings-form.tsx`
- `src/components/admin/admin-relatorios-client.tsx`
- `src/components/admin/admin-tecnica-settings-form.tsx`
- `src/components/admin/admin-top-resellers-table.tsx`
- `src/components/admin/admin-tracking-settings-form.tsx`
- `src/components/admin/api-docs-tab.tsx`
- `src/components/admin/auto-config-panel.tsx`
- `src/components/admin/catalog-course-grid.tsx`
- `src/components/admin/catalog-edit-drawer.tsx`
- `src/components/admin/catalog-header.tsx`
- `src/components/admin/catalog-sync-button.tsx`
- `src/components/admin/catalog-sync-log.tsx`
- `src/components/admin/category-manager-dialog.tsx`
- `src/components/admin/clawback-resolver.tsx`
- `src/components/admin/commission-plan-editor.tsx`
- `src/components/admin/comunicacao-admin-client.tsx`
- `src/components/admin/equipe-client.tsx`
- `src/components/admin/equipe-detail-client.tsx`
- `src/components/admin/equipe-impersonate-button.tsx`
- `src/components/admin/finance-status.tsx`
- `src/components/admin/financeiro-mark-paid-dialog.tsx`
- `src/components/admin/financeiro-notes-dialog.tsx`
- `src/components/admin/financeiro-referral-payouts.tsx`
- `src/components/admin/financeiro-tabs.tsx`
- `src/components/admin/financeiro-tenant-payments.tsx`
- `src/components/admin/global-students-client.tsx`
- `src/components/admin/impersonation-banner.tsx`
- `src/components/admin/integration-test-cards.tsx`
- `src/components/admin/lead-revenda-distribution-toggle.tsx`
- `src/components/admin/leads-revenda-kanban.tsx`
- `src/components/admin/leads-revenda-list.tsx`
- `src/components/admin/new-reseller-dialog.tsx`
- `src/components/admin/nova-venda-client.tsx`
- `src/components/admin/pmb-mp-token-config.tsx`
- `src/components/admin/profile-account-form.tsx`
- `src/components/admin/profile-security-form.tsx`
- `src/components/admin/profile-tabs.tsx`
- `src/components/admin/provider-bulk-actions.tsx`
- `src/components/admin/regenerate-all-certificates.tsx`
- `src/components/admin/report-viewer.tsx`
- `src/components/admin/reports-client.tsx`
- `src/components/admin/reseller-action-buttons.tsx`
- `src/components/admin/reseller-asaas-gateway-config.tsx`
- `src/components/admin/reseller-automation-config.tsx`
- `src/components/admin/reseller-back-link.tsx`
- `src/components/admin/reseller-billing-edit.tsx`
- `src/components/admin/reseller-can-sell-config.tsx`
- `src/components/admin/reseller-card.tsx`
- `src/components/admin/reseller-commission-override-form.tsx`
- `src/components/admin/reseller-commissions-tabs.tsx`
- `src/components/admin/reseller-detail-client.tsx`
- `src/components/admin/reseller-eja-config.tsx`
- `src/components/admin/reseller-impersonate-button.tsx`
- `src/components/admin/reseller-list-client.tsx`
- `src/components/admin/reseller-list-toolbar.tsx`
- `src/components/admin/reseller-monthly-config.tsx`
- `src/components/admin/reseller-password-edit.tsx`
- `src/components/admin/reseller-payment-history.tsx`
- `src/components/admin/reseller-policy-config.tsx`
- `src/components/admin/reseller-profile.tsx`
- `src/components/admin/reseller-referral-config.tsx`
- `src/components/admin/reseller-stats-bar.tsx`
- `src/components/admin/reseller-status.tsx`
- `src/components/admin/reseller-student-count.tsx`
- `src/components/admin/reseller-subdomain-edit.tsx`
- `src/components/admin/reseller-support-notes.tsx`
- `src/components/admin/reseller-table.tsx`
- `src/components/admin/reseller-tecnica-config.tsx`
- `src/components/admin/scoped-dashboard.tsx`
- `src/components/admin/student-management-client.tsx`
- `src/components/admin/sync-payment-button.tsx`
- `src/components/admin/system-info.tsx`
- `src/components/admin/tecnica-courses-editor.tsx`
- `src/components/admin/trainings-admin-client.tsx`
- `src/components/admin/vendas-alunos-client.tsx`
- `src/components/admin/vendas-cupons-client.tsx`
- `src/components/admin/webhook-config.tsx`

### aluno (10)

- `src/components/aluno/delete-account-section.tsx`
- `src/components/aluno/emit-certificate-button.tsx`
- `src/components/aluno/payment-check-button.tsx`
- `src/components/aluno/platform-credentials-card.tsx`
- `src/components/aluno/platform-password-form.tsx`
- `src/components/aluno/student-buy-client.tsx`
- `src/components/aluno/student-password-form.tsx`
- `src/components/aluno/student-profile-form.tsx`
- `src/components/aluno/student-shell.tsx`
- `src/components/aluno/support-form.tsx`

### auth (5)

- `src/components/auth/brand-panel.tsx`
- `src/components/auth/confirmation-state.tsx`
- `src/components/auth/forgot-form.tsx`
- `src/components/auth/login-form.tsx`
- `src/components/auth/reset-password-form.tsx`

### livrecursos (2)

- `src/components/livrecursos/footer.tsx`
- `src/components/livrecursos/header.tsx`

### loja (24)

- `src/components/loja/asaas-checkout-form.tsx`
- `src/components/loja/breadcrumb.tsx`
- `src/components/loja/category-pills.tsx`
- `src/components/loja/checkout-inquiry-form.tsx`
- `src/components/loja/checkout-panel.tsx`
- `src/components/loja/confirmation-card.tsx`
- `src/components/loja/coupon-field.tsx`
- `src/components/loja/course-description.tsx`
- `src/components/loja/course-stats.tsx`
- `src/components/loja/hero-banner.tsx`
- `src/components/loja/lead-inquiry-card.tsx`
- `src/components/loja/lesson-accordion.tsx`
- `src/components/loja/mp-checkout-form.tsx`
- `src/components/loja/next-steps.tsx`
- `src/components/loja/order-summary.tsx`
- `src/components/loja/package-detail-view.tsx`
- `src/components/loja/packages-row.tsx`
- `src/components/loja/pmb-checkout-form.tsx`
- `src/components/loja/price-display.tsx`
- `src/components/loja/status-poller.tsx`
- `src/components/loja/sticky-cta.tsx`
- `src/components/loja/success-icon.tsx`
- `src/components/loja/terms-acceptance.tsx`
- `src/components/loja/visitor-tracker.tsx`

### main (51)

- `src/components/main/anim/landing-animations.tsx`
- `src/components/main/automacao-section.tsx`
- `src/components/main/autoridade-pmb.tsx`
- `src/components/main/beneficios-zigzag.tsx`
- `src/components/main/catalogo-preview.tsx`
- `src/components/main/checkout-confirmacao.tsx`
- `src/components/main/checkout-form-empresa.tsx`
- `src/components/main/checkout-form-pessoal.tsx`
- `src/components/main/checkout-payment-preview.tsx`
- `src/components/main/checkout-progress.tsx`
- `src/components/main/checkout-resumo-plano.tsx`
- `src/components/main/checkout-step-navigation.tsx`
- `src/components/main/checkout-wizard.tsx`
- `src/components/main/como-funciona-section.tsx`
- `src/components/main/como-funciona.tsx`
- `src/components/main/comparacao-tabela.tsx`
- `src/components/main/contact-form.tsx`
- `src/components/main/cta-banner-mid.tsx`
- `src/components/main/depoimentos-section.tsx`
- `src/components/main/diferenciais-cards.tsx`
- `src/components/main/eja-redirect.tsx`
- `src/components/main/faq-accordion.tsx`
- `src/components/main/formulario-interesse-revenda2.tsx`
- `src/components/main/formulario-interesse.tsx`
- `src/components/main/hero-cta.tsx`
- `src/components/main/hero-mockup.tsx`
- `src/components/main/home/course-card.tsx`
- `src/components/main/home/course-row.tsx`
- `src/components/main/home/course-thumb.tsx`
- `src/components/main/home/dynamic-home-sections.tsx`
- `src/components/main/home/eja-section.tsx`
- `src/components/main/home/hero-banner.tsx`
- `src/components/main/home/hero-slides.tsx`
- `src/components/main/home/section-renderers.tsx`
- `src/components/main/home/showcase-cards.tsx`
- `src/components/main/home/tecnica-section.tsx`
- `src/components/main/home/testimonials.tsx`
- `src/components/main/home/trust-bar.tsx`
- `src/components/main/manifesto-fundador.tsx`
- `src/components/main/numeros-bento.tsx`
- `src/components/main/planos-pmb.tsx`
- `src/components/main/planos-section.tsx`
- `src/components/main/pre-live-video.tsx`
- `src/components/main/problema-section.tsx`
- `src/components/main/qualificacao-perfil.tsx`
- `src/components/main/solucao-section.tsx`
- `src/components/main/static/legal-tenant-notice.tsx`
- `src/components/main/static/page-hero.tsx`
- `src/components/main/tecnica-redirect.tsx`
- `src/components/main/timeline-detalhada.tsx`
- `src/components/main/vantagens-quadrinhos.tsx`

### painel (70)

- `src/components/painel/account-form.tsx`
- `src/components/painel/asaas-gateway-section.tsx`
- `src/components/painel/automation-gate.tsx`
- `src/components/painel/billing-section.tsx`
- `src/components/painel/certificate-issue-form.tsx`
- `src/components/painel/certificate-layout-selector.tsx`
- `src/components/painel/certificate-template-editor.tsx`
- `src/components/painel/certificates-list.tsx`
- `src/components/painel/comunicacao-painel-client.tsx`
- `src/components/painel/config-tabs.tsx`
- `src/components/painel/copyable-text.tsx`
- `src/components/painel/coupon-card.tsx`
- `src/components/painel/coupon-grid.tsx`
- `src/components/painel/coupon-usage-table.tsx`
- `src/components/painel/course-bulk-edit.tsx`
- `src/components/painel/course-edit-drawer.tsx`
- `src/components/painel/course-list-toolbar.tsx`
- `src/components/painel/course-list-wrapper.tsx`
- `src/components/painel/create-coupon-modal.tsx`
- `src/components/painel/custom-domain-form.tsx`
- `src/components/painel/dashboard-wrapper.tsx`
- `src/components/painel/delete-account-request.tsx`
- `src/components/painel/dns-instructions.tsx`
- `src/components/painel/domain-config.tsx`
- `src/components/painel/equipe-painel-client.tsx`
- `src/components/painel/finance-bar-chart.tsx`
- `src/components/painel/finance-dashboard.tsx`
- `src/components/painel/finance-filter-bar.tsx`
- `src/components/painel/finance-payment-table.tsx`
- `src/components/painel/finance-status.tsx`
- `src/components/painel/finance-summary-cards.tsx`
- `src/components/painel/lead-detail-drawer.tsx`
- `src/components/painel/lead-kanban-column.tsx`
- `src/components/painel/lead-stage.tsx`
- `src/components/painel/leads-distribuicao-client.tsx`
- `src/components/painel/leads-kanban-board.tsx`
- `src/components/painel/message-template-editor.tsx`
- `src/components/painel/metric-cards.tsx`
- `src/components/painel/nova-revenda-form.tsx`
- `src/components/painel/onboarding-wizard.tsx`
- `src/components/painel/page-header.tsx`
- `src/components/painel/painel-catalog-tabs.tsx`
- `src/components/painel/painel-exportacoes.tsx`
- `src/components/painel/painel-nova-venda-client.tsx`
- `src/components/painel/painel-packages-client.tsx`
- `src/components/painel/painel-relatorios-client.tsx`
- `src/components/painel/pix-form.tsx`
- `src/components/painel/quick-actions.tsx`
- `src/components/painel/recent-sales.tsx`
- `src/components/painel/referral-link-copy.tsx`
- `src/components/painel/referral-payout-form.tsx`
- `src/components/painel/reseller-broadcast-form.tsx`
- `src/components/painel/revenue-chart.tsx`
- `src/components/painel/sale-status.tsx`
- `src/components/painel/security-form.tsx`
- `src/components/painel/student-detail-drawer.tsx`
- `src/components/painel/student-list-wrapper.tsx`
- `src/components/painel/student-stats-bar.tsx`
- `src/components/painel/student-status.tsx`
- `src/components/painel/student-table.tsx`
- `src/components/painel/student-toolbar.tsx`
- `src/components/painel/sub-revenda-detail.tsx`
- `src/components/painel/subdomain-display.tsx`
- `src/components/painel/tracking-form.tsx`
- `src/components/painel/training-player.tsx`
- `src/components/painel/trainings-grid.tsx`
- `src/components/painel/vitrine-config-form.tsx`
- `src/components/painel/vitrine-editor.tsx`
- `src/components/painel/vitrine-preview.tsx`
- `src/components/painel/whatsapp-connection-panel.tsx`

### placar (1)

- `src/components/placar/placar-client.tsx`

### pwa (2)

- `src/components/pwa/install-prompt.tsx`
- `src/components/pwa/sw-register.tsx`

### reports (18)

- `src/components/reports/charts/area-chart-card.tsx`
- `src/components/reports/charts/bar-chart-card.tsx`
- `src/components/reports/charts/chart-frame.tsx`
- `src/components/reports/charts/chart-tooltip.tsx`
- `src/components/reports/charts/donut-chart-card.tsx`
- `src/components/reports/charts/funnel-chart-card.tsx`
- `src/components/reports/charts/index.tsx`
- `src/components/reports/charts/line-chart-card.tsx`
- `src/components/reports/charts/sparkline.tsx`
- `src/components/reports/charts/stacked-bar-card.tsx`
- `src/components/reports/data-table.tsx`
- `src/components/reports/export-button.tsx`
- `src/components/reports/kpi-card.tsx`
- `src/components/reports/kpi-grid.tsx`
- `src/components/reports/period-filter.tsx`
- `src/components/reports/report-shell.tsx`
- `src/components/reports/report-tab-view.tsx`
- `src/components/reports/states.tsx`

### seo (1)

- `src/components/seo/json-ld.tsx`

### shared (38)

- `src/components/shared/account-credentials-fields.tsx`
- `src/components/shared/analytics-gate.tsx`
- `src/components/shared/atendimento-inbox.tsx`
- `src/components/shared/banner-slides-manager.tsx`
- `src/components/shared/certificate-html-preview.tsx`
- `src/components/shared/checkout-link.tsx`
- `src/components/shared/cookie-consent.tsx`
- `src/components/shared/course-bulk-edit.tsx`
- `src/components/shared/course-detail-view.tsx`
- `src/components/shared/cover-image-upload.tsx`
- `src/components/shared/empty-state.tsx`
- `src/components/shared/impersonate-button.tsx`
- `src/components/shared/layouts/footer-loja.tsx`
- `src/components/shared/layouts/footer-main.tsx`
- `src/components/shared/layouts/header-dashboard.tsx`
- `src/components/shared/layouts/navbar-main.tsx`
- `src/components/shared/layouts/sidebar-admin.tsx`
- `src/components/shared/layouts/sidebar-painel.tsx`
- `src/components/shared/loading-skeletons.tsx`
- `src/components/shared/notification-bell.tsx`
- `src/components/shared/notification-preferences.tsx`
- `src/components/shared/notifications-page.tsx`
- `src/components/shared/push-device-panel.tsx`
- `src/components/shared/push-prompt.tsx`
- `src/components/shared/ref-cookie-capture.tsx`
- `src/components/shared/search-autocomplete.tsx`
- `src/components/shared/status-badge.tsx`
- `src/components/shared/student-management/edit-tab.tsx`
- `src/components/shared/student-management/financial-tab.tsx`
- `src/components/shared/student-management/index.tsx`
- `src/components/shared/student-management/notes-tab.tsx`
- `src/components/shared/student-management/notify-tab.tsx`
- `src/components/shared/student-management/overview-tab.tsx`
- `src/components/shared/student-management/security-tab.tsx`
- `src/components/shared/tour/tour-runner.tsx`
- `src/components/shared/tracking-pixels-fields.tsx`
- `src/components/shared/tracking-pixels.tsx`
- `src/components/shared/tracking-purchase-event.tsx`

### ui (20)

- `src/components/ui/accordion.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/sonner.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/tooltip.tsx`

### vitrine (5)

- `src/components/vitrine/course-picker.tsx`
- `src/components/vitrine/home-sections-panel.tsx`
- `src/components/vitrine/section-editors.tsx`
- `src/components/vitrine/section-list.tsx`
- `src/components/vitrine/tabs-shell.tsx`

## Middleware / Proxy

- src/proxy.ts · matcher: [ "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)", ]
- `src/instrumentation.ts` (instrumentação Next)

## Prisma

- Models (44): User, TenantMember, Tenant, TenantSlugRedirect, TenantSupportNote, StudentNote, Course, Category, CourseCategory, CourseLesson, TenantCourse, CoursePackage, CoursePackageItem, TenantPackage, Student, Enrollment, Payment, Coupon, TenantPayment, WebhookLog, Lead, ContactMessage, Notification, PushSubscription, NotificationPreference, EmailLog, NotificationCategoryConfig, TenantNotificationOverride, SystemSettings, ReferralCommission, ReferralPayout, ReferralMonthlyCommission, CertificateTemplate, Certificate, BannerSlide, HomeSection, StudentLead, StudentLeadActivity, VisitorEvent, AutomationMessageTemplate, AuditLog, TrainingModule, TrainingVideo, TrainingProgress
- Enums (33): UserRole, TenantStatus, BillingMode, StudentStatus, ApostilaStatus, EnrollmentStatus, PaymentType, MonthlyScope, CourseVisibility, PaymentStatus, DiscountType, WebhookSource, PaymentGateway, CourseProvider, LeadStatus, ReferralCommissionStatus, ReferralPayoutMethod, ReferralPayoutStatus, CommissionMode, CommissionBracketBasis, CommissionRateType, CommissionPayoutBase, CertificateSource, CertificateLayout, ContactMessageKind, ContactMessageStatus, NotificationLevel, NotificationAudience, StudentLeadStage, StudentLeadSource, StudentLeadActivityKind, AutomationTemplateKey, VisitorEventKind
- Migrations (81): primeira `20260413_init` · última `20260702_fix_reseller_junk_price_999`

## Testes (53 arquivos · 328 casos)

- `src/lib/asaas/mother-key.test.ts`
- `src/lib/asaas/webhook.test.ts`
- `src/lib/auth/guards.test.ts`
- `src/lib/auth/roles.test.ts`
- `src/lib/auth/scope.test.ts`
- `src/lib/catalog/sync-lms.test.ts`
- `src/lib/certificates/admin-scope.test.ts`
- `src/lib/certificates/freshness.test.ts`
- `src/lib/certificates/storage.test.ts`
- `src/lib/checkout/assert-tenant-gateway.test.ts`
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
- `src/lib/errors.test.ts`
- `src/lib/home/sections.schema.test.ts`
- `src/lib/home/trust-tokens.test.ts`
- `src/lib/lms/urls.test.ts`
- `src/lib/logger.test.ts`
- `src/lib/mercadopago/installments.test.ts`
- `src/lib/mercadopago/webhook.test.ts`
- `src/lib/pmb-tenant.test.ts`
- `src/lib/redis/keys.test.ts`
- `src/lib/referrals/clawback.test.ts`
- `src/lib/referrals/commission.test.ts`
- `src/lib/referrals/payout.test.ts`
- `src/lib/referrals/tiers.test.ts`
- `src/lib/reports/bucket.test.ts`
- `src/lib/reports/format.test.ts`
- `src/lib/reports/painel-definitions.test.ts`
- `src/lib/reports/painel/tabs.test.ts`
- `src/lib/reports/period.test.ts`
- `src/lib/reports/tabs.test.ts`
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
- `src/lib/vercel/domain-status.test.ts`
- `src/lib/webhooks/lms-webhook.test.ts`
