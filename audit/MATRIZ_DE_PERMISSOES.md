# Matriz de Permissões — PMB (2026-05-28)

Papéis: **SUPER_ADMIN**, **PMB_SALES**, **PMB_RESELLER_MGR** (gerente de revendedores),
**RESELLER** (owner ou consultor via `TenantMember`), **STUDENT**, **Público** (anônimo).
Camadas de proteção: **UI** (layout/componente), **API** (guard em route handler), **DB/RLS**.
> ⚠ **DB/RLS = AUSENTE em todo o sistema** (Prisma conecta como owner). Não há terceira camada.
> Toda autorização depende de UI + API. Um esquecimento de guard/filtro = vazamento direto.

| Recurso / Ação | Público | STUDENT | RESELLER | PMB_SALES | PMB_RESELLER_MGR | SUPER_ADMIN | Proteção UI | Proteção API | DB/RLS | Risco |
|---|---|---|---|---|---|---|---|---|---|---|
| Vitrine pública (loja, curso, checkout) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | rate-limit (loja) | ❌ | OK (público intencional) |
| `/api/checkout` (PMB) criar cobrança | ✅ | ✅ | — | — | — | — | n/a | **sem rate-limit** | ❌ | **R9 Alto** |
| Login (User/Student) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | form | Credentials + RL fail-closed prod | ❌ | OK |
| Área do aluno (`/aluno/*`) — ver próprios cursos/pagamentos | ❌ | ✅ (próprios) | ❌ | ❌ | ❌ | ❌ | layout server | `auth()` + filtro `studentId`/`tenantId` da sessão | ❌ | OK (sem IDOR na amostra) |
| Aluno: excluir própria conta/dados | ❌ | ❌ **não existe** | — | — | — | — | — | — | — | **R13 Alto (LGPD)** |
| Painel revendedor (`/painel/*`) — gestão da própria loja | ❌ | ❌ | ✅ (próprio tenant) | ❌ | ❌ | ❌ | layout server | guards + `where tenantId` da sessão | ❌ | OK |
| Painel: alunos/cupons/cursos `[id]` (ler/editar/deletar) | ❌ | ❌ | ✅ (próprio tenant) | ❌ | ❌ | ❌ | UI | filtro por `tenantId` da sessão | ❌ | OK (confirmado sem IDOR) |
| Consultor (TenantMember) — desconto até `maxDiscount` | ❌ | ❌ | ✅ (cap) | — | — | — | UI | cap validado server-side | ❌ | OK |
| Admin (`/admin/*`) área geral | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | layout server (role) | guards PMB | ❌ | OK |
| `admin/revendedores/[id]/status` (suspender/ativar) | ❌ | ❌ | ❌ | ⚠️ **qualquer tenant** | ⚠️ **qualquer tenant** | ✅ | UI | `requireAdminSession` (sem `accountManagerId`) | ❌ | **R4 Alto** |
| `admin/revendedores/[id]/policy` e `/billing` | ❌ | ❌ | ❌ | ⚠️ **qualquer tenant** | ⚠️ **qualquer tenant** | ✅ | UI | sem scoping | ❌ | **R4 Alto** |
| `admin/cupons` criar (cap de desconto) | ❌ | ❌ | ❌ | ✅ (50% PERCENTAGE) | ✅ | ✅ | UI | cap só p/ PERCENTAGE; **FIXED burla** | ❌ | **R6 Alto** |
| `admin/certificates/[id]/revoke` | ❌ | ❌ | ❌ | ⚠️ cross-scope | ⚠️ | ✅ | UI | `findUnique({id})` sem `tenantId:null` | ❌ | **R24 Médio** |
| Impersonar revendedor (`revendedores/[id]/impersonate`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | UI | HMAC + só SUPER_ADMIN + audit | ❌ | OK |
| `admin/equipe` (CRUD usuários PMB, atribuir tenants) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | UI | `requireSuperAdmin` + last-super-admin guard | ❌ | OK |
| Trocar senha obrigatória (`alterar-senha-inicial`) | ❌ | ✅/User | ✅ | ✅ | ✅ | ✅ | form | sessão; **sem rate-limit / sem senha atual** | ❌ | **R11 Alto** |
| `mustChangePassword` enforcement | — | — | — | — | — | — | **só UI** | **não enforced em guard/layout** | ❌ | **R22 Médio** |
| `GET /api/cobranca/[paymentId]` (status cobrança) | ✅ (com id) | — | — | — | — | — | n/a | só `isKnownAsaasPayment` (sem token/dono) | ❌ | **R21 Médio (IDOR info)** |
| Certificado PDF (Storage) | ✅ **anônimo** | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | **bucket público, sem auth, sem RL** | ❌ | **R1 Crítico** |
| Webhooks (asaas/mp) | ✅ (assinado) | — | — | — | — | — | n/a | token/HMAC validado | ❌ | OK (forja refutada) |
| Crons (`/api/cron/*`) | ✅ (com secret) | — | — | — | — | — | n/a | `CRON_SECRET` | ❌ | OK |
| `internal/resolve-tenant` | ✅ (com secret) | — | — | — | — | — | n/a | `INTERNAL_SECRET` + RL + validação | ❌ | OK |

## Observações
- **30 de 200 rotas** não referenciam mecanismo de auth — todas classificadas como públicas
  intencionais (loja, webhooks, leads, cadastro de revendedor, push/public-key, health,
  metrics/public) ou gated por token/HMAC (cobranca, internal, cron). Nenhuma rota `admin/*`
  ou `painel/*` **mutadora** ficou desprotegida. Duas rotas descontinuadas retornam 410.
- **Fortalezas confirmadas:** preços calculados server-side (sem tampering pelo cliente);
  cap de cupom PERCENTAGE e `maxDiscount` validados no servidor; proteção do "último
  SUPER_ADMIN"; impersonation só-SUPER_ADMIN com HMAC e audit; layouts checam role server-side;
  proxy sanitiza headers de tenant; filtros `where tenantId` consistentes em painel/aluno.
- **Fraqueza estrutural:** ausência de DB/RLS como terceira camada (R3) — qualquer das fraquezas
  acima vira vazamento sem rede de proteção.
