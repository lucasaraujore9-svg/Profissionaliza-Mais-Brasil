# Matriz de Cobertura — Profissionaliza Mais Brasil
_2026-06-24 · prova de cobertura total (sem amostragem) + estado das correções da Fase 2._

Base: `auditoria/INVENTARIO.md`. Cada categoria do inventário recebeu veredito por ≥1 domínio na Fase 1 (cada `achados/<dominio>.md` traz sua seção **Cobertura** item-a-item). Esta matriz consolida.

## 1. Cobertura do inventário (Fase 1)

| Categoria do inventário | Total | Domínio(s) que deram veredito | Cobertos | Lacuna |
|---|---|---|---|---|
| Telas (`page.tsx` → URL) | 131 | frontend (estados/links), seguranca (authz de página) | 131/131 | — |
| Route handlers (`route.ts`) | 294 | seguranca (authz/tenant), api (Zod/idempotência), performance | 294/294 | — |
| Métodos HTTP | 390 | idem | 390/390 | — |
| Componentes | 324 | frontend | 324/324 (por pasta/uso) | — |
| Módulos `lib/` | 193 | codigo, seguranca, performance | 193/193 (por área) | — |
| Server Actions | 4 | seguranca, codigo | 4/4 | — |
| Models Prisma | 44 | banco, saas | 44/44 | — |
| Migrations | 75 | banco, devops | 75/75 (runner + idempotência) | — |
| Crons | 16 | api, performance, saas, observabilidade, devops | 16/16 | — |
| Webhooks | 3 | api, saas, observabilidade | 3/3 | — |
| Testes | 37 arq./218 casos | testes | 37/37 | gaps E2E/integração mapeados (QA-006/010/012) |
| Middleware (`proxy.ts`) | 1 | seguranca, devops, performance, saas | 1/1 | — |

**Veredito de cobertura:** nenhuma área do inventário ficou sem auditor. Itens N/A documentados em cada `achados/*.md` (ex.: SSRF/SQLi/CORS = N/A em seguranca; `COURSE_HAS_PRICE` = N/A em testes por ser `Prisma.WhereInput` declarativo).

Cobertura reportada por cada auditor (coberto/relevante):
seguranca 294/294 · banco 44/44 · codigo 294/294 · performance 62/62 · observabilidade 24/24 · frontend 131/131 · api 294/294 · devops 22/22 · saas 61/63 (2 gaps residuais de audit-trail, ambos com achado aberto) · lgpd 28/28 · testes 12/12.

## 2. Estado das correções (Fase 2)

| ID | Sev | Estado | Commit / Nota |
|---|---|---|---|
| DB-001 = LGPD-001 | P0 | **RESOLVIDO + verificado em prod (2026-06-24)** | Bucket já `public=false`; URL pública→HTTP 400, download/sign→200. + `11bf3c0` (pdfUrl→path, defesa em profundidade). R1 da matriz está stale |
| PERF-002 | P1 | **Corrigido** | `d5d7a0a` (home sections em paralelo) |
| COD-006 | P2 | **Corrigido** | `65f8ec6` (swallow no fluxo financeiro) |
| FE-005 | P2 | **Corrigido** | `1bd1995` (redirect amigável no acesso LMS) |
| LGPD-010 | P3 | **Corrigido** | `dd86dc1` (redação email/telefone/senha no logger) |
| SEG-008 = OPS-012 | P3 | **Corrigido** | `d44c865` (.env.example sync) |
| FE-006 | P3 | **Corrigido** | `efccfcd` (aria-label security-tab) |
| API-006 (+QA-011 parcial) | P3 | **Corrigido** | `3b894a2` (idempotência LMS por hash de conteúdo) |
| SEG-001 = DB-002 (RLS) | P1 | **Aberto** — arquitetural | ACOES-MANUAIS §2 (sua decisão) |
| OPS-001 (build↔migrations) | P1 | **Aberto** — deploy | ACOES-MANUAIS §3 (sua decisão) |
| OBS-002 (DR/runbook) | P1 | **Aberto** — doc | ACOES-MANUAIS §6 (posso redigir) |
| LGPD-004 (ROPA) | P1 | **Aberto** — doc | ACOES-MANUAIS §6 (posso redigir) |
| LGPD-002 (consentimento) | P1 | **Aberto** — decisão de produto | ACOES-MANUAIS §5 |
| PERF-003 (paginação catálogo) | P1 | **Aberto** — UX/escala | recipe em achados/performance.md |
| OPS-002/003/004/005 | P1 | **Aberto** — ⚠️MIGRAÇÃO | pré-cutover; RELATORIO §⚠️MIGRAÇÃO |
| QA-010, QA-012 | P2 | **Aberto** — teste | recipes em achados/testes.md |
| Demais P2/P3 | P2/P3 | **Aberto** — backlog | receita em cada `achados/<dominio>.md` |

## 3. Cobertura de telas/rotas (foco da missão: "sem telas/rotas quebradas")

- **Build limpo:** `next build` compila as 131 telas + 294 handlers (Portão verde — `portao.log`). Nenhuma rota/página quebrada em build.
- **Link morto:** frontend reportou 0 links mortos (os 4 achados de link/rota de 2026-06-20 já estavam corrigidos).
- **Tela quebrada corrigida:** FE-005 (acesso a curso LMS exibia JSON cru ao aluno) — fechada.
- **Estados (loading/erro/vazio):** `loading.tsx` 5 · `error.tsx` 5 · `not-found.tsx` 6 · `global-error` 1; achados residuais são P2/P3, nenhum quebra a tela.
- **authz/tenant nos handlers:** 294/294 sem IDOR por input (tenant derivado da sessão).

## 4. Conclusão

Cobertura total **comprovada**: todo item do inventário recebeu veredito; nada ficou sem auditor. A Fase 2 fechou o P0 (parte de código) + 1 P1 + 6 P2/P3; o restante está **Aberto com receita** (`achados/*.md`) ou **depende de você** (`ACOES-MANUAIS.md`). Portão Zero-Erro verde após cada correção (`portao.log`).
