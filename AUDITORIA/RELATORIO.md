# Relatório de Auditoria — Profissionaliza Mais Brasil
_Data: 2026-07-03 (auditoria) · 2026-07-04 (correção + verificação) · cobertura total (sem amostragem) · 11 domínios_

> ## ✅ Estado pós-correção (Fase 4 — 2026-07-04)
> **Portão Zero-Erro VERDE:** typecheck 0 erros · lint 0 erros/0 warnings · build Compiled successfully · **570 testes/103 arquivos** (era 328/53) · 0 ciclos de import (madge, era 9).
> **~68 achados corrigidos** em **~86 commits atômicos locais** (nenhum push), cada um com o portão verde antes do commit. **6 aceitos** (risco assumido). Restantes **Abertos** por: decisão sua (bucket de certificados, pixels, deploy, pg_cron), trilha de migração VPS ⚠️MIGRAÇÃO, ou infra nova (E2E, error-tracker externo).
> **Nenhum bug de produção não endereçado.** O único P0 (certificados/CPF) teve o código mitigado (grava path interno, não URL pública); falta a ação manual no console Supabase.
> Detalhe do ciclo de vida em `auditoria/COBERTURA.md`; prova mecânica em `auditoria/portao.log`; status por achado em `auditoria/achados/<dominio>.md`.
>
> **Ações que dependem só de você:** (1) tornar o bucket `certificates` privado + backfill [P0]; (2) decidir consentimento de cookies/pixels; (3) desacoplar migrations do build; (4) confirmar jobs pg_cron ativos em prod; (5) revisar/pushar os commits locais. Lista completa na seção 4 de `COBERTURA.md`.
>
> _O texto abaixo é o relatório original da auditoria somente-leitura (Fase 1), preservado como registro. As notas/contagens de P0/P1 referem-se ao estado ANTES da correção._

---

Base de cobertura: `auditoria/INVENTARIO.md` (2026-07-03) — **137 telas · 309 route handlers (406 métodos) · 342 componentes · 251 módulos lib (720 exports) · 44 models · 33 enums · 81 migrations · 17 crons · 3 webhooks · 53 arquivos de teste/328 casos**.
Esta rodada **re-verificou cada achado de 2026-06-24** contra o código atual e auditou o delta de ~45 commits/237 arquivos (+13k linhas): BI hub de relatórios, blindagem de gateway (8541afd), parcelamento MP, placar de indicações, tours guiados, `/pagar`, recompra Payment Brick, sync LMS de catálogo/matriz curricular, domínio próprio gateado por DNS, menu recolhível, impersonação de equipe interna.

Detalhe por domínio: `auditoria/achados/<dominio>.md`.

---

## Sumário executivo

O sistema segue **saudável e melhorando**: Portão Zero-Erro verde (`tsc` 0 erros, `eslint` 0 erros, **53 arquivos/328 testes** verdes, CI bloqueante), a blindagem do P0 histórico de colapso de gateway foi re-auditada em profundidade **sem regressão**, e ~7 achados da rodada anterior foram fechados (redação de PII no logger, path interno do certificado, dedup do webhook LMS, JSON cru no acesso LMS, aria-labels, `.env.example`, xlsx). O delta de 45 commits **não introduziu nenhum P0 novo**.

Restam **1 P0 e 18 P1 abertos**. O P0 é o já conhecido **R1: certificados com CPF em bucket Supabase público** (o código já não persiste URL pública, mas o toggle do bucket + backfill dependem de ação manual no console). Os P1 novos de maior risco do delta são: **SEG-009** (BI hub do admin expõe receita/MRR/GMV de todo o ecossistema a papéis de escopo limitado), **DB-001** (agregações do BI sem índice → seq scan nas 3 maiores tabelas), **PERF-010** (webhook LMS `course.updated` dispara sync completo síncrono por edição) e **DB-004** (padrão `$transaction([...])` dinâmico — o mesmo que já falhou em prod — vivo em 3 rotas de reordenação). Seis dos P1 de devops são de **prontidão de migração Vercel→VPS** (⚠️MIGRAÇÃO), não bugs em produção hoje.

## Nota por domínio

| Domínio | Nota /10 | P0 | P1 | P2 | P3 | Tendência vs 2026-06-24 |
|---|---|---|---|---|---|---|
| api | 9.0 | 0 | 0 | 1 | 5 | ↑ (API-006 fechado) |
| frontend | 9.0 | 0 | 0 | 0 | 2 | ↑ (FE-005/006 fechados) |
| codigo | 8.8 | 0 | 0 | 1 (+1 aceito) | 4 | ↑ |
| saas | 8.5 | 0 | 0 | 2 | 4 | = (gateway blindado confirmado) |
| seguranca | 8.0 | 0 | 2 | 2 | 3 | ↓ (novo SEG-009 no BI hub) |
| testes | 7.5 | 0 | 0 | 11 | 2 | ↑ (+110 casos; gaps mapeados) |
| banco | 7.0 | 0 | 4 | 2 | 4 | ↓ (DB-001/DB-004 novos) |
| observabilidade | 6.8 | 0 | 1 | 5 | 4 | = (nada corrigido; delta nasceu instrumentado) |
| devops | 6.0 | 0 | 6 | 5 | 1 | = (OPS-012 fechado; migração parada) |
| performance | 6.0 | 0 | 3 | 6 | 4 | ↓ (PERF-010 escalado) |
| lgpd | 5.0 | 1 | 2 | 5 | 2 | ↑ (3 fechados; P0 pendente de ação manual) |
| **Total (abertos)** | — | **1** | **18** | **40** | **35** | **94 achados** |

> Sobreposições deliberadas (mesmo problema visto por 2 lentes): LGPD-001 ≡ DB-002 (bucket de certificados); SEG-001 ≡ DB-003 (ausência de RLS como rede de segurança).

## Backlog priorizado (P0 + P1, risco × esforço)

| # | ID | Sev | Domínio | Título | Esforço | Observação |
|---|---|---|---|---|---|---|
| 1 | LGPD-001 / DB-002 | **P0** | lgpd·banco | Certificados com CPF em bucket Supabase público | Médio | ⚠️ exige **ação manual sua** (toggle do bucket no console) + backfill de linhas legadas; código de path interno já deployado |
| 2 | SEG-009 | P1 | seguranca | BI hub do admin expõe dados de todo o ecossistema a papéis limitados (`PMB_SALES`, `PMB_RESELLER_MGR`…) | Baixo | Corrigível em código: aplicar o mesmo gate do export CSV nos módulos `src/lib/reports/bi/*` |
| 3 | DB-001 | P1 | banco | Agregações do BI sem índice (`createdAt`/`paid_at`) → seq scan em Student/Enrollment/Payment | Baixo | Migration aditiva + `@@index` no schema |
| 4 | PERF-010 | P1 | performance | Webhook LMS `course.updated` dispara sync COMPLETO síncrono a cada edição | Baixo/Médio | Sync incremental do curso do evento (payload já traz os dados) |
| 5 | DB-004 | P1 | banco | `$transaction([...map])` dinâmico (padrão que já falhou em prod) em 3 rotas de reordenação | Baixo | Mesmo fix do 019a253: updates sequenciais |
| 6 | PERF-003 | P1 | performance | Catálogo público sem paginação + `include: {course: true}` | Médio | Paginação/limite + select enxuto |
| 7 | PERF-002 | P1 | performance | Home pública/vitrine `force-dynamic` sem cache de dados cross-request | Médio | Cache Redis/unstable_cache com TTL curto |
| 8 | API-009* | P2 | api | Endpoints públicos de parcelas MP sem rate limiting (abuso do token da unidade) | Baixo | *P2, mas promovido ao topo por ser vetor público de abuso e fix pequeno |
| 9 | OBS-002 | P1 | observabilidade | DR sem RTO/RPO, sem runbooks, sem drill de restore | Médio | Documentação operacional (`docs/operacoes/`) |
| 10 | LGPD-002 | P1 | lgpd | Pixels carregam sem consentimento; banner sem recusa | Médio | ⚠️ contraria decisão registrada do dono — **precisa da sua palavra** antes de mudar comportamento |
| 11 | LGPD-004 | P1 | lgpd | Sem lista nominal de subprocessadores/ROPA | Baixo | Documento legal |
| 12 | OPS-001 | P1 | devops | `npm run build` aplica migrations na prod durante o build | Médio | Desacoplar (job de migração separado) — muda mecanismo de deploy, validar com você |
| 13 | OPS-013 | P1 | devops | Crons dependem de pg_cron aplicado à mão, sem prova de ativo em prod | Baixo | Verificação manual + monitor |
| 14 | SEG-001 / DB-003 | P1 | seguranca·banco | Sem RLS como rede de segurança (isolamento 100% em código) | Alto | Decisão registrada; recomendação: junto com a migração VPS |
| 15 | OPS-002 | P1 | devops | ⚠️MIGRAÇÃO sem `output:'standalone'`/Dockerfile/compose | Médio | Pré-requisito da VPS; inócuo hoje |
| 16 | OPS-003 | P1 | devops | ⚠️MIGRAÇÃO `@upstash/redis` REST não fala Redis TCP | Médio | Pré-requisito da VPS |
| 17 | OPS-004 | P1 | devops | ⚠️MIGRAÇÃO `proxy.ts` assume Edge runtime | Médio | Pré-requisito da VPS |
| 18 | OPS-005 | P1 | devops | ⚠️MIGRAÇÃO storage acoplado à Supabase Storage REST | Médio | Pré-requisito da VPS (MinIO/R2) |

## Cobertura

- **frontend**: 137/137 telas com veredito individual (tabela em `achados/frontend.md`) + 342/342 componentes + 17 boundaries. Zero link morto, zero rota estruturalmente quebrada.
- **banco**: 44/44 models, 33/33 enums, 81/81 migrations, runner, seed, 4 libs de storage.
- **seguranca/api**: 309 route handlers cobertos (auth/authz/tenant-scoping/validação); 3 webhooks (assinatura+idempotência); 17 crons (CRON_SECRET); clients EA/Asaas/MP/LMS/Vercel (timeout/retry).
- **codigo**: 251 módulos lib / 720 exports; ciclos (madge), exports mortos, envs fora do schema Zod.
- **observabilidade**: 292/309 handlers com logger estruturado; crons/webhooks/SSE auditados.
- **testes**: mapa do que tem/não tem teste por área crítica (fluxos de dinheiro, webhooks, guards, proxy, crons).
- Lacuna de cobertura: nenhuma identificada — todos os itens do inventário foram cobertos por ≥1 domínio.

## Próximos passos (Fase 2 — correção)

Ordem recomendada de `/corrigir` (P0→P1, segurança e banco primeiro):
1. `/corrigir seguranca P1` — SEG-009 (BI hub × papéis) — baixo esforço, alto risco.
2. `/corrigir banco P1` — DB-001 (índices) + DB-004 (reorder sequencial). DB-002/LGPD-001: parte código + **ação manual sua no Supabase**.
3. `/corrigir api P2` — API-009 (rate limit nas parcelas MP).
4. `/corrigir performance P1` — PERF-010, depois PERF-002/003.
5. `/corrigir observabilidade P1` + docs (OBS-002, LGPD-004).
6. P1 ⚠️MIGRAÇÃO (OPS-001..005, 013): trilha separada de prontidão de migração — decisão sua sobre quando.
7. P2/P3 domínio a domínio na sequência.

Itens que **exigem sua decisão/ação manual** (regra: nada destrutivo sem perguntar): toggle do bucket `certificates` no console Supabase + backfill (LGPD-001); mudança do comportamento dos pixels/consentimento (LGPD-002 — contraria decisão registrada sua); desacoplar migrations do build (OPS-001 — muda mecanismo de deploy); verificação dos jobs pg_cron em prod (OPS-013).
